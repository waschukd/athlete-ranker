// Turn on "carry jersey numbers between sessions" for VMHA, and backfill the
// numbers already missing from sessions that have no scores yet.
//
//   node scripts/vmha-sticky-jerseys.mjs            (preview)
//   node scripts/vmha-sticky-jerseys.mjs --commit
//
// The setting only pre-fills at check-in time, so turning it on helps future
// sessions but leaves rows the door has already opened sitting blank. VMHA had
// been losing ground each skate -- U11 M went 26 numbered, then 25, then 16 --
// so this also fills in what is already missing, taking each player's most
// recent earlier number.
//
// Same guard rails as the live prefill: never touches a player already checked
// in, and never overwrites a number that is already set.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const ORG = 70;

const cats = await sql`SELECT id, name, eval_format, sticky_jersey_numbers FROM age_categories WHERE organization_id = ${ORG} ORDER BY id`;
const state = await sql`
  SELECT c.id cat, c.name, es.session_number sn, COUNT(*)::int rows,
    COUNT(p.jersey_number)::int numbered,
    COUNT(*) FILTER (WHERE p.checked_in)::int checked_in
  FROM player_checkins p
  JOIN evaluation_schedule es ON es.id = p.schedule_id
  JOIN age_categories c ON c.id = es.age_category_id
  WHERE c.organization_id = ${ORG} GROUP BY 1, 2, 3 ORDER BY 1, 3`;

console.log("VMHA -- carry jersey numbers between sessions\n");
for (const c of cats) console.log(`  ${c.name.padEnd(7)} ${c.eval_format.padEnd(12)} setting: ${c.sticky_jersey_numbers ? "on" : "OFF -> on"}`);
console.log("\n  numbers on file today:");
for (const s of state) console.log(`     ${s.name.padEnd(7)} S${s.sn}  ${s.numbered}/${s.rows} numbered${s.checked_in ? `, ${s.checked_in} already checked in` : ""}`);

// What a backfill would fill: a blank number on a not-yet-checked-in row where
// the same player has a number in an EARLIER session.
const fillable = await sql`
  SELECT c.name, es.session_number sn, COUNT(*)::int n
  FROM player_checkins p
  JOIN evaluation_schedule es ON es.id = p.schedule_id
  JOIN age_categories c ON c.id = es.age_category_id
  WHERE c.organization_id = ${ORG} AND p.jersey_number IS NULL AND p.checked_in IS NOT TRUE
    AND EXISTS (
      SELECT 1 FROM player_checkins q JOIN evaluation_schedule e2 ON e2.id = q.schedule_id
      WHERE q.athlete_id = p.athlete_id AND e2.age_category_id = es.age_category_id
        AND e2.session_number < es.session_number AND q.jersey_number IS NOT NULL)
  GROUP BY 1, 2 ORDER BY 1, 2`;
console.log("\n  blanks that can be filled from an earlier session:");
if (!fillable.length) console.log("     none");
for (const f of fillable) console.log(`     ${f.name.padEnd(7)} S${f.sn}  ${f.n}`);

if (!COMMIT) { console.log("\nPREVIEW ONLY -- nothing written. Re-run with --commit to apply."); process.exit(0); }

for (const c of cats) {
  await sql`UPDATE age_categories SET sticky_jersey_numbers = true WHERE id = ${c.id}`;
  console.log(`${c.name}: setting on`);
}

const filled = await sql`
  UPDATE player_checkins p
  SET jersey_number = src.jersey_number
  FROM (
    SELECT DISTINCT ON (q.athlete_id, es.age_category_id, tgt.session_number)
      q.athlete_id, tgt.id AS target_schedule, q.jersey_number
    FROM player_checkins q
    JOIN evaluation_schedule es ON es.id = q.schedule_id
    JOIN evaluation_schedule tgt ON tgt.age_category_id = es.age_category_id AND tgt.session_number > es.session_number
    JOIN age_categories c ON c.id = es.age_category_id
    WHERE c.organization_id = ${ORG} AND q.jersey_number IS NOT NULL
    ORDER BY q.athlete_id, es.age_category_id, tgt.session_number, es.session_number DESC
  ) src
  WHERE p.athlete_id = src.athlete_id AND p.schedule_id = src.target_schedule
    AND p.jersey_number IS NULL AND p.checked_in IS NOT TRUE
  RETURNING p.id`;
console.log(`\nbackfilled ${filled.length} blank jersey numbers from each player's most recent earlier session.`);

const after = await sql`
  SELECT c.name, es.session_number sn, COUNT(*)::int rows, COUNT(p.jersey_number)::int numbered
  FROM player_checkins p JOIN evaluation_schedule es ON es.id = p.schedule_id JOIN age_categories c ON c.id = es.age_category_id
  WHERE c.organization_id = ${ORG} GROUP BY 1, 2 ORDER BY 1, 2`;
console.log("\nnow:");
for (const a of after) console.log(`   ${a.name.padEnd(7)} S${a.sn}  ${a.numbered}/${a.rows} numbered`);
process.exit(0);
