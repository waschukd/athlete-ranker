// Fast demo seeder: creates a fresh association + one age category with 50
// skaters + 4 goalies, scores sessions 1..COMPLETE_THROUGH, and (optionally)
// adds comments. Goalies are position='goalie' and scored on the goalie
// categories, so they rank only against goalies.
//
//   node scripts/seed-demo.mjs "Demo Soci 2" 2
//   node scripts/seed-demo.mjs "Demo Soci 3" 4 notes
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);

const NAME = process.argv[2] || "Demo Soci 2";
const THROUGH = parseInt(process.argv[3] || "2");
const WITH_NOTES = process.argv.includes("notes");
const SCALE = 10;

// ── bulk insert helper (one round trip per ~500 rows) ──
async function bulk(table, cols, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500), params = [];
    const tuples = chunk.map(r => "(" + cols.map(c => { params.push(r[c]); return "$" + params.length; }).join(",") + ")");
    await sql.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${tuples.join(",")}`, params);
  }
}
// seeded RNG so runs are stable
let seed = 0x9e3779b9 ^ NAME.length;
const rng = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (m, sd) => { const u = Math.max(1e-9, rng()); return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const half = x => Math.round(x * 2) / 2;

// ── clean any prior run with this name ──
const prior = await sql`SELECT id FROM organizations WHERE name = ${NAME}`;
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
  }
  await sql`DELETE FROM age_categories WHERE organization_id=${p.id}`;
  await sql`DELETE FROM organizations WHERE id=${p.id}`;
}

// ── org + category ──
const [org] = await sql`INSERT INTO organizations (name, type, contact_email) VALUES (${NAME}, 'association', ${NAME.toLowerCase().replace(/\s+/g,"")+"@demo.sidelinestar.com"}) RETURNING id`;
seed ^= org.id * 2654435761; // per-org randomness → unique checkin codes across seeds
const goalieCfg = {
  scale: SCALE, increment: 0.5,
  sessions: [{ session_number:1, session_type:"testing" },{ session_number:2, session_type:"scrimmage" },{ session_number:3, session_type:"scrimmage" },{ session_number:4, session_type:"scrimmage" }],
};
const [cat] = await sql`
  INSERT INTO age_categories (organization_id, name, min_age, max_age, status, scoring_scale, scoring_increment, setup_complete, evaluates_goalies, eval_format, goalie_config)
  VALUES (${org.id}, 'U11 House', 9, 11, 'active', ${SCALE}, 0.5, true, true, 'standard', ${JSON.stringify(goalieCfg)}) RETURNING id`;
const CAT = cat.id;

// ── sessions ──
await bulk("category_sessions", ["age_category_id","session_number","name","session_type","weight_percentage","status"], [
  { age_category_id:CAT, session_number:1, name:"Session 1", session_type:"testing",   weight_percentage:10, status: THROUGH>=1?"complete":"scheduled" },
  { age_category_id:CAT, session_number:2, name:"Session 2", session_type:"scrimmage", weight_percentage:30, status: THROUGH>=2?"complete":"scheduled" },
  { age_category_id:CAT, session_number:3, name:"Session 3", session_type:"scrimmage", weight_percentage:30, status: THROUGH>=3?"complete":"scheduled" },
  { age_category_id:CAT, session_number:4, name:"Session 4", session_type:"scrimmage", weight_percentage:30, status: THROUGH>=4?"complete":"scheduled" },
]);

// ── scoring categories ──
const SKATER = ["Skating","Puck Skills","Effort / Compete","Hockey IQ"];
const GOALIE = ["Skating / Balance / Agility","Positioning / Angles / Net Coverage","Feet / Hands / Stick / Rebounds","Anticipation / Reading the Play"];
const GSKILLS = ["Mobility","Rebound Control","Positioning & Awareness","Battle & Compete"];
let disp = 1;
const scatRows = [];
for (const n of SKATER) scatRows.push({ age_category_id:CAT, name:n, display_order:disp++, applies_to:"all" });
for (const n of GOALIE) scatRows.push({ age_category_id:CAT, name:n, display_order:disp++, applies_to:"goalies" });
for (const n of GSKILLS) scatRows.push({ age_category_id:CAT, name:n, display_order:disp++, applies_to:"goalie_skills" });
await bulk("scoring_categories", ["age_category_id","name","display_order","applies_to"], scatRows);
const scats = await sql`SELECT id, name, applies_to FROM scoring_categories WHERE age_category_id=${CAT}`;
const skaterCatIds = scats.filter(s=>s.applies_to==="all").map(s=>s.id);
const goalieCatIds = scats.filter(s=>s.applies_to==="goalies").map(s=>s.id);

// ── evaluators ──
const evs = [];
for (const nm of ["Mike Reid","Sarah Lowe","Tom Park","Lisa Chen"]) {
  const email = nm.toLowerCase().replace(/\s+/g,".")+"."+org.id+"@demo.sidelinestar.com";
  const [u] = await sql`INSERT INTO users (email, name, role) VALUES (${email}, ${nm}, 'association_evaluator') RETURNING id`;
  await sql`INSERT INTO evaluator_memberships (user_id, organization_id, is_evaluator, status) VALUES (${u.id}, ${org.id}, true, 'active')`;
  evs.push(u.id);
}

// ── athletes: 50 skaters + 4 goalies ──
const FIRST = ["Ella","Mia","Olivia","Ruby","Isla","Lily","Grace","Sophia","Chloe","Zoe","Ava","Emma","Lucas","Liam","Noah","Ethan","Mason","Logan","Jack","Owen","Nora","Ivy","Maya","Leah","Aria","Ari","Cole","Reid","Finn","Beau","Jude","Rhys","Kai","Ren","Nash","Tate","Wren","Sage","Bo","Rex","Ada","Elle","June","Faye","Wade","Cade","Dax","Gus","Hank","Iris","Jett","Knox","Lane","Vera"];
const LAST = ["Boyd","Chan","Doyle","Flynn","Fraser","Grant","Hale","Kerr","Nash","Patel","Sutton","Walsh","Ward","Reed","Cole","Price","Shaw","Dean","Frost","Vance","Webb","Cross","Blair","Hunt","Rowe","Pike","Bell","Fox","Snow","Rae","Lark","Vale","Moss","Bird","Wolfe","Sloan","Quinn","Dale","Peck","Ash","York","Lund","Kane","Wren","Hays","Nolan","Judd","Marsh","Pryor","Roach","Sable","Teal","Voss","Wynn"];
// parent_email uses example.com so the email flow shows real recipients in the
// preview without spamming anyone if "send" is clicked in a demo.
const pem = (f,l) => `${f}.${l}@example.com`.toLowerCase();
const athRows = [];
for (let i=0;i<50;i++) athRows.push({ organization_id:org.id, age_category_id:CAT, first_name:FIRST[i], last_name:LAST[i], position: (i%3===2?"defense":"forward"), parent_email:pem(FIRST[i],LAST[i]), is_active:true });
for (let i=0;i<4;i++){ const f=["Gabe","Iris","Milo","Remy"][i], l=["Vaughn","Keller","Osei","Dunn"][i]; athRows.push({ organization_id:org.id, age_category_id:CAT, first_name:f, last_name:l, position:"goalie", parent_email:pem(f,l), is_active:true }); }
await bulk("athletes", ["organization_id","age_category_id","first_name","last_name","position","parent_email","is_active"], athRows);
const A = await sql`SELECT id, position FROM athletes WHERE age_category_id=${CAT} ORDER BY id`;
const skaters = A.filter(a=>a.position!=="goalie"), goalies = A.filter(a=>a.position==="goalie");

// ── schedule + groups + assignments (so the Schedule tab populates and group
// emails have recipients). Upcoming dates so it shows by default. 3 groups/session. ──
const code = () => { const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s=""; for(let i=0;i<6;i++) s+=c[Math.floor(rng()*c.length)]; return s; };
const DOW = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const SESSION_DATE = { 1:"2026-08-11", 2:"2026-08-14", 3:"2026-08-18", 4:"2026-08-21" };
const SLOTS = [["18:00","19:00"],["19:15","20:15"],["20:30","21:30"]];
const LOC = "Demo Ice Centre";
const NGROUPS = 3;
const schedRows = [], sgRows = [];
for (let sNum=1; sNum<=4; sNum++) {
  const date = SESSION_DATE[sNum], dow = DOW[new Date(date+"T00:00:00Z").getUTCDay()];
  const type = sNum===1 ? "testing" : "scrimmage";
  for (let g=1; g<=NGROUPS; g++) {
    const [st,en] = SLOTS[g-1];
    schedRows.push({ age_category_id:CAT, session_number:sNum, group_number:g, scheduled_date:date, day_of_week:dow, start_time:st, end_time:en, location:LOC, checkin_code:code(), evaluators_required: type==="testing"?0:4, status:"scheduled" });
    sgRows.push({ age_category_id:CAT, session_number:sNum, group_number:g, name:`Group ${g}`, display_order:g });
  }
}
await bulk("evaluation_schedule", ["age_category_id","session_number","group_number","scheduled_date","day_of_week","start_time","end_time","location","checkin_code","evaluators_required","status"], schedRows);
await bulk("session_groups", ["age_category_id","session_number","group_number","name","display_order"], sgRows);
// assign every athlete to a group per session (stable group across sessions)
const groupsById = await sql`SELECT id, session_number, group_number FROM session_groups WHERE age_category_id=${CAT}`;
const sgKey = (s,g) => groupsById.find(x=>x.session_number===s && x.group_number===g)?.id;
const pgaRows = [];
for (let sNum=1; sNum<=4; sNum++) A.forEach((a,idx)=>{ const g=(idx%NGROUPS)+1; pgaRows.push({ athlete_id:a.id, session_group_id:sgKey(sNum,g), display_order:idx }); });
await bulk("player_group_assignments", ["athlete_id","session_group_id","display_order"], pgaRows);

// ── skater latent ability + scores ──
const abil = new Map(); for (const s of skaters) abil.set(s.id, clamp(gauss(6.3,1.15),3.6,9.2));
const catScores = [], drillRows = [], testRows = [], notes = [];
const SCRIM = [2,3,4].filter(s=>s<=THROUGH);

// scrimmage scores for skaters
for (const sNum of SCRIM) for (const s of skaters) {
  const shift = gauss(0,0.22);
  for (const cid of skaterCatIds) for (const ev of evs) {
    catScores.push({ athlete_id:s.id, age_category_id:CAT, session_number:sNum, evaluator_id:ev, scoring_category_id:cid, score: clamp(half(abil.get(s.id)+shift+gauss(0,0.5)),1,SCALE), scored_via:"manual" });
  }
}
// goalie scores (own categories) — a scrimmage-based goalie ranking, only if any scrimmage is complete
for (const sNum of SCRIM) for (const g of goalies) {
  const base = clamp(gauss(6.5,1.1),4,9);
  for (const cid of goalieCatIds) for (const ev of evs) {
    catScores.push({ athlete_id:g.id, age_category_id:CAT, session_number:sNum, evaluator_id:ev, scoring_category_id:cid, score: clamp(half(base+gauss(0,0.5)),1,SCALE), scored_via:"manual" });
  }
}
// testing (session 1) for skaters — overall_rank drives the ranking
if (THROUGH>=1) {
  const order = [...skaters].sort((a,b)=>abil.get(b.id)-abil.get(a.id));
  order.forEach((s,pos)=>drillRows.push({ athlete_id:s.id, age_category_id:CAT, session_number:1, overall_rank:pos+1 }));
  const TESTS = [["Forward Sprint",4.4,5.6],["Weave Agility",9.6,12.4],["Stop and Start",8.8,11.6]];
  const mn=Math.min(...skaters.map(s=>abil.get(s.id))), mx=Math.max(...skaters.map(s=>abil.get(s.id)));
  for (const [name,fast,slow] of TESTS) {
    const vals = skaters.map(s=>{ const pct=(abil.get(s.id)-mn)/(mx-mn); const v=Math.round((fast+(slow-fast)*clamp((1-pct)+gauss(0,0.13),0,1))*100)/100; return { id:s.id, v }; });
    const sorted=[...vals].sort((a,b)=>a.v-b.v); const rk=new Map(); sorted.forEach((r,i)=>rk.set(r.id,i+1));
    for (const r of vals) testRows.push({ athlete_id:r.id, age_category_id:CAT, session_number:1, test_name:name, value:r.v, test_rank:rk.get(r.id) });
  }
}
// notes — 4-5 per skater across scored sessions
if (WITH_NOTES) {
  const POOL = ["Clearly drives play — first to loose pucks and wins more than his share of battles.","High-end edges and acceleration; separates from pressure with ease.","Reads the ice a step ahead, consistently in the right spot without the puck.","Solid, dependable shift-to-shift; quiet but effective in all three zones.","Good skating base; will benefit from quicker first three strides.","Makes the simple play well — room to add deception with the puck.","Engaged and coachable; competes hard along the boards.","Works hard every shift — skating mechanics are the next step.","Willing competitor; puck control under pressure is developing.","Improving each session; first-step quickness is a focus area.","Battles for position; will gain confidence with more puck touches.","Strong compete level; needs to keep his feet moving through contact."];
  for (const s of skaters) {
    const count = 4 + (Math.floor(rng()*2)); // 4 or 5
    for (let k=0;k<count;k++) {
      const sess = SCRIM.length ? SCRIM[k % SCRIM.length] : 2;
      notes.push({ athlete_id:s.id, age_category_id:CAT, session_number:sess, evaluator_id:evs[k%evs.length], note_text:POOL[(s.id+k)%POOL.length], scored_via:"manual" });
    }
  }
}

await bulk("category_scores", ["athlete_id","age_category_id","session_number","evaluator_id","scoring_category_id","score","scored_via"], catScores);
if (drillRows.length) await bulk("testing_drill_results", ["athlete_id","age_category_id","session_number","overall_rank"], drillRows);
if (testRows.length) await bulk("testing_results", ["athlete_id","age_category_id","session_number","test_name","value","test_rank"], testRows);
if (notes.length) await bulk("player_notes", ["athlete_id","age_category_id","session_number","evaluator_id","note_text","scored_via"], notes);

console.log(`✅ ${NAME}  org=${org.id} cat=${CAT}`);
console.log(`   ${skaters.length} skaters + ${goalies.length} goalies · sessions complete through ${THROUGH}`);
console.log(`   category_scores=${catScores.length} testing_drill=${drillRows.length} testing_results=${testRows.length} notes=${notes.length}`);
console.log(`   view: /association/dashboard/category/${CAT}?org=${org.id}`);
