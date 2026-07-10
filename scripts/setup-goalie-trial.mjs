// One-off: provision the "Jamie Goalie Trial" so ATC (goalie SP #26, Jamie
// users.id 43) can score goalies + add notes this weekend. Idempotent — safe to
// re-run. Dry run by default; pass --commit to write.
//   node scripts/setup-goalie-trial.mjs           # show what it would do
//   node scripts/setup-goalie-trial.mjs --commit  # provision
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const ATC = 26, JAMIE = 43;
const GOALIE_CATS = ["Skating / Balance / Agility", "Positioning / Angles / Net Coverage", "Feet / Hands / Stick / Rebounds", "Anticipation / Reading the Play"];
const GOALIES = [
  { ext: "trial-gold-1", first: "Ethan", last: "Losier", num: 1, color: "Gold" },
  { ext: "trial-gold-30", first: "Keaton", last: "Party", num: 30, color: "Gold" },
  { ext: "trial-gold-31", first: "Brandon", last: "Balcar", num: 31, color: "Gold" },
  { ext: "trial-white-1", first: "Zack", last: "Desmarais", num: 1, color: "White" },
  { ext: "trial-white-30", first: "Liam", last: "Conway", num: 30, color: "White" },
  { ext: "trial-white-31", first: "Hunter", last: "Faderewski", num: 31, color: "White" },
];
const GOALIE_CONFIG = { scale: 10, increment: 1, sessions: [{ session_number: 1, name: "Goalie Trial", session_type: "scrimmage", weight_percentage: 100 }] };

if (!COMMIT) { console.log("DRY RUN — re-run with --commit to provision. Would create: org 'Jamie Goalie Trial', link to ATC, goalie category, 4 goalie categories, category_evaluator (Jamie=goalie), 6 goalies, one Sat session, and check them all in."); process.exit(0); }

// 1. Trial association org
let [org] = await sql`SELECT id FROM organizations WHERE name = 'Jamie Goalie Trial' LIMIT 1`;
if (!org) {
  const code = "GTRIAL" + Math.random().toString(36).slice(2, 5).toUpperCase();
  [org] = await sql`INSERT INTO organizations (name, type, contact_email, org_code, goalie_eval_mode)
    VALUES ('Jamie Goalie Trial', 'association', 'jamie@atcgoaltending.com', ${code}, 'goalie_service_provider') RETURNING id`;
}
const ORG = org.id;

// 2. Link ATC as the goalie SP
if (!(await sql`SELECT 1 FROM sp_association_links WHERE service_provider_id=${ATC} AND association_id=${ORG}`).length)
  await sql`INSERT INTO sp_association_links (service_provider_id, association_id, status) VALUES (${ATC}, ${ORG}, 'active')`;

// 3. Goalie category
let [cat] = await sql`SELECT id FROM age_categories WHERE organization_id=${ORG} AND name='Goalie Trial' LIMIT 1`;
if (!cat) {
  [cat] = await sql`INSERT INTO age_categories (organization_id, name, evaluates_goalies, goalie_config, scoring_scale, scoring_increment, evaluators_anonymous, players_eval_goalies, setup_complete, status, eval_format)
    VALUES (${ORG}, 'Goalie Trial', true, ${JSON.stringify(GOALIE_CONFIG)}::jsonb, 10, 1, false, false, true, 'active', 'standard') RETURNING id`;
} else {
  await sql`UPDATE age_categories SET evaluates_goalies=true, goalie_config=${JSON.stringify(GOALIE_CONFIG)}::jsonb, setup_complete=true, status='active' WHERE id=${cat.id}`;
}
const CAT = cat.id;

// 4. Session + goalie scoring categories
await sql`DELETE FROM category_sessions WHERE age_category_id=${CAT}`;
await sql`INSERT INTO category_sessions (age_category_id, session_number, name, session_type, weight_percentage) VALUES (${CAT}, 1, 'Goalie Trial', 'scrimmage', 100)`;
await sql`DELETE FROM scoring_categories WHERE age_category_id=${CAT} AND applies_to IN ('goalies','goalie_skills')`;
for (let i = 0; i < GOALIE_CATS.length; i++)
  await sql`INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to) VALUES (${CAT}, ${GOALIE_CATS[i]}, ${100 + i}, 'goalies')`;

// 5. Jamie as a goalie evaluator on this category
await sql`DELETE FROM category_evaluators WHERE age_category_id=${CAT} AND user_id=${JAMIE}`;
await sql`INSERT INTO category_evaluators (age_category_id, user_id, email, kind) VALUES (${CAT}, ${JAMIE}, 'jamie@atcgoaltending.com', 'goalie')`;

// 6. Goalies (upsert by external_id)
const athIds = [];
for (const g of GOALIES) {
  let [a] = await sql`SELECT id FROM athletes WHERE age_category_id=${CAT} AND external_id=${g.ext} LIMIT 1`;
  if (!a) [a] = await sql`INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, position, jersey_number, is_active, external_id)
    VALUES (${ORG}, ${CAT}, ${g.first}, ${g.last}, 'goalie', ${g.num}, true, ${g.ext}) RETURNING id`;
  else await sql`UPDATE athletes SET first_name=${g.first}, last_name=${g.last}, jersey_number=${g.num}, position='goalie', is_active=true WHERE id=${a.id}`;
  athIds.push({ id: a.id, ...g });
}

// 7. Weekend session
let [sched] = await sql`SELECT id, checkin_code FROM evaluation_schedule WHERE age_category_id=${CAT} AND session_number=1 AND group_number=1 LIMIT 1`;
if (!sched) {
  const code = "TRIAL-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  [sched] = await sql`INSERT INTO evaluation_schedule (age_category_id, session_number, group_number, scheduled_date, day_of_week, start_time, end_time, location, checkin_code, checkin_code_active, evaluators_required, goalie_evaluators_required, testers_required, status)
    VALUES (${CAT}, 1, 1, '2026-07-11', 'Saturday', '09:00', '12:00', 'TBD — set on the day', ${code}, true, 0, 1, 0, 'scheduled') RETURNING id, checkin_code`;
}
const SCHED = sched.id;

// 8. Check the goalies in so they show on the scoring screen immediately
for (const a of athIds) {
  if (!(await sql`SELECT 1 FROM player_checkins WHERE athlete_id=${a.id} AND schedule_id=${SCHED}`).length)
    await sql`INSERT INTO player_checkins (athlete_id, schedule_id, jersey_number, team_color, checked_in, checked_in_at) VALUES (${a.id}, ${SCHED}, ${a.num}, ${a.color}, true, now())`;
  else await sql`UPDATE player_checkins SET jersey_number=${a.num}, team_color=${a.color}, checked_in=true WHERE athlete_id=${a.id} AND schedule_id=${SCHED}`;
}

console.log("DONE.");
console.log(`  Trial association: #${ORG}  ·  Category: #${CAT}  ·  Session: #${SCHED}  ·  check-in code ${sched.checkin_code}`);
console.log(`  Score URL: https://www.sidelinestar.com/evaluator/score/${SCHED}`);
console.log(`  Goalies: ${athIds.map(a => `${a.color} #${a.num} ${a.first} ${a.last}`).join(", ")}`);
