// Create a Mill Woods (org 20) U9 age division for the demo:
//  - fully set up (so it doesn't show "needs setup")
//  - 26 players, no scores yet
//  - future-dated schedule so the dashboard shows "Upcoming Schedule"
// Re-runnable: deletes any existing U9 in org 20 first.
//   node scripts/seed-millwoods-u9.mjs --commit
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const ORG = 20, TEMPLATE_CAT = 29;

const FIRST = ["Mason","Logan","Lucas","Ethan","Jack","Owen","Carter","Wyatt","Leo","Henry","Nathan","Cole","Liam","Hudson","Felix","Theo","Emmett","Beau","Ryder","Sawyer","Bennett","Charlie","Declan","Finn","Cruz","Tobias"];
const LAST = ["Anderson","MacKenzie","Friesen","Wong","Patel","Nguyen","Hill","Forbes","Doyle","Reimer","Côté","Singh","Lund","Hayes","Barclay","Penner","Toews","Klassen","Wiebe","Dyck","Loewen","Funk","Neufeld","Krahn","Janzen","Peters"];
const SKATERS = 24, GOALIES = 2; // 16 F, 8 D, 2 G
const roster = [];
for (let i = 0; i < SKATERS + GOALIES; i++) {
  const position = i >= SKATERS ? "goalie" : i < 16 ? "forward" : "defense";
  roster.push({
    first_name: FIRST[i], last_name: LAST[i], position, birth_year: 2017,
    jersey_number: i + 2,
    parent_email: `${FIRST[i].toLowerCase()}.${LAST[i].toLowerCase().replace(/[^a-z]/g,"")}@millwoodshockey.test`,
  });
}

// Future-dated schedule (today is mid-June 2026). 2 groups per session.
const SESSIONS = [
  { n: 1, type: "testing",   date: "2026-06-23", dow: "Monday",    evals: 0, weight: 10 },
  { n: 2, type: "scrimmage", date: "2026-06-25", dow: "Wednesday", evals: 4, weight: 30 },
  { n: 3, type: "scrimmage", date: "2026-06-27", dow: "Friday",    evals: 4, weight: 30 },
  { n: 4, type: "scrimmage", date: "2026-06-29", dow: "Sunday",    evals: 4, weight: 30 },
];
const GROUPS = [
  { g: 1, start: "17:00:00", end: "18:15:00" },
  { g: 2, start: "18:15:00", end: "19:30:00" },
];

console.log(`U9 plan — org ${ORG}: ${roster.length} players, ${SESSIONS.length} sessions x ${GROUPS.length} groups, schedule ${SESSIONS[0].date} → ${SESSIONS.at(-1).date}, no scores.`);
if (!COMMIT) { console.log("\nDRY RUN — re-run with --commit."); process.exit(0); }

// Wipe any prior U9 in this org so the script is re-runnable.
const existing = await sql`SELECT id FROM age_categories WHERE organization_id = ${ORG} AND name = 'U9'`;
for (const e of existing) {
  await sql`DELETE FROM evaluation_schedule WHERE age_category_id = ${e.id}`;
  await sql`DELETE FROM category_sessions WHERE age_category_id = ${e.id}`;
  await sql`DELETE FROM scoring_categories WHERE age_category_id = ${e.id}`;
  await sql`DELETE FROM athletes WHERE age_category_id = ${e.id}`;
  await sql`DELETE FROM age_categories WHERE id = ${e.id}`;
}

const [cat] = await sql`
  INSERT INTO age_categories (organization_id, name, status, scoring_scale, scoring_increment, evaluators_required, setup_complete, goalie_eval_mode)
  VALUES (${ORG}, 'U9', 'active', 10, 0.5, 4, true, 'association')
  RETURNING id`;
const CAT = cat.id;

// Clone scoring categories from the U11AA template so U9 mirrors it.
const tmpl = await sql`SELECT name, display_order, applies_to FROM scoring_categories WHERE age_category_id = ${TEMPLATE_CAT} ORDER BY display_order`;
for (const c of tmpl) {
  await sql`INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to) VALUES (${CAT}, ${c.name}, ${c.display_order}, ${c.applies_to})`;
}

// Sessions config (status 'scheduled' = not evaluated yet).
for (const s of SESSIONS) {
  await sql`INSERT INTO category_sessions (age_category_id, session_number, name, session_type, weight_percentage, status, evaluators_required, goalie_evaluators_required)
    VALUES (${CAT}, ${s.n}, ${'Session ' + s.n}, ${s.type}, ${s.weight}, 'scheduled', ${s.evals}, ${s.type === 'testing' ? 0 : 1})`;
}

// Athletes.
for (const p of roster) {
  await sql`INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, position, birth_year, jersey_number, parent_email, is_active)
    VALUES (${ORG}, ${CAT}, ${p.first_name}, ${p.last_name}, ${p.position}, ${p.birth_year}, ${p.jersey_number}, ${p.parent_email}, true)`;
}

// Future schedule.
let rows = 0;
for (const s of SESSIONS) {
  for (const g of GROUPS) {
    await sql`INSERT INTO evaluation_schedule (age_category_id, session_number, group_number, scheduled_date, day_of_week, start_time, end_time, location, status, evaluators_required, goalie_evaluators_required)
      VALUES (${CAT}, ${s.n}, ${g.g}, ${s.date}, ${s.dow}, ${g.start}, ${g.end}, ${'Millwoods Arena - Rink ' + (g.g === 1 ? 'A' : 'B')}, 'scheduled', ${s.evals}, ${s.type === 'testing' ? 0 : 1})`;
    rows++;
  }
}

console.log(`DONE. U9 = category #${CAT}: ${roster.length} players, ${tmpl.length} scoring categories, ${SESSIONS.length} sessions, ${rows} schedule slots. No scores.`);
