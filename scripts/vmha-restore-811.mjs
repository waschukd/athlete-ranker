// Restore VMHA U13 M session 1 group 2 (Oct 3, 11:15-12:15) and stop the
// phantom "Testing" duplicates.
//
//   node scripts/vmha-restore-811.mjs            (preview)
//   node scripts/vmha-restore-811.mjs --commit
//
// What actually happened: the two schedule rows added on Oct 1 (the U13 skills
// group 2 slot and the U13 game 3 slot) were inserted with
// service_provider_id = 16. The SP schedule builds its list from TWO queries --
// association sessions via sp_association_links, and the SP's own testing
// events via `WHERE es.service_provider_id = <sp>` with no exclusion for rows
// that belong to an association. So each of those two rows appeared twice: once
// as the real VMHA session, once as a "Testing" event.
//
// Deleting the apparent duplicate deleted the row itself -- there was only ever
// one -- taking the real 11:15 session and its four evaluator sign-ups with it.
//
// This restores the row (no service_provider_id this time), puts the same four
// evaluators back on it, and rebuilds its check-in list from the 18 players
// already assigned to session 1 group 2. It also clears service_provider_id on
// the Oct 4 11:30 game so tomorrow's duplicate disappears without anyone having
// to delete anything.
//
// The underlying query is fixed separately so no association session can be
// mistaken for an SP testing event again.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const CAT = 142, SN = 1, G = 2;
const DATE = "2026-10-03", START = "11:15", END = "12:15", LOC = "Stadium";
// The four who were signed up before the delete (audit_log evaluator_signup on
// the old row id 811, same four as every other VMHA session).
const EVALUATORS = [44, 122, 126, 128];

const existing = await sql`
  SELECT id, scheduled_date::text d, start_time FROM evaluation_schedule
  WHERE age_category_id = ${CAT} AND session_number = ${SN} AND group_number = ${G}`;
const [grp] = await sql`SELECT id FROM session_groups WHERE age_category_id = ${CAT} AND session_number = ${SN} AND group_number = ${G}`;
const roster = grp ? await sql`
  SELECT pga.athlete_id, a.first_name, a.last_name FROM player_group_assignments pga
  JOIN athletes a ON a.id = pga.athlete_id WHERE pga.session_group_id = ${grp.id} ORDER BY a.last_name` : [];
const dupes = await sql`
  SELECT es.id, es.scheduled_date::text d, es.start_time, c.name cn, es.session_number sn, es.group_number g
  FROM evaluation_schedule es JOIN age_categories c ON c.id = es.age_category_id
  WHERE es.service_provider_id IS NOT NULL AND es.age_category_id IS NOT NULL`;
const who = await sql`SELECT id, name FROM users WHERE id = ANY(${EVALUATORS})`;

console.log("VMHA U13 M -- session 1 group 2 (Oct 3, 11:15-12:15)\n");
console.log(`  schedule row:      ${existing.length ? `exists (id ${existing[0].id})` : "MISSING -- will be recreated"}`);
console.log(`  session group:     ${grp ? `intact (id ${grp.id}), ${roster.length} players still assigned` : "MISSING"}`);
console.log(`  evaluators to put back: ${who.map(w => w.name).join(", ")}`);
console.log(`\n  rows wrongly flagged as SP testing events (the duplicates):`);
for (const d of dupes) console.log(`     id ${d.id}  ${d.cn} S${d.sn} G${d.g}  ${d.d} ${String(d.start_time).slice(0, 5)}  -> service_provider_id cleared`);
if (!dupes.length) console.log("     none left");

if (!COMMIT) { console.log("\nPREVIEW ONLY -- nothing written. Re-run with --commit to apply."); process.exit(0); }
if (!grp) { console.error("Refusing: session group S1 G2 is gone too -- rebuild it before restoring the schedule row."); process.exit(1); }

let id = existing[0]?.id;
if (!id) {
  const code = `S${SN}G${G}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const [row] = await sql`
    INSERT INTO evaluation_schedule
      (age_category_id, session_number, group_number, scheduled_date, day_of_week, start_time, end_time,
       location, status, evaluators_required, checkin_code, checkin_code_active)
    VALUES (${CAT}, ${SN}, ${G}, ${DATE}, 'Saturday', ${START}, ${END}, ${LOC}, 'scheduled', 4, ${code}, true)
    RETURNING id, checkin_code`;
  id = row.id;
  console.log(`recreated schedule row -> id ${id}, check-in code ${row.checkin_code}`);
} else {
  console.log(`schedule row already present (id ${id}) -- leaving it alone`);
}

for (const uid of EVALUATORS) {
  await sql`
    INSERT INTO evaluator_session_signups (schedule_id, user_id, status)
    VALUES (${id}, ${uid}, 'signed_up')
    ON CONFLICT (schedule_id, user_id) DO UPDATE SET status = 'signed_up', closed_at = NULL`;
}
console.log(`evaluators restored: ${who.map(w => w.name).join(", ")}`);

// Check-in list, rebuilt from the group so the door and the scoring screen see
// the same 18 players the association put in group 2.
const [cs] = await sql`
  INSERT INTO checkin_sessions (schedule_id, age_category_id, team_colors, is_open)
  VALUES (${id}, ${CAT}, (SELECT team_colors FROM checkin_sessions WHERE schedule_id = 809), true)
  ON CONFLICT (schedule_id) DO UPDATE SET is_open = true
  RETURNING id`;
for (const r of roster) {
  await sql`
    INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id)
    VALUES (${r.athlete_id}, ${id}, ${cs.id}) ON CONFLICT (athlete_id, schedule_id) DO NOTHING`;
}
console.log(`check-in list rebuilt: ${roster.length} players`);

for (const d of dupes) {
  await sql`UPDATE evaluation_schedule SET service_provider_id = NULL, updated_at = NOW() WHERE id = ${d.id}`;
  console.log(`cleared SP flag on id ${d.id} (${d.cn} S${d.sn} G${d.g} ${d.d}) -- duplicate gone`);
}

const after = await sql`
  SELECT es.id, es.session_number sn, es.group_number g, es.scheduled_date::text d, es.start_time, es.checkin_code,
    (SELECT COUNT(*)::int FROM evaluator_session_signups x WHERE x.schedule_id = es.id AND x.status = 'signed_up') evs,
    (SELECT COUNT(*)::int FROM player_checkins p WHERE p.schedule_id = es.id) players
  FROM evaluation_schedule es WHERE es.age_category_id = ${CAT} ORDER BY es.scheduled_date, es.start_time`;
console.log("\nU13 M schedule now:");
for (const r of after) console.log(`   S${r.sn} G${r.g}  ${r.d} ${String(r.start_time).slice(0, 5)}  code=${r.checkin_code || "-"}  ${r.evs} evaluators, ${r.players} players`);
process.exit(0);
