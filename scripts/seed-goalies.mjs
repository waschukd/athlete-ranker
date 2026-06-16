// Seed goalie evaluation data for Mill Woods U11AA (cat #29): 5 goalie scoring
// categories (applies_to='goalies') + stable goalie scores across all 4 sessions
// (S1 = stations, S2-4 = scrimmage observation) by goalie evaluators. Removes the
// goalies' old skater-category + testing rows so they rank purely on goalie skills.
// Re-runnable.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);

const CAT = 29;
const GCATS = [
  "Skating / Balance / Agility",
  "Positioning / Angles / Net Coverage",
  "Feet / Hands / Stick / Rebounds",
  "Concentration / Consistency / Big Saves",
  "Anticipation / Reading the Play",
];
const GEVALS = [27, 33]; // goalie evaluator user ids (Danny Boy, Payton Basterash)
const SESSIONS = [1, 2, 3, 4]; // S1 = goalie-only ice session (stations); S2-4 = goalies in scrimmages

let seed = 0x51ed5;
const rng = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (m, sd) => m + sd * Math.sqrt(-2 * Math.log(Math.max(1e-9, rng()))) * Math.cos(2 * Math.PI * rng());
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const roundHalf = (x) => Math.round(x * 2) / 2;

const goalies = await sql`SELECT id, first_name, last_name FROM athletes WHERE age_category_id=${CAT} AND position='goalie' ORDER BY last_name, first_name`;
const bases = [7.6, 6.9, 6.2, 5.6, 5.0]; // stable spread across the 5

// 1) clear any prior goalie categories (+ their scores) for a clean re-run
const prior = await sql`SELECT id FROM scoring_categories WHERE age_category_id=${CAT} AND applies_to='goalies'`;
if (prior.length) {
  const ids = prior.map(c => c.id);
  await sql`DELETE FROM category_scores WHERE scoring_category_id = ANY(${ids})`;
  await sql`DELETE FROM scoring_categories WHERE id = ANY(${ids})`;
}
// 2) insert the 5 goalie categories
const gcatIds = [];
for (let i = 0; i < GCATS.length; i++) {
  const r = await sql`INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to) VALUES (${CAT}, ${GCATS[i]}, ${10 + i}, 'goalies') RETURNING id`;
  gcatIds.push(r[0].id);
}
// 3) remove goalies' skater-category scores + testing rows + old notes
const gIds = goalies.map(g => g.id);
await sql`DELETE FROM category_scores WHERE age_category_id=${CAT} AND athlete_id = ANY(${gIds})`;
await sql`DELETE FROM testing_drill_results WHERE age_category_id=${CAT} AND athlete_id = ANY(${gIds})`;
await sql`DELETE FROM testing_results WHERE age_category_id=${CAT} AND athlete_id = ANY(${gIds})`;
await sql`DELETE FROM player_notes WHERE age_category_id=${CAT} AND athlete_id = ANY(${gIds})`;

// 4) seed goalie category_scores (stable: base + small per-cat tilt + per-session/eval noise)
const NOTES = [
  "Tracks pucks cleanly through traffic; stays square to shooters.",
  "Quick post-to-post; directs rebounds to the corners.",
  "Calm in the blue paint — rarely overcommits or chases.",
  "Strong glove side and reads developing plays a beat early.",
  "Competes hard on second and third chances in tight.",
];
const rows = [], notes = [];
goalies.forEach((g, gi) => {
  const base = bases[gi] ?? 6.0;
  const tilt = gcatIds.map(() => gauss(0, 0.4));
  for (const s of SESSIONS) {
    const shift = gauss(0, 0.18);
    gcatIds.forEach((cid, ci) => {
      for (const ev of GEVALS) {
        const score = clamp(roundHalf(base + tilt[ci] + shift + gauss(0, 0.45)), 1, 10);
        rows.push(sql`INSERT INTO category_scores (athlete_id, age_category_id, session_number, evaluator_id, scoring_category_id, score, scored_via) VALUES (${g.id}, ${CAT}, ${s}, ${ev}, ${cid}, ${score}, 'manual')`);
      }
    });
  }
  notes.push(sql`INSERT INTO player_notes (athlete_id, age_category_id, session_number, evaluator_id, note_text, scored_via) VALUES (${g.id}, ${CAT}, 2, ${GEVALS[gi % 2]}, ${NOTES[gi % NOTES.length]}, 'manual')`);
  notes.push(sql`INSERT INTO player_notes (athlete_id, age_category_id, session_number, evaluator_id, note_text, scored_via) VALUES (${g.id}, ${CAT}, 3, ${GEVALS[(gi + 1) % 2]}, ${NOTES[(gi + 2) % NOTES.length]}, 'manual')`);
});

// 5) designate the goalie evaluators (kind='goalie') for this category
await sql`DELETE FROM category_evaluators WHERE age_category_id=${CAT} AND kind='goalie'`;
for (const u of GEVALS) await sql`INSERT INTO category_evaluators (age_category_id, user_id, kind) VALUES (${CAT}, ${u}, 'goalie')`;

// batched insert
for (let i = 0; i < rows.length; i += 200) await sql.transaction(rows.slice(i, i + 200));
await sql.transaction(notes);

console.log(`Seeded ${gcatIds.length} goalie categories, ${rows.length} goalie scores (${goalies.length} goalies × 4 sessions × 5 cats × 2 evals), ${notes.length} notes.`);
console.log("goalie scores per session:", await sql`SELECT cs.session_number, COUNT(*)::int n FROM category_scores cs JOIN scoring_categories sc ON sc.id=cs.scoring_category_id WHERE cs.age_category_id=${CAT} AND sc.applies_to='goalies' GROUP BY cs.session_number ORDER BY cs.session_number`);
console.log("skater scores untouched:", await sql`SELECT COUNT(*)::int n FROM category_scores cs JOIN scoring_categories sc ON sc.id=cs.scoring_category_id WHERE cs.age_category_id=${CAT} AND sc.applies_to<>'goalies'`);
