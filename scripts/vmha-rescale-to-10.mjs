// Put VMHA (org 70) back on the 10-point scale every other association uses,
// and double the scores already entered on the 5-point scale so they keep the
// same meaning.
//
//   node scripts/vmha-rescale-to-10.mjs            (preview)
//   node scripts/vmha-rescale-to-10.mjs --commit
//
// VMHA's three categories were created on the platform default of 10 and were
// switched to 5 on Oct 1-2 via the setup wizard's scoring step. One session had
// been scored under the 5 before anyone noticed: U11 M session 1, 356 scores
// over 23 skaters.
//
// Doubling is exactly right here and nothing else is: with scoring_increment
// 0.5, every stored value is a multiple of 0.5, so x2 lands on a legal value on
// the 10 scale (4.5 -> 9.0), the order within every evaluator is untouched, and
// each athlete's position relative to the scale is preserved (90% stays 90%).
// Leaving them alone would have been the quiet failure: session 1 would weigh
// 20% of the standings while physically unable to exceed 4.5 out of 10, so a
// strong skills skate would count for half of what the association intended.
//
// Every changed score is written to audit_log with its original, so the whole
// move reverses from the log alone.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const ORG = 70, NEW_SCALE = 10;

const cats = await sql`SELECT id, name, scoring_scale::float sc, scoring_increment::float inc FROM age_categories WHERE organization_id = ${ORG} ORDER BY id`;
const scores = await sql`
  SELECT cs.age_category_id cat, cs.session_number sn, COUNT(*)::int n, COUNT(DISTINCT cs.athlete_id)::int kids,
    MIN(cs.score)::float mn, MAX(cs.score)::float mx
  FROM category_scores cs WHERE cs.age_category_id = ANY(${cats.map(c => c.id)}) GROUP BY 1, 2 ORDER BY 1, 2`;
const names = new Map(cats.map(c => [c.id, c.name]));

console.log(`VMHA -- scoring scale back to ${NEW_SCALE}\n`);
for (const c of cats) console.log(`  ${c.name.padEnd(7)} scale ${c.sc} -> ${NEW_SCALE}   (increment ${c.inc}, unchanged)`);
console.log(`\n  scores already entered:`);
if (!scores.length) console.log("     none");
for (const s of scores) {
  const c = cats.find(x => x.id === s.cat);
  const doubling = c.sc < NEW_SCALE;
  console.log(`     ${names.get(s.cat).padEnd(7)} S${s.sn}  ${s.n} scores, ${s.kids} skaters, range ${s.mn}-${s.mx}` +
    (doubling ? `  ->  x${NEW_SCALE / c.sc}  range ${s.mn * (NEW_SCALE / c.sc)}-${s.mx * (NEW_SCALE / c.sc)}` : "  (already on the new scale, untouched)"));
}

// Safety: every value must land on a legal increment after scaling, or the
// doubling is not safe and this refuses rather than inventing off-grid scores.
const offGrid = [];
for (const c of cats) {
  if (c.sc >= NEW_SCALE) continue;
  const f = NEW_SCALE / c.sc;
  const step = Math.round(c.inc * 100);
  const bad = await sql`
    SELECT COUNT(*)::int n FROM category_scores
    WHERE age_category_id = ${c.id}
      AND (MOD(ROUND(score * ${f} * 100)::int, ${step}) <> 0 OR score * ${f} > ${NEW_SCALE})`;
  if (bad[0].n) offGrid.push(`${c.name}: ${bad[0].n} scores would land off the ${c.inc} grid or above ${NEW_SCALE}`);
}
if (offGrid.length) { console.error("\nREFUSING:\n  " + offGrid.join("\n  ")); process.exit(1); }
console.log(`\n  every scaled value lands on the ${cats[0].inc} grid and inside 0-${NEW_SCALE}.`);

if (!COMMIT) { console.log("\nPREVIEW ONLY -- nothing written. Re-run with --commit to apply."); process.exit(0); }

const [actor] = await sql`SELECT id FROM users WHERE email = 'dan@competitivethread.com'`;
let changed = 0;
for (const c of cats) {
  if (c.sc < NEW_SCALE) {
    const f = NEW_SCALE / c.sc;
    const rows = await sql`SELECT id, athlete_id, evaluator_id, session_number, scoring_category_id, score::float score FROM category_scores WHERE age_category_id = ${c.id}`;
    for (const r of rows) {
      const next = Math.round(r.score * f * 100) / 100;
      if (next === r.score) continue;
      await sql`UPDATE category_scores SET score = ${next}, updated_at = NOW() WHERE id = ${r.id}`;
      await sql`
        INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_changed, old_value, new_value, notes, age_category_id)
        VALUES (${actor.id}, 'score_rescaled', 'athlete', ${r.athlete_id}, 'score', ${String(r.score)}, ${String(next)},
          ${JSON.stringify({ from_scale: c.sc, to_scale: NEW_SCALE, factor: f, evaluator_id: r.evaluator_id, session_number: r.session_number, scoring_category_id: r.scoring_category_id, score_id: r.id, reason: "association set the scale to 5 mid-setup; restored to the platform's 10" })}, ${c.id})`;
      changed++;
    }
    console.log(`${c.name}: ${rows.length} scores read, ${changed} rescaled x${f}`);
  }
  await sql`UPDATE age_categories SET scoring_scale = ${NEW_SCALE} WHERE id = ${c.id}`;
}
console.log(`\nscale set to ${NEW_SCALE} on ${cats.length} categories, ${changed} scores doubled (each logged with its original).`);

const after = await sql`
  SELECT c.name, c.scoring_scale::float sc,
    (SELECT COUNT(*)::int FROM category_scores x WHERE x.age_category_id = c.id) n,
    (SELECT MIN(x.score)::float FROM category_scores x WHERE x.age_category_id = c.id) mn,
    (SELECT MAX(x.score)::float FROM category_scores x WHERE x.age_category_id = c.id) mx
  FROM age_categories c WHERE c.organization_id = ${ORG} ORDER BY c.id`;
console.log("\nnow:");
for (const a of after) console.log(`   ${a.name.padEnd(7)} scale ${a.sc}  ${a.n} scores${a.n ? `, range ${a.mn}-${a.mx}` : ""}`);
console.log("\nEvaluators with the scoring screen already open must reload before their next session.");
process.exit(0);
