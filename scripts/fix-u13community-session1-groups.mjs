// U13 Community EFHA (category 97) ONLY, session 1 ONLY: correct the group
// assignments and positions damaged by importing "U13TimedSkateUpload
// 2026-Aug30.csv" before the Scrimmage-Team-on-a-standard-category fix
// existed (see athletes/route.js's new branch, and rosterImport.js's
// forward_defense idempotency fix).
//
// What went wrong: the CSV's "Scrimmage Team" column ("Group A"/"B"/"C"/"D")
// was silently discarded for this standard-format category, so all 105 new
// players imported with no group info; the existing auto-place fallback then
// scattered them round-robin across the 4 pre-existing session-1 groups with
// no relation to the file's real groups. Separately, every "Forward -
// Defense" player imported with position = null (double-normalization bug,
// now fixed).
//
// This script re-reads the ORIGINAL CSV as the source of truth and:
//   1. Moves each of the 105 already-imported players into the session-1
//      group their CSV row actually named (A->1, B->2, C->3, D->4).
//   2. Fixes position for anyone whose CSV row said "Forward - Defense" but
//      is currently null.
//   3. Adds the 2 players confirmed present in the CSV but never created in
//      category 97 at all (Eva Szabunia, Liana Vaziri -- both already exist
//      in U13 AA, category 113, but were missing here), with their correct
//      group and position.
//
//   node scripts/fix-u13community-session1-groups.mjs            # dry run
//   node scripts/fix-u13community-session1-groups.mjs --commit   # apply
//
// Hard-scoped to category 97, session 1. Refuses to run against anything else.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const CAT = 97;
const CSV_PATH = String.raw`C:\Users\DA Waschuk\Downloads\U13TimedSkateUpload 2026-Aug30.csv`;
const GROUP_LETTER_TO_NUMBER = { A: 1, B: 2, C: 3, D: 4 };

const [cat] = await sql`SELECT id, name, organization_id, eval_format FROM age_categories WHERE id = ${CAT}`;
if (!cat || !/U13 Community/i.test(cat.name)) { console.error(`Refusing: category ${CAT} is not U13 Community`); process.exit(1); }
console.log(`category   ${cat.id} — ${cat.name} (${cat.eval_format}, org ${cat.organization_id})`);

const raw = readFileSync(CSV_PATH, "utf8");
const lines = raw.split("\r").filter(l => l.trim());
const rows = lines.slice(1).map(l => {
  const c = l.split(",");
  return {
    first_name: c[0], last_name: c[1], birth_year: c[3], position_raw: c[4],
    parent_email: c[5], parent_email_2: c[6], group_label: c[c.length - 1],
  };
});
console.log(`csv rows   ${rows.length}`);

function normalizePositionLocal(val) {
  const v = (val || "").toLowerCase().trim().replace(/\s*[/-]\s*/g, "/");
  if (!v || v === "player" || v === "skater") return null;
  const map = {
    f: "forward", forward: "forward", fwd: "forward", fw: "forward",
    d: "defense", def: "defense", defense: "defense", defence: "defense",
    g: "goalie", gk: "goalie", goalie: "goalie",
    "forward/defense": "forward_defense", "defense/forward": "forward_defense",
  };
  return map[v] || null;
}

const [{ id: session1FirstGroupId }] = await sql`SELECT id FROM session_groups WHERE age_category_id = ${CAT} AND session_number = 1 ORDER BY group_number LIMIT 1`;
if (!session1FirstGroupId) { console.error("No session 1 groups exist for category 97 -- nothing to correct into."); process.exit(1); }
const groupIdByNumber = {};
for (const g of await sql`SELECT id, group_number FROM session_groups WHERE age_category_id = ${CAT} AND session_number = 1`) {
  groupIdByNumber[g.group_number] = g.id;
}
console.log(`groups     session 1: ${JSON.stringify(groupIdByNumber)}`);

const dbAthletes = await sql`SELECT id, first_name, last_name, position FROM athletes WHERE age_category_id = ${CAT}`;
const dbByName = new Map(dbAthletes.map(a => [`${a.first_name} ${a.last_name}`.toLowerCase(), a]));
// Encoding artifact: "Chlo_" in the CSV is "Chloe" in the DB (an accented
// character lost on export). Handled as a one-off alias, not a general rule.
const NAME_ALIASES = { "chlo_ kellman murphy": "chloe kellman murphy" };

const currentAssignments = await sql`
  SELECT pga.athlete_id, sg.group_number
  FROM player_group_assignments pga JOIN session_groups sg ON sg.id = pga.session_group_id
  WHERE sg.age_category_id = ${CAT} AND sg.session_number = 1`;
const currentGroupByAthlete = new Map(currentAssignments.map(r => [r.athlete_id, r.group_number]));

let moves = 0, positionFixes = 0, toCreate = [], unresolved = [];

for (const row of rows) {
  const letter = (row.group_label || "").replace(/^group\s+/i, "").trim().toUpperCase();
  const wantGroupNum = GROUP_LETTER_TO_NUMBER[letter];
  if (!wantGroupNum) { unresolved.push(row); continue; }

  const key = `${row.first_name} ${row.last_name}`.toLowerCase();
  const aliasedKey = NAME_ALIASES[key] || key;
  const athlete = dbByName.get(aliasedKey);
  const wantPosition = normalizePositionLocal(row.position_raw);

  if (!athlete) {
    toCreate.push({ ...row, wantGroupNum, wantPosition });
    continue;
  }

  const currentGroupNum = currentGroupByAthlete.get(athlete.id);
  if (currentGroupNum !== wantGroupNum) {
    moves++;
    console.log(`${COMMIT ? "MOVE " : "would move "}${athlete.first_name} ${athlete.last_name}: group ${currentGroupNum ?? "none"} -> ${wantGroupNum}`);
    if (COMMIT) {
      const targetGroupId = groupIdByNumber[wantGroupNum];
      await sql`DELETE FROM player_group_assignments WHERE athlete_id = ${athlete.id} AND session_group_id IN (SELECT id FROM session_groups WHERE age_category_id = ${CAT} AND session_number = 1)`;
      await sql`INSERT INTO player_group_assignments (athlete_id, session_group_id, display_order) VALUES (${athlete.id}, ${targetGroupId}, 0) ON CONFLICT (athlete_id, session_group_id) DO NOTHING`;
    }
  }

  if (wantPosition && athlete.position !== wantPosition) {
    positionFixes++;
    console.log(`${COMMIT ? "FIX  " : "would fix "}${athlete.first_name} ${athlete.last_name}: position ${athlete.position ?? "null"} -> ${wantPosition}`);
    if (COMMIT) {
      await sql`UPDATE athletes SET position = ${wantPosition} WHERE id = ${athlete.id}`;
    }
  }
}

console.log(`\nunresolved group labels: ${unresolved.length}`);
for (const r of unresolved) console.log(`  ${r.first_name} ${r.last_name}: "${r.group_label}"`);

console.log(`\nto create (in CSV, never added to category 97): ${toCreate.length}`);
for (const r of toCreate) {
  console.log(`  ${COMMIT ? "CREATE " : "would create "}${r.first_name} ${r.last_name} -- group ${r.wantGroupNum}, position ${r.wantPosition ?? "null"}`);
  if (COMMIT) {
    const [inserted] = await sql`
      INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, position, birth_year, parent_email, parent_email_2, is_active)
      VALUES (${cat.organization_id}, ${CAT}, ${r.first_name}, ${r.last_name}, ${r.wantPosition}, ${parseInt(r.birth_year) || null}, ${r.parent_email || null}, ${r.parent_email_2 || null}, true)
      RETURNING id`;
    const targetGroupId = groupIdByNumber[r.wantGroupNum];
    await sql`INSERT INTO player_group_assignments (athlete_id, session_group_id, display_order) VALUES (${inserted.id}, ${targetGroupId}, 0)`;
  }
}

console.log(`\n${COMMIT ? "APPLIED" : "DRY RUN"} — ${moves} group move(s), ${positionFixes} position fix(es), ${toCreate.length} new athlete(s) created.`);
if (!COMMIT) console.log("Re-run with --commit to apply.");
