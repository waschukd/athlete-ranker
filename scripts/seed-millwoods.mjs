// Seed realistic, STABLE evaluation data for Mill Woods U11AA (cat #29).
//
// Design goals (per demo requirements):
//  - Each athlete has a fixed latent ability; per-session noise is small, so
//    session-to-session rank movement is a few spots normally, ~10 rarely, and
//    20-30 essentially never (unlike the messy BAHA sample).
//  - Testing times are realistic for U11 and correlate with ability but carry
//    their own independent variation (speed/agility ≠ scrimmage skill).
//  - Matches the exact write shape of the real importers (testing-upload, scoring).
//
// Usage:
//   node scripts/seed-millwoods.mjs            # dry run: compute + print stats
//   node scripts/seed-millwoods.mjs --commit   # delete cat#29 eval data + insert
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);

const COMMIT = process.argv.includes("--commit");
const CAT = 29;
const SCALE = 10;
const EVALUATORS = [20, 21, 22, 23]; // Mike, Sarah, Tom, Lisa (non-coach)
const SKILLS = [
  { id: 106, name: "Skating" },
  { id: 107, name: "Puck Skills" },
  { id: 108, name: "Effort / Compete" },
  { id: 109, name: "Hockey IQ" },
];
const SCRIMMAGE_SESSIONS = [2, 3, 4];
const TESTS = [
  { name: "Forward Sprint", fast: 4.4, slow: 5.6 },
  { name: "Forward Sprint with Puck", fast: 4.7, slow: 6.0 },
  { name: "Backward Sprint", fast: 5.9, slow: 7.6 },
  { name: "Weave Agility", fast: 9.6, slow: 12.4 },
  { name: "Transition Agility Left", fast: 5.4, slow: 7.2 },
  { name: "Transition Agility Right", fast: 5.4, slow: 7.2 },
  { name: "Stop and Start", fast: 8.8, slow: 11.6 },
];

// ── Seeded PRNG (mulberry32) + gaussian, so runs are reproducible ──
let seed = 0x9e3779b9;
function rng() { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function gauss(mean = 0, sd = 1) { const u = Math.max(1e-9, rng()), v = rng(); return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round1 = (x) => Math.round(x * 10) / 10;
const roundHalf = (x) => Math.round(x * 2) / 2;
const rankAsc = (arr, key) => { const idx = arr.map((a, i) => i).sort((a, b) => key(arr[a]) - key(arr[b])); const r = {}; idx.forEach((origIdx, pos) => (r[origIdx] = pos + 1)); return r; };

// Tuning: keeps scrimmage→scrimmage movement small (see printed stats).
const ABILITY_MEAN = 6.3, ABILITY_SD = 1.15, ABILITY_LO = 3.6, ABILITY_HI = 9.2;
const SKILL_TILT_SD = 0.45;   // per-athlete per-skill personality
const SESSION_SHIFT_SD = 0.22; // per-athlete per-session drift (the movement driver)
const EVAL_NOISE_SD = 0.5;    // per-evaluator disagreement (averages out over 16)

const athletes = await sql`SELECT id, first_name, last_name, position FROM athletes WHERE age_category_id = ${CAT} AND is_active = true ORDER BY id`;
const N = athletes.length;

// 1) latent ability + per-skill bases
const A = athletes.map((a) => {
  const ability = clamp(gauss(ABILITY_MEAN, ABILITY_SD), ABILITY_LO, ABILITY_HI);
  const skillBase = {};
  for (const s of SKILLS) skillBase[s.id] = clamp(ability + gauss(0, SKILL_TILT_SD), 1, SCALE);
  return { ...a, ability, skillBase };
});

// 2) scrimmage scores per session/evaluator/skill + session normalized score
const catScores = []; // {athlete_id, session, evaluator_id, scoring_category_id, score}
const sessionNorm = {}; // athleteIdx -> { sessionNum -> normalized 0-100 }
for (let i = 0; i < N; i++) sessionNorm[i] = {};
for (const sNum of SCRIMMAGE_SESSIONS) {
  for (let i = 0; i < N; i++) {
    const shift = gauss(0, SESSION_SHIFT_SD);
    let sum = 0, cnt = 0;
    for (const skill of SKILLS) {
      for (const ev of EVALUATORS) {
        const raw = A[i].skillBase[skill.id] + shift + gauss(0, EVAL_NOISE_SD);
        const score = clamp(roundHalf(raw), 1, SCALE);
        catScores.push({ athlete_id: A[i].id, session: sNum, evaluator_id: ev, scoring_category_id: skill.id, score });
        sum += score; cnt++;
      }
    }
    sessionNorm[i][sNum] = (sum / cnt / SCALE) * 100;
  }
}

// 3) testing (session 1): times correlate with ability + independent noise
const abilities = A.map(a => a.ability);
const minAb = Math.min(...abilities), maxAb = Math.max(...abilities);
const testingRows = []; // {athlete_id, test_name, value, test_rank}
const perTestValues = {}; // testName -> [{i, value}]
for (const t of TESTS) perTestValues[t.name] = [];
for (let i = 0; i < N; i++) {
  const abilityPct = (A[i].ability - minAb) / (maxAb - minAb); // 1 = best
  for (const t of TESTS) {
    const slowness = clamp((1 - abilityPct) + gauss(0, 0.13), 0, 1);
    const value = round1(t.fast + (t.slow - t.fast) * slowness * 100) / 100; // 2 dp
    const v = Math.round((t.fast + (t.slow - t.fast) * slowness) * 100) / 100;
    perTestValues[t.name].push({ i, value: v });
  }
}
// per-test ranks + composite overall testing rank
const compositeRankSum = new Array(N).fill(0);
for (const t of TESTS) {
  const list = perTestValues[t.name];
  const sorted = [...list].sort((a, b) => a.value - b.value);
  sorted.forEach((row, pos) => { row.rank = pos + 1; compositeRankSum[row.i] += pos + 1; });
  for (const row of list) testingRows.push({ athlete_id: A[row.i].id, test_name: t.name, value: row.value, test_rank: row.rank });
}
const overallOrder = compositeRankSum.map((s, i) => ({ i, s })).sort((a, b) => a.s - b.s);
const overallRank = {}; // athleteIdx -> overall_rank (1 best)
overallOrder.forEach((row, pos) => (overallRank[row.i] = pos + 1));
for (let i = 0; i < N; i++) sessionNorm[i][1] = ((N - overallRank[i]) / (N - 1)) * 100; // testing percentile

// 4) per-session ranks (rank_history) + overall weighted rank
const SESS_WEIGHTS = { 1: 10, 2: 30, 3: 30, 4: 30 };
const allSessions = [1, 2, 3, 4];
const perSessionRank = {}; // sessionNum -> {athleteIdx -> rank}
for (const sNum of allSessions) {
  const order = A.map((_, i) => i).sort((a, b) => sessionNorm[b][sNum] - sessionNorm[a][sNum]);
  perSessionRank[sNum] = {};
  order.forEach((idx, pos) => (perSessionRank[sNum][idx] = pos + 1));
}
const weightedTotal = A.map((_, i) => {
  let wt = 0, tot = 0;
  for (const sNum of allSessions) { const w = SESS_WEIGHTS[sNum] / 100; wt += sessionNorm[i][sNum] * w; tot += w; }
  return round1(wt / tot);
});
const overallOrderFinal = A.map((_, i) => i).sort((a, b) => weightedTotal[b] - weightedTotal[a]);
const finalRank = {};
overallOrderFinal.forEach((idx, pos) => (finalRank[idx] = pos + 1));

// ── Movement stats ──
function moveStats(fromS, toS) {
  const moves = A.map((_, i) => Math.abs(perSessionRank[toS][i] - perSessionRank[fromS][i]));
  moves.sort((a, b) => a - b);
  const avg = moves.reduce((a, b) => a + b, 0) / moves.length;
  const pct = (n) => Math.round((moves.filter(m => m > n).length / moves.length) * 100);
  return { avg: round1(avg), median: moves[Math.floor(moves.length / 2)], max: moves[moves.length - 1], gt5: pct(5), gt10: pct(10), gt15: pct(15) };
}
console.log(`Mill Woods U11AA — ${N} athletes, ${EVALUATORS.length} evaluators, sessions ${allSessions.join("/")}`);
console.log(`ability range ${round1(minAb)}–${round1(maxAb)} (scale 10)`);
console.log("\nSession-to-session rank movement (|Δ rank|):");
console.log("  S1(testing)→S2 :", moveStats(1, 2));
console.log("  S2→S3          :", moveStats(2, 3));
console.log("  S3→S4          :", moveStats(3, 4));
console.log("\nTop 8 (final weighted rank):");
overallOrderFinal.slice(0, 8).forEach((i) => console.log(`  #${finalRank[i]}  ${A[i].first_name} ${A[i].last_name}  wt=${weightedTotal[i]}  ability=${round1(A[i].ability)}  ranks S1-4=[${allSessions.map(s => perSessionRank[s][i]).join(",")}]`));
console.log(`\ncategory_scores rows: ${catScores.length}, testing_results rows: ${testingRows.length}, testing_drill rows: ${N}`);

if (!COMMIT) { console.log("\nDRY RUN — no DB writes. Re-run with --commit to apply."); process.exit(0); }

// ── Notes (tier-appropriate), 2 per athlete on S2 + S3 ──
const NOTES = {
  top: ["Clearly drives play — first to loose pucks and wins more than his share of battles.", "High-end edges and acceleration; separates from pressure with ease.", "Reads the ice a step ahead, consistently in the right spot without the puck.", "Compete level stands out every shift; relentless on the forecheck.", "Confident with the puck in traffic, makes the next play look easy."],
  mid: ["Solid, dependable shift-to-shift; quiet but effective in all three zones.", "Good skating base; will benefit from quicker first three strides.", "Makes the simple play well — room to add deception with the puck.", "Engaged and coachable; competes hard along the boards.", "Reliable positionally; starting to support the puck more aggressively."],
  low: ["Works hard every shift — skating mechanics are the next step.", "Willing competitor; puck control under pressure is developing.", "Good attitude and effort; needs reps reading the play.", "Improving each session; first-step quickness is a focus area.", "Battles for position; will gain confidence with more puck touches."],
};
const notesRows = [];
for (let i = 0; i < N; i++) {
  const r = finalRank[i];
  const tier = r <= Math.ceil(N * 0.25) ? "top" : r > N - Math.ceil(N * 0.25) ? "low" : "mid";
  const pool = NOTES[tier];
  notesRows.push({ athlete_id: A[i].id, session: 2, evaluator_id: EVALUATORS[i % 4], note_text: pool[i % pool.length] });
  notesRows.push({ athlete_id: A[i].id, session: 3, evaluator_id: EVALUATORS[(i + 2) % 4], note_text: pool[(i + 2) % pool.length] });
}

console.log("\nCommitting…");
// Batch helper: run an array of (un-awaited) neon query objects in chunked
// transactions so we don't fire thousands of separate HTTP round trips.
async function runBatched(queries, size = 200) {
  for (let i = 0; i < queries.length; i += size) {
    await sql.transaction(queries.slice(i, i + size));
  }
}

await sql.transaction([
  sql`DELETE FROM category_scores WHERE age_category_id = ${CAT}`,
  sql`DELETE FROM testing_results WHERE age_category_id = ${CAT}`,
  sql`DELETE FROM testing_drill_results WHERE age_category_id = ${CAT}`,
  sql`DELETE FROM player_notes WHERE age_category_id = ${CAT}`,
]);

const jerseys = Array.from({ length: 98 }, (_, k) => k + 2).sort(() => rng() - 0.5);

await runBatched([
  // testing_drill_results (overall_rank per athlete, session 1)
  ...A.map((a, i) => sql`INSERT INTO testing_drill_results (athlete_id, age_category_id, session_number, overall_rank) VALUES (${a.id}, ${CAT}, 1, ${overallRank[i]})`),
  // testing_results (per test)
  ...testingRows.map(t => sql`INSERT INTO testing_results (athlete_id, age_category_id, session_number, test_name, value, test_rank) VALUES (${t.athlete_id}, ${CAT}, 1, ${t.test_name}, ${t.value}, ${t.test_rank})`),
  // category_scores (scrimmage sessions)
  ...catScores.map(c => sql`INSERT INTO category_scores (athlete_id, age_category_id, session_number, evaluator_id, scoring_category_id, score, scored_via) VALUES (${c.athlete_id}, ${CAT}, ${c.session}, ${c.evaluator_id}, ${c.scoring_category_id}, ${c.score}, 'manual')`),
  // player_notes
  ...notesRows.map(n => sql`INSERT INTO player_notes (athlete_id, age_category_id, session_number, evaluator_id, note_text, scored_via) VALUES (${n.athlete_id}, ${CAT}, ${n.session}, ${n.evaluator_id}, ${n.note_text}, 'manual')`),
  // jersey numbers + birth year (U11 = born 2015) for roster realism
  ...A.map((a, i) => sql`UPDATE athletes SET jersey_number = ${jerseys[i]}, birth_year = 2015 WHERE id = ${a.id}`),
]);

// mark sessions complete for a finished-evaluation look
await sql`UPDATE category_sessions SET status = 'complete' WHERE age_category_id = ${CAT}`;
console.log(`DONE. Inserted ${N} testing_drill, ${testingRows.length} testing_results, ${catScores.length} category_scores, ${notesRows.length} notes.`);
