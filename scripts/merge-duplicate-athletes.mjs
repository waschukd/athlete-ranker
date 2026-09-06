// Merge duplicate athlete rows within a category into one.
//
//   node scripts/merge-duplicate-athletes.mjs --cat 65
//   node scripts/merge-duplicate-athletes.mjs --cat 65 --commit
//
// A duplicate is two rows in the SAME category with the same name. Re-importing
// a roster after cuts creates them: BAHA's U11 House ended up with an Aug 28 row
// and a Sep 5 row for eight kids.
//
// NOT a duplicate, and never touched: the same person in two DIFFERENT
// categories. That is what a cut-and-move produces -- the AA row keeps the AA
// scores, the House row is their new division. Merging those would destroy a
// player's evaluation history.
//
// Keeper is the OLDEST row, since anything already pointing at an athlete points
// at that one. Any field the keeper is missing is backfilled from the loser, so
// a later import that filled in a position is not thrown away.
//
// REFUSES to merge a pair where either row has scores or a completed check-in --
// that needs a human decision about which record is real, not a script.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const ci = process.argv.indexOf("--cat");
const CAT = ci > -1 ? parseInt(process.argv[ci + 1]) : null;
if (!CAT) { console.error("Usage: --cat <categoryId> [--commit]"); process.exit(1); }

const [cat] = await sql`SELECT id, name, organization_id FROM age_categories WHERE id = ${CAT}`;
if (!cat) { console.error(`No category ${CAT}`); process.exit(1); }
console.log(`category ${cat.id} — ${cat.name}\n`);

// A misspelling is still a duplicate but no name match will find it (Crypton
// Snider vs Snyder). --pair keeper,loser merges a specific two through the
// same safety checks and the same backfill.
const pi = process.argv.indexOf("--pair");
const PAIR = pi > -1 ? String(process.argv[pi + 1] || "").split(",").map(n => parseInt(n.trim())) : null;

const groups = PAIR && PAIR.length === 2 && PAIR.every(Number.isFinite)
  ? [{ f: "(explicit", l: "pair)", ids: PAIR }]
  : await sql`
  SELECT LOWER(TRIM(first_name)) AS f, LOWER(TRIM(last_name)) AS l, ARRAY_AGG(id ORDER BY id) AS ids
  FROM athletes WHERE age_category_id = ${CAT}
  GROUP BY 1,2 HAVING COUNT(*) > 1 ORDER BY 2,1`;

if (!groups.length) { console.log("No duplicates."); process.exit(0); }

// Fields worth rescuing from the row being removed.
const FIELDS = ["position", "helmet_number", "external_id", "parent_email", "parent_email_2",
  "parent_phone", "birth_year", "date_of_birth", "emergency_contact", "notes", "jersey_number"];

let merged = 0, blocked = 0;

for (const g of groups) {
  const fetched = await sql`SELECT * FROM athletes WHERE id = ANY(${g.ids})`;
  // An explicit pair is given keeper-first on purpose (the surviving spelling
  // may not be the older row); a name-matched group keeps the oldest.
  const rows = PAIR
    ? g.ids.map(id => fetched.find(r => r.id === id)).filter(Boolean)
    : [...fetched].sort((a, b) => a.id - b.id);
  if (rows.length < 2) { console.log(`SKIP  ids ${g.ids.join(",")} — could not load both rows`); blocked++; continue; }
  const keeper = rows[0];
  const losers = rows.slice(1);

  // Safety: anything with real evaluation data is not a mechanical merge.
  let unsafe = null;
  for (const r of rows) {
    const [c] = await sql`
      SELECT (SELECT COUNT(*)::int FROM category_scores WHERE athlete_id=${r.id}) AS scores,
             (SELECT COUNT(*)::int FROM player_checkins WHERE athlete_id=${r.id} AND checked_in) AS checked_in`;
    if (c.scores > 0 || c.checked_in > 0) unsafe = `id ${r.id} has ${c.scores} scores and ${c.checked_in} completed check-in(s)`;
  }
  if (unsafe) {
    console.log(`SKIP  ${g.l}, ${g.f} — ${unsafe}. Needs a human decision.`);
    blocked++;
    continue;
  }

  const backfill = {};
  for (const f of FIELDS) {
    if (keeper[f] == null || keeper[f] === "") {
      const donor = losers.find(l => l[f] != null && l[f] !== "");
      if (donor) backfill[f] = donor[f];
    }
  }

  console.log(`MERGE ${g.l}, ${g.f}: keep ${keeper.id} (${keeper.created_at.toISOString().split("T")[0]}), remove ${losers.map(l => l.id).join(", ")}`);
  if (Object.keys(backfill).length) console.log(`      backfilling from removed row: ${Object.entries(backfill).map(([k, v]) => `${k}=${v}`).join(", ")}`);

  if (!COMMIT) { merged++; continue; }

  for (const [f, v] of Object.entries(backfill)) {
    await sql`UPDATE athletes SET ${sql.unsafe(`"${f}"`)} = ${v} WHERE id = ${keeper.id}`;
  }

  for (const loser of losers) {
    // Move child rows the keeper does not already have; drop the rest, since a
    // duplicate's copy carries nothing the keeper's does not.
    // Move only when the keeper has no group for that SESSION. Matching on the
    // group id alone double-booked a player who was in G2 on the keeper and G3
    // on the duplicate -- they then appeared on two check-in lists for the same
    // session, which is the very problem this script is meant to remove.
    await sql`
      UPDATE player_group_assignments pga SET athlete_id = ${keeper.id}
      FROM session_groups sg
      WHERE pga.athlete_id = ${loser.id} AND sg.id = pga.session_group_id
        AND NOT EXISTS (
          SELECT 1 FROM player_group_assignments x
          JOIN session_groups xs ON xs.id = x.session_group_id
          WHERE x.athlete_id = ${keeper.id} AND xs.session_number = sg.session_number)`;
    await sql`DELETE FROM player_group_assignments WHERE athlete_id = ${loser.id}`;

    // Same rule for check-in rows: one per session, or the player shows up on
    // two doors at once.
    await sql`
      UPDATE player_checkins pc SET athlete_id = ${keeper.id}
      FROM evaluation_schedule es
      WHERE pc.athlete_id = ${loser.id} AND es.id = pc.schedule_id
        AND NOT EXISTS (
          SELECT 1 FROM player_checkins x
          JOIN evaluation_schedule xe ON xe.id = x.schedule_id
          WHERE x.athlete_id = ${keeper.id} AND xe.session_number = es.session_number)`;
    await sql`DELETE FROM player_checkins WHERE athlete_id = ${loser.id}`;

    await sql`
      UPDATE scrimmage_team_members m SET athlete_id = ${keeper.id}
      WHERE m.athlete_id = ${loser.id}
        AND NOT EXISTS (SELECT 1 FROM scrimmage_team_members x
                        WHERE x.athlete_id = ${keeper.id} AND x.scrimmage_team_id = m.scrimmage_team_id)`;
    await sql`DELETE FROM scrimmage_team_members WHERE athlete_id = ${loser.id}`;

    // These have no uniqueness to trip over — just re-point them.
    for (const t of ["category_scores", "player_notes", "athlete_flags", "testing_results"]) {
      try { await sql`UPDATE ${sql.unsafe(t)} SET athlete_id = ${keeper.id} WHERE athlete_id = ${loser.id}`; }
      catch (e) { console.log(`      (${t}: ${e.message})`); }
    }

    await sql`DELETE FROM athletes WHERE id = ${loser.id}`;
  }
  merged++;
}

const [after] = await sql`SELECT COUNT(*)::int AS n FROM athletes WHERE age_category_id = ${CAT}`;
console.log(COMMIT
  ? `\nmerged ${merged}, skipped ${blocked}. Category now has ${after.n} athletes.`
  : `\nDRY RUN — would merge ${merged}, skip ${blocked}. Re-run with --commit.`);
