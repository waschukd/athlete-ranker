import { connect } from "./_db.mjs";
import { arenaLabel } from "../src/lib/arenas.js";
const sql = connect(import.meta.url);
const DAY = "2026-09-14";
const rows = await sql`
  SELECT es.id, es.start_time, es.end_time, es.location,
         COALESCE(es.evaluators_required, cs.evaluators_required, 0) AS req,
         c.name AS cat, o.name AS org, COALESCE(cs.session_type,'evaluation') AS stype, es.session_number sn, es.group_number gn,
         ARRAY_REMOVE(ARRAY_AGG(u.name ORDER BY u.name) FILTER (WHERE ess.status='signed_up'), NULL) AS who
  FROM evaluation_schedule es
  JOIN age_categories c ON c.id = es.age_category_id JOIN organizations o ON o.id = c.organization_id
  LEFT JOIN category_sessions cs ON cs.age_category_id = es.age_category_id AND cs.session_number = es.session_number
  LEFT JOIN evaluator_session_signups ess ON ess.schedule_id = es.id AND ess.status='signed_up'
  LEFT JOIN users u ON u.id = ess.user_id
  WHERE es.scheduled_date = ${DAY} AND es.status='scheduled'
    AND o.id IN (SELECT association_id FROM sp_association_links WHERE service_provider_id=16 AND status='active')
    AND o.name NOT ILIKE '%demo%' AND COALESCE(cs.session_type,'evaluation') <> 'testing'
  GROUP BY es.id, cs.evaluators_required, cs.session_type, c.name, o.name ORDER BY es.start_time, o.name`;
const mins = t => { const [h,m] = String(t).split(":").map(Number); return h*60+m; };
const hm = m => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const rink = l => (l||"?").replace(/ - .*/,"").replace(/ Arena| Rink/i,"").trim();
const sessions = rows.map(r => ({ ...r, s: mins(r.start_time), e: mins(r.end_time), who: r.who||[], rink: rink(r.location) }));

console.log(`MONDAY ${DAY} -- ${sessions.length} sessions\n`);
console.log("FULL SCHEDULE:");
for (const x of sessions) {
  const gap = x.req - x.who.length;
  console.log(`  ${hm(x.s)}-${hm(x.e)}  ${arenaLabel(x.location).padEnd(46)} ${(x.org+" "+x.cat).padEnd(40)} S${x.sn}G${x.gn}  ${x.who.length}/${x.req}${gap>0?"  <<< SHORT "+gap:""}`);
  if (x.who.length) console.log(`${"".padEnd(14)}${x.who.join(", ")}`);
}
const holes = sessions.filter(x => x.who.length < x.req);
const byEval = {};
for (const x of sessions) for (const w of x.who) (byEval[w] ||= []).push(x);
for (const w in byEval) byEval[w].sort((a,b)=>a.s-b.s);

console.log(`\nHOLES (${holes.length}, ${holes.reduce((n,h)=>n+h.req-h.who.length,0)} slots):`);
for (const h of holes) console.log(`  ${hm(h.s)}-${hm(h.e)} ${arenaLabel(h.location)}  ${h.org} ${h.cat} G${h.gn}  need ${h.req-h.who.length}  (have: ${h.who.join(", ")||"nobody"})`);

console.log("\nWHO IS WORKING (rink · time):");
for (const [w, ss] of Object.entries(byEval).sort()) console.log(`  ${w.trim().padEnd(20)} ${ss.map(x => `${x.rink} ${hm(x.s)}-${hm(x.e)}`).join("  |  ")}`);

// Everyone in the CT pool NOT working tomorrow at all (the movable bench)
const all = await sql`SELECT DISTINCT u.name FROM evaluator_memberships em JOIN users u ON u.id=em.user_id
  WHERE em.organization_id=16 AND em.status='active' AND em.is_evaluator AND COALESCE(u.is_suspended,false)=false AND u.email NOT ILIKE '%@ctdemo.%'
    AND EXISTS (SELECT 1 FROM evaluator_session_signups s JOIN evaluation_schedule e ON e.id=s.schedule_id WHERE s.user_id=u.id AND s.status='signed_up' AND e.scheduled_date < CURRENT_DATE)
  ORDER BY u.name`;
const working = new Set(Object.keys(byEval));
const bench = all.map(a=>a.name).filter(n => !working.has(n));
console.log(`\nNOT WORKING MONDAY (have worked before, could be asked): ${bench.map(n=>n.trim()).join(", ")}`);

const DRIVE = 60;
console.log(`\nCANDIDATES PER HOLE (* = already at that rink; others need ${DRIVE}min each side):`);
for (const h of holes) {
  const cands = [];
  for (const [w, ss] of Object.entries(byEval)) {
    if (ss.some(x => x.id === h.id)) continue;
    let ok = true;
    for (const x of ss) { const buf = x.rink === h.rink ? 0 : DRIVE; if (x.s < h.e + buf && x.e > h.s - buf) { ok = false; break; } }
    if (!ok) continue;
    const before = ss.filter(x => x.e <= h.s).pop(), after = ss.find(x => x.s >= h.e);
    const sameRink = (before && before.rink === h.rink) || (after && after.rink === h.rink);
    cands.push({ w, sameRink, txt: `${before ? before.rink+" ends "+hm(before.e) : "free before"} -> ${after ? after.rink+" starts "+hm(after.s) : "free after"}` });
  }
  cands.sort((a,b) => (b.sameRink - a.sameRink) || a.w.localeCompare(b.w));
  console.log(`\n  ${hm(h.s)}-${hm(h.e)} ${h.rink} ${h.org} ${h.cat} G${h.gn} (need ${h.req-h.who.length}):`);
  for (const c of cands) console.log(`     ${c.sameRink?"* ":"  "}${c.w.trim().padEnd(20)} ${c.txt}`);
  if (!cands.length) console.log("     nobody working that day fits -- pull from the bench");
}
const dan = byEval["Dan Competitive Thread"] || [];
if (dan.length) {
  console.log(`\nDAN'S SESSIONS (to hand off):`);
  for (const x of dan) console.log(`  ${hm(x.s)}-${hm(x.e)} ${arenaLabel(x.location)}  ${x.org} ${x.cat} G${x.gn}  with: ${x.who.filter(n=>n!=="Dan Competitive Thread").join(", ")||"nobody"}`);
}
