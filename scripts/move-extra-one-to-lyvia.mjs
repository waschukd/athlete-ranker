// Move the U15 Community testing results recorded against the placeholder
// "Extra One" onto Lyvia Schappert, and remove the placeholder.
//
//   node scripts/move-extra-one-to-lyvia.mjs             (dry run)
//   node scripts/move-extra-one-to-lyvia.mjs --commit
//
// The testing sheet had a row literally named "Extra,One" with real times and
// an overall rank of 31 -- a skater who was tested without her name being
// written down. The upload auto-registered that name as an athlete.
//
// Lyvia is ALREADY on the U15 Community roster, so renaming the placeholder
// would leave two of her. Her results move to the existing record instead.
//
// Her U15 AA record is deliberately left alone: the same girl in two divisions
// is a cut-and-move, not a duplicate, and that row holds 64 evaluation scores.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const CAT = 99;            // EFHA U15 Community
const FROM = 4161;         // "Extra One"
const TO = 4157;           // Lyvia Schappert, U15 Community

const [src] = await sql`SELECT id, first_name, last_name, age_category_id FROM athletes WHERE id = ${FROM}`;
const [dst] = await sql`SELECT id, first_name, last_name, age_category_id FROM athletes WHERE id = ${TO}`;
if (!src || !dst) { console.error("one of the athletes no longer exists"); process.exit(1); }
if (src.age_category_id !== CAT || dst.age_category_id !== CAT) {
  console.error("both athletes must be in U15 Community"); process.exit(1);
}
console.log(`from: ${src.first_name} ${src.last_name} [${src.id}]`);
console.log(`to:   ${dst.first_name} ${dst.last_name} [${dst.id}]`);

// The destination must be empty, or moving would overwrite real results.
const [{ existing }] = await sql`
  SELECT COUNT(*)::int AS existing FROM testing_results WHERE athlete_id = ${TO}`;
const [{ existingRank }] = await sql`
  SELECT COUNT(*)::int AS "existingRank" FROM testing_drill_results WHERE athlete_id = ${TO}`;
if (existing || existingRank) {
  console.error(`REFUSING: ${dst.first_name} already has ${existing} values and ${existingRank} ranks.`);
  process.exit(1);
}

const vals = await sql`SELECT test_name, value::text, test_rank, test_order FROM testing_results WHERE athlete_id = ${FROM} ORDER BY test_order`;
const ranks = await sql`SELECT session_number, overall_rank FROM testing_drill_results WHERE athlete_id = ${FROM}`;
console.log(`\nmoving ${vals.length} values and ${ranks.length} overall rank(s):`);
for (const v of vals) console.log(`  ${v.test_name.padEnd(24)} ${v.value.padStart(8)}  rank ${v.test_rank}`);
for (const r of ranks) console.log(`  overall rank (session ${r.session_number}): ${r.overall_rank}`);

// Anything else attached to the placeholder would be silently destroyed.
const [other] = await sql`
  SELECT (SELECT COUNT(*)::int FROM category_scores WHERE athlete_id = ${FROM}) AS scores,
         (SELECT COUNT(*)::int FROM player_checkins WHERE athlete_id = ${FROM}) AS checkins,
         (SELECT COUNT(*)::int FROM player_group_assignments WHERE athlete_id = ${FROM}) AS groups,
         (SELECT COUNT(*)::int FROM player_notes WHERE athlete_id = ${FROM}) AS notes`;
console.log(`\nplaceholder also has: ${other.scores} scores, ${other.checkins} check-ins, ${other.groups} group assignments, ${other.notes} notes`);
if (other.scores || other.notes) {
  console.error("REFUSING: the placeholder carries evaluation data -- that needs a human decision.");
  process.exit(1);
}

if (!COMMIT) { console.log("\nDRY RUN -- re-run with --commit."); process.exit(0); }

await sql`UPDATE testing_results SET athlete_id = ${TO} WHERE athlete_id = ${FROM}`;
await sql`UPDATE testing_drill_results SET athlete_id = ${TO} WHERE athlete_id = ${FROM}`;
await sql`DELETE FROM player_checkins WHERE athlete_id = ${FROM}`;
await sql`DELETE FROM player_group_assignments WHERE athlete_id = ${FROM}`;
await sql`DELETE FROM athletes WHERE id = ${FROM}`;

const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM testing_results WHERE athlete_id = ${TO}`;
const [{ r }] = await sql`SELECT overall_rank AS r FROM testing_drill_results WHERE athlete_id = ${TO}`;
const [gone] = await sql`SELECT id FROM athletes WHERE id = ${FROM}`;
console.log(`\n${dst.first_name} ${dst.last_name} now has ${n} values, overall rank ${r}.`);
console.log(`placeholder removed: ${gone ? "NO -- still present" : "yes"}`);
