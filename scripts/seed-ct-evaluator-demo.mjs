// Small, self-contained demo for Dan's evaluator-side walkthrough video.
// One new association ("CT Evaluator Demo"), linked to Competitive Thread so
// Dan's existing CT evaluator membership makes him eligible to sign up for it
// -- no special "only Dan can see this" flag needed, since a brand-new org
// nobody else belongs to is already invisible to every real evaluator/
// director/parent via the normal org-membership isolation everything else
// already uses. Session is left OPEN (not pre-signed-up) so the video can
// show the sign-up flow live, then scoring -- including the new "watch this
// player" star, seeded on one athlete.
//   node scripts/seed-ct-evaluator-demo.mjs
import { connect, isoDay } from "./_db.mjs";
const sql = connect(import.meta.url, "../.env.local");

const CT_ID = 16; // Competitive Thread
const DAN_USER_ID = 25;
const ORG_NAME = "CT Evaluator Demo";
const SCALE = 10;

function genCode() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) { if (i === 3) s += "-"; s += c[Math.floor(Math.random() * c.length)]; }
  return s;
}

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
  console.log(`Removed ${prior.length} "${ORG_NAME}" org(s) and everything under them.`);
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
  VALUES (${org.id}, 'Evaluator Training Demo', 11, 12, 'active', ${SCALE}, 0.5, true, true, 'standard', 1, false, true)
  RETURNING id`;
const CAT = cat.id;

await sql`INSERT INTO category_sessions (age_category_id, session_number, name, session_type, status) VALUES (${CAT}, 1, 'Demo Session', 'scrimmage', 'scheduled')`;

const SKILLS = ["Skating", "Puck Skills", "Hockey IQ", "Effort / Compete"];
let disp = 1;
for (const name of SKILLS) await sql`INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to) VALUES (${CAT}, ${name}, ${disp++}, 'all')`;

// ── Athletes ──
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

// ── Schedule: today, later this evening, left OPEN so Dan can sign up on camera ──
const today = isoDay(new Date());
const checkinCode = genCode();
const [sched] = await sql`
  INSERT INTO evaluation_schedule (age_category_id, session_number, group_number, scheduled_date, day_of_week, start_time, end_time, location, checkin_code, checkin_code_active, evaluators_required, status)
  VALUES (${CAT}, 1, 1, ${today}, ${new Date().toLocaleDateString("en-US", { weekday: "long" })}, '19:00', '20:00', 'Demo Rink', ${checkinCode}, true, 1, 'scheduled')
  RETURNING id`;

// ── Check everyone in, jerseys + team colours, so scoring can start immediately after sign-up ──
const [cs] = await sql`INSERT INTO checkin_sessions (schedule_id, age_category_id, team_colors, is_open) VALUES (${sched.id}, ${CAT}, ${JSON.stringify(["Red", "White"])}, true) RETURNING id`;
for (let i = 0; i < athleteRows.length; i++) {
  const a = athleteRows[i];
  await sql`
    INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, jersey_number, team_color, checked_in, checked_in_at)
    VALUES (${a.id}, ${sched.id}, ${cs.id}, ${a.jersey_number}, ${i % 2 === 0 ? "Red" : "White"}, true, NOW())`;
}

// ── Seed the new "watch this player" star on one athlete for this session ──
const watchTarget = athleteRows[2]; // Carter Nielsen
await sql`
  INSERT INTO watch_players (age_category_id, athlete_id, session_number, note, flagged_by)
  VALUES (${CAT}, ${watchTarget.id}, 1, 'Ranked lower than expected last look -- watch closely.', ${DAN_USER_ID})
`;

console.log("\n================ CT EVALUATOR DEMO IS READY ================");
console.log(`Org: ${ORG_NAME} (id ${org.id}), linked to Competitive Thread -- invisible to everyone except CT's own evaluator pool.`);
console.log(`Category: Evaluator Training Demo (id ${CAT}), 10 athletes, all checked in.`);
console.log(`Schedule id ${sched.id}: today ${today}, 7:00-8:00 PM, Demo Rink, 1 evaluator spot OPEN (not pre-signed-up).`);
console.log(`Watch star seeded on: ${watchTarget.first_name} ${watchTarget.last_name} (jersey #${watchTarget.jersey_number}).`);
console.log(`\nLog in as dan@competitivethread.com, go to Evaluator Signup, sign up for "Evaluator Training Demo", then Evaluator Dashboard -> Score.`);
console.log(`\nTo remove after the video: node scripts/seed-ct-evaluator-demo.mjs --teardown`);
