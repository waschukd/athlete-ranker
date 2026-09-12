// BAHA U15 House: after the roster upload, build session 2 as
//   Group 1 = session-1 Group 1, Group 2 = session-1 Group 2, Group 3 = everyone
//   else (the NBC players, who have no session-1 group).
//
//   node scripts/baha-u15-preload-nbc.mjs                 (dry run)
//   node scripts/baha-u15-preload-nbc.mjs --commit
//   node scripts/baha-u15-preload-nbc.mjs --sessions 2,3,4 --commit
//
// Run AFTER their upload. Auto-place will already have spread everyone across
// session 2's three groups by headcount; this overwrites that with the intended
// shape. Idempotent -- run again after a re-upload and it lands the same way.
//
// Refuses if a target session is locked or has a completed check-in.
import { connect } from "./_db.mjs";

const sql = connect(import.meta.url);
const CAT = 69;
const arg = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
const COMMIT = process.argv.includes("--commit");
const SESSIONS = (arg("--sessions") || "2").split(",").map(Number).filter(Boolean);

const [cat] = await sql`SELECT c.name, o.name AS org FROM age_categories c JOIN organizations o ON o.id = c.organization_id WHERE c.id = ${CAT}`;
console.log(`${cat.org} / ${cat.name}`);

const roster = await sql`SELECT id, first_name, last_name, position FROM athletes WHERE age_category_id = ${CAT} AND is_active ORDER BY last_name, first_name`;
if (!roster.length) { console.log("Roster is empty -- nothing uploaded yet."); process.exit(0); }

// Session-1 placement is the source of truth for who is BC.
const s1 = await sql`
  SELECT pga.athlete_id, sg.group_number FROM player_group_assignments pga
  JOIN session_groups sg ON sg.id = pga.session_group_id
  WHERE sg.age_category_id = ${CAT} AND sg.session_number = 1`;
const s1Group = new Map(s1.map(r => [r.athlete_id, r.group_number]));
const bc1 = roster.filter(a => s1Group.get(a.id) === 1);
const bc2 = roster.filter(a => s1Group.get(a.id) === 2);
const nbc = roster.filter(a => !s1Group.has(a.id) && String(a.position || "").toLowerCase() !== "goalie");
const goaliesNbc = roster.filter(a => !s1Group.has(a.id) && String(a.position || "").toLowerCase() === "goalie");

console.log(`roster ${roster.length}: session-1 G1 ${bc1.length}, G2 ${bc2.length}, no session-1 group ${nbc.length} skaters + ${goaliesNbc.length} goalies`);
if (!bc1.length && !bc2.length) { console.log("Nobody is in a session-1 group yet -- did the upload include the Session 1 Group # column?"); process.exit(1); }

for (const sn of SESSIONS) {
  const [lock] = await sql`SELECT groups_locked_at FROM category_sessions WHERE age_category_id = ${CAT} AND session_number = ${sn}`;
  const [ci] = await sql`
    SELECT COUNT(*)::int n FROM player_checkins pc JOIN evaluation_schedule es ON es.id = pc.schedule_id
    WHERE es.age_category_id = ${CAT} AND es.session_number = ${sn} AND pc.checked_in`;
  if (lock?.groups_locked_at) { console.log(`\nsession ${sn}: LOCKED -- skipping`); continue; }
  if (ci.n) { console.log(`\nsession ${sn}: has ${ci.n} completed check-in(s) -- skipping`); continue; }

  const groups = await sql`SELECT id, group_number FROM session_groups WHERE age_category_id = ${CAT} AND session_number = ${sn} ORDER BY group_number`;
  const byNum = new Map(groups.map(g => [g.group_number, g.id]));
  if (!byNum.has(1) || !byNum.has(2) || !byNum.has(3)) {
    console.log(`\nsession ${sn}: needs groups 1, 2 and 3 (has ${groups.map(g => g.group_number).join(",") || "none"}) -- skipping`);
    continue;
  }
  const plan = [
    { g: 1, id: byNum.get(1), who: bc1 },
    { g: 2, id: byNum.get(2), who: bc2 },
    { g: 3, id: byNum.get(3), who: nbc },
  ];
  console.log(`\nsession ${sn}:`);
  for (const p of plan) console.log(`  Group ${p.g}: ${p.who.length}`);
  if (goaliesNbc.length) console.log(`  (${goaliesNbc.length} goalie(s) with no session-1 group left unplaced -- goalies are always assigned by hand)`);

  if (!COMMIT) continue;

  // Wipe this session's assignments for the whole roster and lay it down fresh.
  await sql`DELETE FROM player_group_assignments WHERE session_group_id = ANY(${groups.map(g => g.id)})`;
  for (const p of plan) {
    if (!p.who.length) continue;
    await sql`
      INSERT INTO player_group_assignments (athlete_id, session_group_id, display_order)
      SELECT * FROM unnest(${p.who.map(a => a.id)}::int[], ${p.who.map(() => p.id)}::int[], ${p.who.map((_, i) => i)}::int[])
      ON CONFLICT (athlete_id, session_group_id) DO NOTHING`;
  }
  const after = await sql`
    SELECT sg.group_number, COUNT(pga.id)::int n FROM session_groups sg
    LEFT JOIN player_group_assignments pga ON pga.session_group_id = sg.id
    WHERE sg.age_category_id = ${CAT} AND sg.session_number = ${sn} GROUP BY sg.group_number ORDER BY 1`;
  console.log(`  written: ${after.map(a => `G${a.group_number}=${a.n}`).join("  ")}`);
}
if (!COMMIT) console.log("\nDRY RUN -- re-run with --commit.");
