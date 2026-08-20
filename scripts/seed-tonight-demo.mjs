// Tonight's live evaluator-meeting test rig: 5 fake associations ("Demo 1".."Demo 5"),
// one standard skater category each, 60 athletes each (all unique names across all 5),
// split into Session 2 / Group 1 (already scored, drives the floor) and Group 2
// (the live game tonight — checked in, 8 open evaluator slots). One director account
// is assigned across all 5 categories so Dan can watch everything land in one place.
//   node scripts/seed-tonight-demo.mjs
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);

const SCALE = 10;
const SESSION_DATE = "2026-08-20";
const START_TIME = "21:00";
const END_TIME = "22:00";
const DIRECTOR = { name: "Demo Director", email: "director.demo@test.sidelinestar.com", password: "DemoNight2026!" };

async function bulk(table, cols, rows) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500), params = [];
    const tuples = chunk.map(r => "(" + cols.map(c => { params.push(r[c]); return "$" + params.length; }).join(",") + ")");
    await sql.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${tuples.join(",")}`, params);
  }
}
let seed = 0x9e3779b9;
const rng = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (m, sd) => { const u = Math.max(1e-9, rng()); return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const half = x => Math.round(x * 2) / 2;
const genCode = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 6; i++) { if (i === 3) s += "-"; s += c[Math.floor(rng() * c.length)]; } return s; };

// ── 1) turf CT Evaluator Demo ──
{
  const orgs = await sql`SELECT id FROM organizations WHERE name = 'CT Evaluator Demo'`;
  for (const o of orgs) await sql`DELETE FROM organizations WHERE id = ${o.id}`;
  const demoEvs = await sql`SELECT id FROM users WHERE email ILIKE 'demo.evaluator.%@demo.sidelinestar.com'`;
  for (const u of demoEvs) {
    const au = await sql`SELECT id FROM auth_users WHERE email = (SELECT email FROM users WHERE id = ${u.id})`;
    for (const a of au) { await sql`DELETE FROM auth_accounts WHERE "userId" = ${a.id}`; await sql`DELETE FROM auth_users WHERE id = ${a.id}`; }
    await sql`DELETE FROM users WHERE id = ${u.id}`;
  }
  console.log(`Turfed CT Evaluator Demo (${orgs.length} org) + ${demoEvs.length} leftover demo evaluator accounts.`);
}

// ── 2) clean any prior run of this script ──
{
  const priorOrgs = await sql`SELECT id FROM organizations WHERE name ~ '^Demo [1-5]$'`;
  for (const p of priorOrgs) {
    const cats = await sql`SELECT id FROM age_categories WHERE organization_id = ${p.id}`;
    for (const c of cats) {
      await sql`DELETE FROM player_checkins WHERE schedule_id IN (SELECT id FROM evaluation_schedule WHERE age_category_id=${c.id})`;
      await sql`DELETE FROM checkin_sessions WHERE age_category_id=${c.id}`;
      await sql`DELETE FROM player_group_assignments WHERE session_group_id IN (SELECT id FROM session_groups WHERE age_category_id=${c.id})`;
      await sql`DELETE FROM session_groups WHERE age_category_id=${c.id}`;
      await sql`DELETE FROM evaluation_schedule WHERE age_category_id=${c.id}`;
      await sql`DELETE FROM category_scores WHERE age_category_id=${c.id}`;
      await sql`DELETE FROM athletes WHERE age_category_id=${c.id}`;
      await sql`DELETE FROM scoring_categories WHERE age_category_id=${c.id}`;
      await sql`DELETE FROM category_sessions WHERE age_category_id=${c.id}`;
      await sql`DELETE FROM director_assignments WHERE age_category_id=${c.id}`;
    }
    await sql`DELETE FROM age_categories WHERE organization_id=${p.id}`;
    await sql`DELETE FROM evaluator_join_codes WHERE organization_id=${p.id}`;
    await sql`DELETE FROM evaluator_memberships WHERE organization_id=${p.id}`;
    await sql`DELETE FROM organizations WHERE id=${p.id}`;
  }
  const u = await sql`SELECT id FROM users WHERE email = ${DIRECTOR.email}`;
  for (const r of u) await sql`DELETE FROM director_assignments WHERE user_id = ${r.id}`;
  await sql`DELETE FROM users WHERE email = ${DIRECTOR.email}`;
  const au = await sql`SELECT id FROM auth_users WHERE email = ${DIRECTOR.email}`;
  for (const r of au) await sql`DELETE FROM auth_accounts WHERE "userId" = ${r.id}`;
  await sql`DELETE FROM auth_users WHERE email = ${DIRECTOR.email}`;
  console.log(`Cleared ${priorOrgs.length} prior Demo N orgs from an earlier run of this script.`);
}

// ── name pools — 30x30 = 900 unique combos, plenty for 300 athletes with zero overlap ──
const FIRST = ["Ella","Mia","Olivia","Ruby","Isla","Lily","Grace","Sophia","Chloe","Zoe","Ava","Emma","Lucas","Liam","Noah","Ethan","Mason","Logan","Jack","Owen","Nora","Ivy","Maya","Leah","Aria","Cole","Reid","Finn","Beau","Jude"];
const LAST = ["Boyd","Chan","Doyle","Flynn","Fraser","Grant","Hale","Kerr","Nash","Patel","Sutton","Walsh","Ward","Reed","Price","Shaw","Dean","Frost","Vance","Webb","Cross","Blair","Hunt","Rowe","Pike","Bell","Fox","Rae","Lark","Vale"];
let globalNameIdx = 0;
function nextName() {
  const combo = globalNameIdx++;
  return { first: FIRST[combo % FIRST.length], last: LAST[Math.floor(combo / FIRST.length) % LAST.length] };
}

const SKATER_SKILLS = ["Skating", "Puck Skills", "Hockey IQ", "Effort / Compete"];
const CLUB_LOC = (i) => `Demo Arena ${i}`;
const DOW = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const dayOfWeek = DOW[new Date(SESSION_DATE + "T00:00:00Z").getUTCDay()];

const results = [];
for (let i = 1; i <= 5; i++) {
  const orgName = `Demo ${i}`;
  const [org] = await sql`INSERT INTO organizations (name, type, contact_email) VALUES (${orgName}, 'association', ${`demo${i}@test.sidelinestar.com`}) RETURNING id`;

  const [cat] = await sql`
    INSERT INTO age_categories (organization_id, name, min_age, max_age, status, scoring_scale, scoring_increment, setup_complete, evaluates_goalies, eval_format, evaluators_required)
    VALUES (${org.id}, 'U15 AA', 13, 15, 'active', ${SCALE}, 0.5, true, false, 'standard', 8) RETURNING id`;
  const CAT = cat.id;

  await bulk("category_sessions", ["age_category_id","session_number","name","session_type","weight_percentage","status"], [
    { age_category_id: CAT, session_number: 1, name: "Session 1", session_type: "skills", weight_percentage: 30, status: "complete" },
    { age_category_id: CAT, session_number: 2, name: "Session 2", session_type: "scrimmage", weight_percentage: 30, status: "scheduled" },
  ]);

  let disp = 1;
  await bulk("scoring_categories", ["age_category_id","name","display_order","applies_to"], SKATER_SKILLS.map(n => ({ age_category_id: CAT, name: n, display_order: disp++, applies_to: "all" })));
  const scats = await sql`SELECT id FROM scoring_categories WHERE age_category_id=${CAT} ORDER BY display_order`;
  const skillIds = scats.map(s => s.id);

  // 60 skaters, unique names across all 5 clubs, jersey 1-60, forward/defense mix
  const athRows = [];
  for (let n = 0; n < 60; n++) {
    const { first, last } = nextName();
    athRows.push({
      organization_id: org.id, age_category_id: CAT, first_name: first, last_name: last,
      jersey_number: n + 1, position: n % 3 === 2 ? "defense" : "forward",
      parent_email: `${first}.${last}@example.com`.toLowerCase(), is_active: true,
    });
  }
  await bulk("athletes", ["organization_id","age_category_id","first_name","last_name","jersey_number","position","parent_email","is_active"], athRows);
  const A = await sql`SELECT id, jersey_number FROM athletes WHERE age_category_id=${CAT} ORDER BY jersey_number`;
  const group1Athletes = A.slice(0, 30), group2Athletes = A.slice(30, 60);

  // session 2, groups 1 + 2 (group 1 = already scored, drives the floor; group 2 = tonight)
  await bulk("session_groups", ["age_category_id","session_number","group_number","name","display_order"], [
    { age_category_id: CAT, session_number: 2, group_number: 1, name: "Group 1", display_order: 1 },
    { age_category_id: CAT, session_number: 2, group_number: 2, name: "Group 2", display_order: 2 },
  ]);
  const [sg1, sg2] = await sql`SELECT id, group_number FROM session_groups WHERE age_category_id=${CAT} AND session_number=2 ORDER BY group_number`;
  await bulk("player_group_assignments", ["athlete_id","session_group_id","display_order"], [
    ...group1Athletes.map((a, idx) => ({ athlete_id: a.id, session_group_id: sg1.id, display_order: idx })),
    ...group2Athletes.map((a, idx) => ({ athlete_id: a.id, session_group_id: sg2.id, display_order: idx })),
  ]);

  // 2 seed evaluators to author group 1's already-in scores
  const evs = [];
  for (const nm of [`${orgName} Evaluator A`, `${orgName} Evaluator B`]) {
    const email = nm.toLowerCase().replace(/\s+/g, ".") + "@test.sidelinestar.com";
    const [u] = await sql`INSERT INTO users (email, name, role) VALUES (${email}, ${nm}, 'association_evaluator') RETURNING id`;
    await sql`INSERT INTO evaluator_memberships (user_id, organization_id, status, is_evaluator) VALUES (${u.id}, ${org.id}, 'active', true)`;
    evs.push(u.id);
  }

  // group 1 scores — per-athlete ability + evaluator noise, so the floor (lowest
  // per-athlete average) is a real, meaningful number, not a flat line.
  const abil = new Map(); for (const s of group1Athletes) abil.set(s.id, clamp(gauss(6.2, 1.2), 3.0, 9.3));
  const catScores = [];
  for (const s of group1Athletes) {
    const shift = gauss(0, 0.25);
    for (const skillId of skillIds) for (const ev of evs) {
      catScores.push({ athlete_id: s.id, age_category_id: CAT, session_number: 2, evaluator_id: ev, scoring_category_id: skillId, score: clamp(half(abil.get(s.id) + shift + gauss(0, 0.5)), 0.5, SCALE), scored_via: "manual" });
    }
  }
  await bulk("category_scores", ["athlete_id","age_category_id","session_number","evaluator_id","scoring_category_id","score","scored_via"], catScores);

  // ONE schedule row: Session 2 / Group 2, tonight, 8 open evaluator slots
  const checkinCode = genCode();
  const [sched] = await sql`
    INSERT INTO evaluation_schedule (age_category_id, session_number, group_number, scheduled_date, day_of_week, start_time, end_time, location, checkin_code, checkin_code_active, evaluators_required, status)
    VALUES (${CAT}, 2, 2, ${SESSION_DATE}, ${dayOfWeek}, ${START_TIME}, ${END_TIME}, ${CLUB_LOC(i)}, ${checkinCode}, true, 8, 'scheduled')
    RETURNING id`;

  // check group 2 in already
  const [cs] = await sql`INSERT INTO checkin_sessions (schedule_id, age_category_id, team_colors, is_open) VALUES (${sched.id}, ${CAT}, ${JSON.stringify(["White","Dark"])}, true) RETURNING id`;
  await bulk("player_checkins", ["athlete_id","schedule_id","checkin_session_id","jersey_number","team_color","checked_in","checked_in_at"],
    group2Athletes.map((a, idx) => ({ athlete_id: a.id, schedule_id: sched.id, checkin_session_id: cs.id, jersey_number: a.jersey_number, team_color: idx % 2 === 0 ? "White" : "Dark", checked_in: true, checked_in_at: new Date().toISOString() })));

  // evaluator join code so real attendees can self-serve join this club tonight
  const [joinCode] = await sql`INSERT INTO evaluator_join_codes (organization_id, code, max_uses, uses) VALUES (${org.id}, ${genCode()}, 20, 0) RETURNING code`;

  // director assignment (same director user across all 5 — created after the loop)
  results.push({ org: orgName, orgId: org.id, catId: CAT, scheduleId: sched.id, checkinCode, joinCode: joinCode.code, evaluatorsRequired: 8 });
  console.log(`✅ ${orgName}: org=${org.id} cat=${CAT} schedule=${sched.id} checkin=${checkinCode} join-code=${joinCode.code}`);
}

// ── director account, assigned across all 5 categories ──
const hash = await bcrypt.hash(DIRECTOR.password, 12);
const [au] = await sql`INSERT INTO auth_users (email, name, "emailVerified") VALUES (${DIRECTOR.email}, ${DIRECTOR.name}, NOW()) RETURNING id`;
await sql`INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password) VALUES (${au.id}, 'credentials', 'credentials', ${DIRECTOR.email}, ${hash})`;
const [dirUser] = await sql`INSERT INTO users (email, name, role) VALUES (${DIRECTOR.email}, ${DIRECTOR.name}, 'director') RETURNING id`;
for (const r of results) {
  await sql`INSERT INTO director_assignments (user_id, age_category_id, organization_id, status) VALUES (${dirUser.id}, ${r.catId}, ${r.orgId}, 'active')`;
}

console.log("\n================ TONIGHT'S RIG IS READY ================");
console.log(`\nDIRECTOR LOGIN (watch all 5 clubs in one overview)`);
console.log(`  URL:      ${process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com"}/account/signin`);
console.log(`  Email:    ${DIRECTOR.email}`);
console.log(`  Password: ${DIRECTOR.password}`);
console.log(`\nPER-CLUB EVALUATOR JOIN CODES (hand these out — attendees sign up, get approved, then pick up the Session 2 / Group 2 slot)`);
for (const r of results) console.log(`  ${r.org.padEnd(8)} join code: ${r.joinCode}   checkin code: ${r.checkinCode}   8 evaluator slots open`);
console.log(`\nEach club: 60 skaters, Session 2 Group 1 already scored (drives the floor), Session 2 Group 2 is tonight's live game — 30 players checked in, ${START_TIME} ${SESSION_DATE}, 8 evaluator slots open.`);
