// Millwoods demo: one association with TWO U11 categories (Tier 1 = tournament,
// House = standard) and ONE director assigned to BOTH — to show the multi-category
// director overview. Prints working login credentials.
//   node scripts/seed-millwoods-demo.mjs
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);

const ORG_NAME = "Millwoods Minor Hockey";
const DIRECTOR = { name: "Dana Millwood", email: "director.millwoods@demo.sidelinestar.com", password: "millwoods2026" };
const SCALE = 10, THROUGH = 2;

async function bulk(table, cols, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500), params = [];
    const tuples = chunk.map(r => "(" + cols.map(c => { params.push(r[c]); return "$" + params.length; }).join(",") + ")");
    await sql.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${tuples.join(",")}`, params);
  }
}
let seed = 0x9e3779b9 ^ ORG_NAME.length;
const rng = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (m, sd) => { const u = Math.max(1e-9, rng()); return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const half = x => Math.round(x * 2) / 2;
const code = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 6; i++) s += c[Math.floor(rng() * c.length)]; return s; };

// ── clean any prior run ──
const prior = await sql`SELECT id FROM organizations WHERE name = ${ORG_NAME}`;
for (const p of prior) {
  const cats = await sql`SELECT id FROM age_categories WHERE organization_id = ${p.id}`;
  for (const c of cats) {
    await sql`DELETE FROM player_group_assignments WHERE session_group_id IN (SELECT id FROM session_groups WHERE age_category_id=${c.id})`;
    await sql`DELETE FROM session_groups WHERE age_category_id=${c.id}`;
    await sql`DELETE FROM evaluation_schedule WHERE age_category_id=${c.id}`;
    await sql`DELETE FROM category_scores WHERE age_category_id=${c.id}`;
    await sql`DELETE FROM testing_drill_results WHERE age_category_id=${c.id}`;
    await sql`DELETE FROM testing_results WHERE age_category_id=${c.id}`;
    await sql`DELETE FROM player_notes WHERE age_category_id=${c.id}`;
    await sql`DELETE FROM athletes WHERE age_category_id=${c.id}`;
    await sql`DELETE FROM scoring_categories WHERE age_category_id=${c.id}`;
    await sql`DELETE FROM category_sessions WHERE age_category_id=${c.id}`;
    await sql`DELETE FROM director_assignments WHERE age_category_id=${c.id}`;
  }
  await sql`DELETE FROM age_categories WHERE organization_id=${p.id}`;
  await sql`DELETE FROM evaluator_memberships WHERE organization_id=${p.id}`;
  await sql`DELETE FROM organizations WHERE id=${p.id}`;
}
// clean prior director records
{
  const u = await sql`SELECT id FROM users WHERE email = ${DIRECTOR.email}`;
  for (const r of u) await sql`DELETE FROM director_assignments WHERE user_id = ${r.id}`;
  await sql`DELETE FROM users WHERE email = ${DIRECTOR.email}`;
  const au = await sql`SELECT id FROM auth_users WHERE email = ${DIRECTOR.email}`;
  for (const r of au) await sql`DELETE FROM auth_accounts WHERE "userId" = ${r.id}`;
  await sql`DELETE FROM auth_users WHERE email = ${DIRECTOR.email}`;
}

// ── org ──
const [org] = await sql`INSERT INTO organizations (name, type, contact_email) VALUES (${ORG_NAME}, 'association', ${"millwoods@demo.sidelinestar.com"}) RETURNING id`;
seed ^= org.id * 2654435761;

const FIRST = ["Ella","Mia","Olivia","Ruby","Isla","Lily","Grace","Sophia","Chloe","Zoe","Ava","Emma","Lucas","Liam","Noah","Ethan","Mason","Logan","Jack","Owen","Nora","Ivy","Maya","Leah","Aria","Ari","Cole","Reid","Finn","Beau","Jude","Rhys","Kai","Ren","Nash","Tate"];
const LAST = ["Boyd","Chan","Doyle","Flynn","Fraser","Grant","Hale","Kerr","Nash","Patel","Sutton","Walsh","Ward","Reed","Cole","Price","Shaw","Dean","Frost","Vance","Webb","Cross","Blair","Hunt","Rowe","Pike","Bell","Fox","Snow","Rae","Lark","Vale","Moss","Bird","Wolfe","Sloan"];
const pem = (f, l) => `${f}.${l}@example.com`.toLowerCase();
const SKATER = ["Skating","Puck Skills","Effort / Compete","Hockey IQ"];

// Seed one category fully. Returns its id.
async function seedCategory(name, format) {
  const [cat] = await sql`
    INSERT INTO age_categories (organization_id, name, min_age, max_age, status, scoring_scale, scoring_increment, setup_complete, evaluates_goalies, eval_format)
    VALUES (${org.id}, ${name}, 9, 11, 'active', ${SCALE}, 0.5, true, false, ${format}) RETURNING id`;
  const CAT = cat.id;

  await bulk("category_sessions", ["age_category_id","session_number","name","session_type","weight_percentage","status"], [
    { age_category_id:CAT, session_number:1, name:"Session 1", session_type:"testing",   weight_percentage:10, status: THROUGH>=1?"complete":"scheduled" },
    { age_category_id:CAT, session_number:2, name:"Session 2", session_type:"scrimmage", weight_percentage:30, status: THROUGH>=2?"complete":"scheduled" },
    { age_category_id:CAT, session_number:3, name:"Session 3", session_type:"scrimmage", weight_percentage:30, status:"scheduled" },
    { age_category_id:CAT, session_number:4, name:"Session 4", session_type:"scrimmage", weight_percentage:30, status:"scheduled" },
  ]);

  let disp = 1;
  await bulk("scoring_categories", ["age_category_id","name","display_order","applies_to"], SKATER.map(n => ({ age_category_id:CAT, name:n, display_order:disp++, applies_to:"all" })));
  const scats = await sql`SELECT id FROM scoring_categories WHERE age_category_id=${CAT} AND applies_to='all'`;
  const skaterCatIds = scats.map(s => s.id);

  const evs = [];
  for (const nm of ["Mike Reid","Sarah Lowe","Tom Park","Lisa Chen"]) {
    const email = nm.toLowerCase().replace(/\s+/g,".") + "." + CAT + "@demo.sidelinestar.com";
    const [u] = await sql`INSERT INTO users (email, name, role) VALUES (${email}, ${nm}, 'association_evaluator') RETURNING id`;
    await sql`INSERT INTO evaluator_memberships (user_id, organization_id, is_evaluator, status) VALUES (${u.id}, ${org.id}, true, 'active')`;
    evs.push(u.id);
  }

  const N = 30;
  const athRows = [];
  for (let i = 0; i < N; i++) athRows.push({ organization_id:org.id, age_category_id:CAT, first_name:FIRST[i], last_name:LAST[i], position:(i%3===2?"defense":"forward"), parent_email:pem(FIRST[i],LAST[i]), is_active:true });
  await bulk("athletes", ["organization_id","age_category_id","first_name","last_name","position","parent_email","is_active"], athRows);
  const A = await sql`SELECT id FROM athletes WHERE age_category_id=${CAT} ORDER BY id`;

  // schedule + groups + assignments (3 groups/session)
  const DOW = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const SESSION_DATE = { 1:"2026-08-24", 2:"2026-08-27", 3:"2026-08-31", 4:"2026-09-03" };
  const SLOTS = [["18:00","19:00"],["19:15","20:15"],["20:30","21:30"]];
  const LOC = "Millwoods Rec Centre";
  const NGROUPS = 3;
  const schedRows = [], sgRows = [];
  for (let sNum = 1; sNum <= 4; sNum++) {
    const date = SESSION_DATE[sNum], dow = DOW[new Date(date+"T00:00:00Z").getUTCDay()];
    const type = sNum === 1 ? "testing" : "scrimmage";
    for (let g = 1; g <= NGROUPS; g++) {
      const [st,en] = SLOTS[g-1];
      schedRows.push({ age_category_id:CAT, session_number:sNum, group_number:g, scheduled_date:date, day_of_week:dow, start_time:st, end_time:en, location:LOC, checkin_code:code(), evaluators_required: type==="testing"?0:4, status:"scheduled" });
      sgRows.push({ age_category_id:CAT, session_number:sNum, group_number:g, name:`Group ${g}`, display_order:g });
    }
  }
  await bulk("evaluation_schedule", ["age_category_id","session_number","group_number","scheduled_date","day_of_week","start_time","end_time","location","checkin_code","evaluators_required","status"], schedRows);
  await bulk("session_groups", ["age_category_id","session_number","group_number","name","display_order"], sgRows);
  const groupsById = await sql`SELECT id, session_number, group_number FROM session_groups WHERE age_category_id=${CAT}`;
  const sgKey = (s,g) => groupsById.find(x => x.session_number===s && x.group_number===g)?.id;
  const pgaRows = [];
  for (let sNum = 1; sNum <= 4; sNum++) A.forEach((a,idx) => pgaRows.push({ athlete_id:a.id, session_group_id:sgKey(sNum,(idx%NGROUPS)+1), display_order:idx }));
  await bulk("player_group_assignments", ["athlete_id","session_group_id","display_order"], pgaRows);

  // scores
  const abil = new Map(); for (const s of A) abil.set(s.id, clamp(gauss(6.3,1.15),3.6,9.2));
  const catScores = [], drillRows = [], testRows = [];
  const SCRIM = [2,3,4].filter(s => s <= THROUGH);
  for (const sNum of SCRIM) for (const s of A) {
    const shift = gauss(0,0.22);
    for (const cid of skaterCatIds) for (const ev of evs) catScores.push({ athlete_id:s.id, age_category_id:CAT, session_number:sNum, evaluator_id:ev, scoring_category_id:cid, score: clamp(half(abil.get(s.id)+shift+gauss(0,0.5)),1,SCALE), scored_via:"manual" });
  }
  if (THROUGH >= 1) {
    const order = [...A].sort((a,b) => abil.get(b.id)-abil.get(a.id));
    order.forEach((s,pos) => drillRows.push({ athlete_id:s.id, age_category_id:CAT, session_number:1, overall_rank:pos+1 }));
    const TESTS = [["Forward Sprint",4.4,5.6],["Weave Agility",9.6,12.4],["Stop and Start",8.8,11.6]];
    const mn = Math.min(...A.map(s=>abil.get(s.id))), mx = Math.max(...A.map(s=>abil.get(s.id)));
    for (const [tn,fast,slow] of TESTS) {
      const vals = A.map(s => { const pct=(abil.get(s.id)-mn)/(mx-mn); const v=Math.round((fast+(slow-fast)*clamp((1-pct)+gauss(0,0.13),0,1))*100)/100; return { id:s.id, v }; });
      const sorted = [...vals].sort((a,b)=>a.v-b.v); const rk = new Map(); sorted.forEach((r,i)=>rk.set(r.id,i+1));
      for (const r of vals) testRows.push({ athlete_id:r.id, age_category_id:CAT, session_number:1, test_name:tn, value:r.v, test_rank:rk.get(r.id) });
    }
  }
  await bulk("category_scores", ["athlete_id","age_category_id","session_number","evaluator_id","scoring_category_id","score","scored_via"], catScores);
  if (drillRows.length) await bulk("testing_drill_results", ["athlete_id","age_category_id","session_number","overall_rank"], drillRows);
  if (testRows.length) await bulk("testing_results", ["athlete_id","age_category_id","session_number","test_name","value","test_rank"], testRows);
  return CAT;
}

const catTier1 = await seedCategory("U11 Tier 1", "round_robin");
const catHouse = await seedCategory("U11 House", "standard");

// ── director account (auth + app user) assigned to BOTH categories ──
const hash = await bcrypt.hash(DIRECTOR.password, 12);
const [au] = await sql`INSERT INTO auth_users (email, name, "emailVerified") VALUES (${DIRECTOR.email}, ${DIRECTOR.name}, NOW()) RETURNING id`;
await sql`INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password) VALUES (${au.id}, 'credentials', 'credentials', ${DIRECTOR.email}, ${hash})`;
const [appUser] = await sql`INSERT INTO users (email, name, role) VALUES (${DIRECTOR.email}, ${DIRECTOR.name}, 'director') RETURNING id`;
for (const c of [catTier1, catHouse]) {
  await sql`INSERT INTO director_assignments (user_id, age_category_id, organization_id, status) VALUES (${appUser.id}, ${c}, ${org.id}, 'active') ON CONFLICT (user_id, age_category_id) DO UPDATE SET status='active'`;
}

console.log("✅ Millwoods demo ready");
console.log(`   org=${org.id}  U11 Tier 1=${catTier1} (tournament)  U11 House=${catHouse} (standard)`);
console.log("");
console.log("   DIRECTOR LOGIN");
console.log(`   URL:      ${process.env.NEXT_PUBLIC_BASE_URL || "https://<your-domain>"}/account/signin`);
console.log(`   Email:    ${DIRECTOR.email}`);
console.log(`   Password: ${DIRECTOR.password}`);
console.log(`   → lands on /director/dashboard with BOTH U11 categories in the overview.`);
