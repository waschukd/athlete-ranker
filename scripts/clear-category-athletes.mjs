// Remove every athlete from one category, so a bad roster upload can be redone.
//
//   node scripts/clear-category-athletes.mjs --cat 69            (dry run)
//   node scripts/clear-category-athletes.mjs --cat 69 --commit
//
// Deletes the athletes and the rows derived from them (group assignments,
// seeded check-ins, scrimmage team membership). Leaves the category, its
// sessions, schedule and groups intact -- only the roster goes.
//
// REFUSES if any athlete carries real evaluation data: a score, a completed
// check-in, testing results, a note or a flag. Those are not re-creatable by
// re-uploading a roster, and a wrong-roster cleanup must never be the thing
// that destroys them. Override needs a human deciding per athlete, not a flag.
import { connect } from "./_db.mjs";
import { writeFileSync } from "node:fs";

const sql = connect(import.meta.url);
const arg = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
const COMMIT = process.argv.includes("--commit");
const CAT = parseInt(arg("--cat"));
if (!CAT) { console.error("Usage: --cat <categoryId> [--commit]"); process.exit(1); }

const [cat] = await sql`
  SELECT c.id, c.name, o.name AS org FROM age_categories c
  JOIN organizations o ON o.id = c.organization_id WHERE c.id = ${CAT}`;
if (!cat) { console.error(`No category ${CAT}`); process.exit(1); }

const athletes = await sql`SELECT id, first_name, last_name, is_active, created_at FROM athletes WHERE age_category_id = ${CAT} ORDER BY last_name, first_name`;
console.log(`${cat.org} / ${cat.name} (cat ${cat.id})`);
console.log(`athletes to remove: ${athletes.length}`);
if (!athletes.length) process.exit(0);

const ids = athletes.map(a => a.id);

const [c] = await sql`
  SELECT (SELECT COUNT(*)::int FROM category_scores WHERE athlete_id = ANY(${ids}))                    AS scores,
         (SELECT COUNT(*)::int FROM player_checkins WHERE athlete_id = ANY(${ids}) AND checked_in)     AS checked_in,
         (SELECT COUNT(*)::int FROM testing_results WHERE athlete_id = ANY(${ids}))                    AS testing,
         (SELECT COUNT(*)::int FROM testing_drill_results WHERE athlete_id = ANY(${ids}))              AS drill,
         (SELECT COUNT(*)::int FROM player_notes WHERE athlete_id = ANY(${ids}))                       AS notes,
         (SELECT COUNT(*)::int FROM athlete_flags WHERE athlete_id = ANY(${ids}))                      AS flags,
         (SELECT COUNT(*)::int FROM player_checkins WHERE athlete_id = ANY(${ids}))                    AS checkin_rows,
         (SELECT COUNT(*)::int FROM player_group_assignments WHERE athlete_id = ANY(${ids}))           AS groups,
         (SELECT COUNT(*)::int FROM scrimmage_team_members WHERE athlete_id = ANY(${ids}))             AS teams`;

console.log(`\nreal evaluation data (blocks the delete):`);
console.log(`  scores ${c.scores} · completed check-ins ${c.checked_in} · testing ${c.testing + c.drill} · notes ${c.notes} · flags ${c.flags}`);
console.log(`derived rows (removed with them):`);
console.log(`  group assignments ${c.groups} · seeded check-in rows ${c.checkin_rows} · team memberships ${c.teams}`);

const blockers = c.scores + c.checked_in + c.testing + c.drill + c.notes + c.flags;
if (blockers > 0) {
  console.error(`\nREFUSING: these athletes carry ${blockers} row(s) of real evaluation data.`);
  console.error(`Re-uploading a roster cannot bring those back. Resolve them first.`);
  process.exit(1);
}

if (!COMMIT) {
  console.log(`\nfirst 10: ${athletes.slice(0, 10).map(a => `${a.first_name} ${a.last_name}`).join(", ")}${athletes.length > 10 ? ", ..." : ""}`);
  console.log("\nDRY RUN -- re-run with --commit.");
  process.exit(0);
}

// Written before anything is deleted, so a mistaken run is recoverable by hand.
const backup = new URL(`../roster-backup-cat${CAT}.json`, import.meta.url);
writeFileSync(backup, JSON.stringify(await sql`SELECT * FROM athletes WHERE age_category_id = ${CAT}`, null, 2));
console.log(`\nbackup: roster-backup-cat${CAT}.json`);

// Children first -- athletes is the parent row.
const g = await sql`DELETE FROM player_group_assignments WHERE athlete_id = ANY(${ids}) RETURNING id`;
const p = await sql`DELETE FROM player_checkins WHERE athlete_id = ANY(${ids}) RETURNING id`;
const t = await sql`DELETE FROM scrimmage_team_members WHERE athlete_id = ANY(${ids}) RETURNING id`;
const a = await sql`DELETE FROM athletes WHERE age_category_id = ${CAT} RETURNING id`;
console.log(`removed ${g.length} group assignments, ${p.length} check-in rows, ${t.length} team memberships, ${a.length} athletes`);

const [left] = await sql`SELECT COUNT(*)::int AS n FROM athletes WHERE age_category_id = ${CAT}`;
console.log(`athletes remaining in ${cat.name}: ${left.n}`);
