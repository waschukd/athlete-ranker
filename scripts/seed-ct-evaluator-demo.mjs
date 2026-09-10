// Self-contained demo for Dan's evaluator-side walkthrough video, including a
// consensus/agreement demo: two fake evaluators ("Demo Evaluator A"/"B") have
// already scored Group 1 alongside Dan, clustered 6-8 with a couple of real
// disagreements planted on purpose so there's something worth showing when
// walking through how to work consensus.
//
// One new association ("CT Evaluator Demo"), linked to Competitive Thread so
// Dan's existing CT evaluator membership makes him eligible to sign up for it
// -- no special "only Dan can see this" flag needed, since a brand-new org
// nobody else belongs to is already invisible to every real evaluator/
// director/parent via the normal org-membership isolation everything else
// already uses.
//   node scripts/seed-ct-evaluator-demo.mjs
import { connect } from "./_db.mjs";
const sql = connect(import.meta.url, "../.env.local");

const CT_ID = 16; // Competitive Thread
const DAN_USER_ID = 25;
const ORG_NAME = "CT Evaluator Demo";
const SCALE = 10;
const INCREMENT = 0.5;

function genCode() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) { if (i === 3) s += "-"; s += c[Math.floor(Math.random() * c.length)]; }
  return s;
}
// Deterministic RNG so a re-run produces the same "random" spread every time
// -- makes it easy to talk through the same numbers across multiple takes.
let seed = 0x2f6e2b1;
const rng = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const toIncrement = (v) => Math.round(v / INCREMENT) * INCREMENT;

async function teardown() {
  const prior = await sql`SELECT id FROM organizations WHERE name = ${ORG_NAME}`;
  for (const p of prior) {
    const cats = await sql`SELECT id FROM age_categories WHERE organization_id = ${p.id}`;
    for (const c of cats) {
      await sql`DELETE FROM watch_players WHERE age_category_id = ${c.id}`.catch(() => {});
      await sql`DELETE FROM player_checkins WHERE schedule_id IN (SELECT id FROM evaluation_schedule WHERE age_category_id = ${c.id})`;
      await sql`DELETE FROM checkin_sessions WHERE age_category_id = ${c.id}`;
      await sql`DELETE FROM evaluator_session_signups WHERE schedule_id IN (SELECT id FROM evaluation_schedule WHERE age_category_id = ${c.id})`;
      await sql`DELETE FROM player_group_assignments WHERE session_group_id IN (SELECT id FROM session_groups WHERE age_category_id = ${c.id})`;
      await sql`DELETE FROM session_groups WHERE age_category_id = ${c.id}`;
      await sql`DELETE FROM evaluation_schedule WHERE age_category_id = ${c.id}`;
      await sql`DELETE FROM category_scores WHERE age_category_id = ${c.id}`;
      await sql`DELETE FROM athletes WHERE age_category_id = ${c.id}`;
      await sql`DELETE FROM scoring_categories WHERE age_category_id = ${c.id}`;
      await sql`DELETE FROM category_sessions WHERE age_category_id = ${c.id}`;
    }
    await sql`DELETE FROM age_categories WHERE organization_id = ${p.id}`;
    await sql`DELETE FROM sp_association_links WHERE association_id = ${p.id}`;
    await sql`DELETE FROM organizations WHERE id = ${p.id}`;
  }
  // Fake evaluator accounts from a prior run of this script.
  const fakeEvs = await sql`SELECT id FROM users WHERE email ILIKE 'demo.evaluator.%@ctdemo.sidelinestar.com'`;
  for (const u of fakeEvs) await sql`DELETE FROM users WHERE id = ${u.id}`;
  console.log(`Removed ${prior.length} "${ORG_NAME}" org(s) and ${fakeEvs.length} fake evaluator account(s).`);
}

if (process.argv.includes("--teardown")) {
  await teardown();
  process.exit(0);
}

// Clean any prior run before reseeding fresh.
await teardown();

// ── Org + link to CT (Dan's existing CT evaluator membership carries over) ──
const [org] = await sql`INSERT INTO organizations (name, type, contact_email) VALUES (${ORG_NAME}, 'association', 'ctdemo@demo.sidelinestar.com') RETURNING id`;
await sql`INSERT INTO sp_association_links (service_provider_id, association_id, status) VALUES (${CT_ID}, ${org.id}, 'active')`;

// ── Category ──
const [cat] = await sql`
  INSERT INTO age_categories (organization_id, name, min_age, max_age, status, scoring_scale, scoring_increment, setup_complete, evaluates_goalies, eval_format, evaluators_required, evaluators_anonymous, position_tagging)
  VALUES (${org.id}, 'Evaluator Training Demo', 11, 12, 'active', ${SCALE}, ${INCREMENT}, true, true, 'standard', 3, false, true)
  RETURNING id`;
const CAT = cat.id;

await sql`INSERT INTO category_sessions (age_category_id, session_number, name, session_type, status) VALUES (${CAT}, 1, 'Demo Session', 'scrimmage', 'scheduled')`;

const SKILLS = ["Skating", "Puck Skills", "Hockey IQ", "Effort / Compete"];
let disp = 1;
for (const name of SKILLS) await sql`INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to) VALUES (${CAT}, ${name}, ${disp++}, 'all')`;
const scoringCatRows = await sql`SELECT id FROM scoring_categories WHERE age_category_id = ${CAT} ORDER BY display_order`;
const scoringCatIds = scoringCatRows.map(r => r.id);

// ── Athletes -- 16, a realistic full group size ──
const ATHLETES = [
  { first: "Avery", last: "Coleman", position: "forward" },
  { first: "Brooklyn", last: "Hart", position: "forward" },
  { first: "Carter", last: "Nielsen", position: "defense" },
  { first: "Delaney", last: "Ferris", position: "forward" },
  { first: "Emerson", last: "Whitlock", position: "defense" },
  { first: "Finley", last: "Marsh", position: "forward" },
  { first: "Harlow", last: "Beckett", position: "goalie" },
  { first: "Jaxon", last: "Redmond", position: "forward" },
  { first: "Kinsley", last: "Osei", position: "defense" },
  { first: "Maddox", last: "Trent", position: "forward" },
  { first: "Nora", last: "Whitfield", position: "forward" },
  { first: "Parker", last: "Suzuki", position: "defense" },
  { first: "Quinn", last: "Aldana", position: "forward" },
  { first: "Rowan", last: "Bishop", position: "defense" },
  { first: "Sawyer", last: "Kwan", position: "forward" },
  { first: "Tatum", last: "Delgado", position: "goalie" },
];
const athleteRows = [];
for (let i = 0; i < ATHLETES.length; i++) {
  const a = ATHLETES[i];
  const [row] = await sql`
    INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, jersey_number, position, parent_email, is_active)
    VALUES (${org.id}, ${CAT}, ${a.first}, ${a.last}, ${i + 1}, ${a.position}, ${`${a.first}.${a.last}@example.com`.toLowerCase()}, true)
    RETURNING id, first_name, last_name, jersey_number`;
  athleteRows.push(row);
}

// ── Group + assignments ──
const [sg] = await sql`INSERT INTO session_groups (age_category_id, session_number, group_number, name, display_order) VALUES (${CAT}, 1, 1, 'Group 1', 1) RETURNING id`;
for (let i = 0; i < athleteRows.length; i++) {
  await sql`INSERT INTO player_group_assignments (athlete_id, session_group_id, display_order) VALUES (${athleteRows[i].id}, ${sg.id}, ${i})`;
}

// ── Schedule: today, later this evening ──
// "Today" per the DATABASE's own clock, not this machine's -- the evaluator
// browse query filters on `scheduled_date >= CURRENT_DATE` server-side, and a
// local-clock/DB-clock mismatch here is exactly what made an earlier run of
// this script invisible on the sign-up page (seeded "today" was already
// yesterday by the DB's own clock).
const [{ today, dow }] = await sql`SELECT CURRENT_DATE::text as today, to_char(CURRENT_DATE, 'FMDay') as dow`;
const checkinCode = genCode();
const [sched] = await sql`
  INSERT INTO evaluation_schedule (age_category_id, session_number, group_number, scheduled_date, day_of_week, start_time, end_time, location, checkin_code, checkin_code_active, evaluators_required, status)
  VALUES (${CAT}, 1, 1, ${today}, ${dow}, '19:00', '20:00', 'Demo Rink', ${checkinCode}, true, 3, 'scheduled')
  RETURNING id`;

// ── Check everyone in, jerseys + team colours ──
const [cs] = await sql`INSERT INTO checkin_sessions (schedule_id, age_category_id, team_colors, is_open) VALUES (${sched.id}, ${CAT}, ${JSON.stringify(["Red", "White"])}, true) RETURNING id`;
for (let i = 0; i < athleteRows.length; i++) {
  const a = athleteRows[i];
  await sql`
    INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, jersey_number, team_color, checked_in, checked_in_at)
    VALUES (${a.id}, ${sched.id}, ${cs.id}, ${a.jersey_number}, ${i % 2 === 0 ? "Red" : "White"}, true, NOW())`;
}

// ── Dan is pre-signed-up -- past the "find the session" step already ──
await sql`INSERT INTO evaluator_session_signups (user_id, schedule_id, status) VALUES (${DAN_USER_ID}, ${sched.id}, 'signed_up')`;

// ── Two fake "other evaluator" accounts, already scored, for the consensus demo ──
const FAKE_EVALUATORS = ["Demo Evaluator A", "Demo Evaluator B"];
const fakeEvalUsers = [];
for (const name of FAKE_EVALUATORS) {
  const email = `demo.evaluator.${name.split(" ").pop().toLowerCase()}@ctdemo.sidelinestar.com`;
  const [u] = await sql`INSERT INTO users (email, name, role) VALUES (${email}, ${name}, 'service_provider_evaluator') RETURNING id`;
  await sql`INSERT INTO evaluator_memberships (user_id, organization_id, status, is_evaluator) VALUES (${u.id}, ${org.id}, 'active', true)`;
  await sql`INSERT INTO evaluator_session_signups (user_id, schedule_id, status) VALUES (${u.id}, ${sched.id}, 'signed_up')`;
  fakeEvalUsers.push(u.id);
}

// Two athletes get a REAL disagreement planted on purpose -- Carter Nielsen
// (already the "watch closely" star, so the demo ties both features
// together) and one more, so there's something worth discussing when
// showing how to work consensus. Everyone else clusters tight, 6-8.
const DISAGREEMENT_IDS = new Set([athleteRows[2].id, athleteRows[9].id]); // Carter Nielsen, Maddox Trent

const scoreRows = [];
for (const a of athleteRows) {
  const disagreement = DISAGREEMENT_IDS.has(a.id);
  // "True" skill level per athlete, tight band so the field average lands
  // solidly in 6-8 once both evaluators' small per-category jitter is applied.
  const trueLevel = clamp(6.5 + (rng() - 0.5) * 1.6, 6.0, 8.0);
  for (const evId of fakeEvalUsers) {
    // Evaluator A always fakeEvalUsers[0], B always [1] -- gives the planted
    // disagreement a consistent direction (A generous, B tough) instead of
    // random per-athlete, which reads as a believable individual bias rather
    // than noise when comparing the two evaluators' patterns.
    const isA = evId === fakeEvalUsers[0];
    const evalCenter = disagreement
      ? clamp(isA ? trueLevel + 2.2 : trueLevel - 2.2, 0.5, SCALE)
      : clamp(trueLevel + (isA ? 0.3 : -0.3) + (rng() - 0.5) * 0.6, 6.0, 8.0);
    for (const catId of scoringCatIds) {
      const val = toIncrement(clamp(evalCenter + (rng() - 0.5) * 0.6, 0.5, SCALE));
      scoreRows.push({ athlete_id: a.id, age_category_id: CAT, session_number: 1, evaluator_id: evId, scoring_category_id: catId, score: val, scored_via: "manual" });
    }
  }
}
for (const r of scoreRows) {
  await sql`
    INSERT INTO category_scores (athlete_id, age_category_id, session_number, evaluator_id, scoring_category_id, score, scored_via)
    VALUES (${r.athlete_id}, ${r.age_category_id}, ${r.session_number}, ${r.evaluator_id}, ${r.scoring_category_id}, ${r.score}, ${r.scored_via})
  `;
}

// ── "Watch this player" star -- Carter Nielsen, who ALSO has the planted
// disagreement above, so the demo can tie the two features together. ──
const watchTarget = athleteRows[2]; // Carter Nielsen
await sql`
  INSERT INTO watch_players (age_category_id, athlete_id, session_number, note, flagged_by)
  VALUES (${CAT}, ${watchTarget.id}, 1, 'Ranked lower than expected last look -- watch closely.', ${DAN_USER_ID})
`;

// Report the real, computed range so we know it actually landed near 6-8,
// not just eyeballed from the generation parameters.
const [range] = await sql`
  WITH per_athlete AS (
    SELECT athlete_id, AVG(score)::float AS avg_score FROM category_scores
    WHERE age_category_id = ${CAT} AND session_number = 1 GROUP BY athlete_id
  )
  SELECT MIN(avg_score)::float AS floor, MAX(avg_score)::float AS ceiling, AVG(avg_score)::float AS avg FROM per_athlete
`;

console.log("\n================ CT EVALUATOR DEMO IS READY ================");
console.log(`Org: ${ORG_NAME} (id ${org.id}), linked to Competitive Thread -- invisible to everyone except CT's own evaluator pool.`);
console.log(`Category: Evaluator Training Demo (id ${CAT}), ${athleteRows.length} athletes, all checked in.`);
console.log(`Schedule id ${sched.id}: today ${today}, 7:00-8:00 PM, Demo Rink. Dan + 2 fake evaluators already signed up.`);
console.log(`Fake evaluators: ${FAKE_EVALUATORS.join(", ")} -- already scored every athlete in Group 1.`);
console.log(`Established range this session: ${range.floor.toFixed(1)}-${range.ceiling.toFixed(1)} (field avg ${range.avg.toFixed(1)}).`);
console.log(`Planted disagreement (for the consensus demo): Carter Nielsen and Maddox Trent -- Demo Evaluator A scores them ~2 points higher than Demo Evaluator B.`);
console.log(`Watch star: ${watchTarget.first_name} ${watchTarget.last_name} (jersey #${watchTarget.jersey_number}) -- also one of the disagreement players.`);
console.log(`\nLog in as dan@competitivethread.com -> Evaluator Dashboard -> "Evaluator Training Demo" is already there, ready to score.`);
console.log(`\nTo remove after the video: node scripts/seed-ct-evaluator-demo.mjs --teardown`);
