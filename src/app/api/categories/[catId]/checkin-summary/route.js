import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { NextResponse } from "next/server";
import sql from "@/lib/db";

// Real incident: BAHA U9 (and other associations) showed "0/54 checked in"
// for Group 1 on this summary, but the check-in page itself showed "0/29"
// for the exact same group. Root cause: player_checkins rows are seeded
// lazily, one per (athlete, schedule), the first time the check-in page
// loads for a group -- but nothing ever deletes or migrates that row when a
// player is later reassigned to a DIFFERENT group for the same session (a
// roster rebalance, which every one of these associations does mid-week).
// The old blind `COUNT(pc.id)` here counted every row a schedule had ever
// accumulated, including ones left behind by players who no longer belong
// there -- while the check-in page (correctly) only ever shows whoever is
// CURRENTLY assigned. The two numbers drift apart the moment a single player
// moves groups after anyone's opened that group's check-in page once.
//
// Fix: compute the roster the exact same way the check-in page does
// (src/app/api/checkin/[scheduleId]/route.js's useGroup logic) -- current
// player_group_assignments for the session if any exist anywhere in that
// session, falling back to the full active roster if the session was never
// grouped -- and count checked_in status only among THAT roster. Historical
// player_checkins rows for a player no longer in the roster are ignored
// entirely, same as the check-in page already ignores them.
export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const schedRows = await sql`
      SELECT id AS schedule_id, session_number, group_number
      FROM evaluation_schedule WHERE age_category_id = ${catId}
    `;
    if (!schedRows.length) return NextResponse.json({ sessions: [] });

    const assignments = await sql`
      SELECT sg.session_number, sg.group_number, pga.athlete_id
      FROM session_groups sg
      JOIN player_group_assignments pga ON pga.session_group_id = sg.id
      WHERE sg.age_category_id = ${catId}
    `;
    const assignedByGroup = {};
    const sessionHasAnyAssignments = {};
    for (const a of assignments) {
      sessionHasAnyAssignments[a.session_number] = true;
      (assignedByGroup[`${a.session_number}_${a.group_number}`] ||= new Set()).add(a.athlete_id);
    }

    const activeRoster = await sql`
      SELECT id FROM athletes WHERE age_category_id = ${catId} AND is_active = true AND cut_at IS NULL
    `;
    const activeIds = new Set(activeRoster.map(r => r.id));

    const scheduleIds = schedRows.map(s => s.schedule_id);
    const checkins = await sql`
      SELECT schedule_id, athlete_id, checked_in FROM player_checkins
      WHERE schedule_id = ANY(${scheduleIds})
    `;
    const checkedInByScheduleAthlete = {};
    for (const c of checkins) {
      if (c.checked_in) (checkedInByScheduleAthlete[c.schedule_id] ||= new Set()).add(c.athlete_id);
    }

    const sessions = schedRows.map(s => {
      const key = `${s.session_number}_${s.group_number}`;
      // Same fallback the check-in page uses: only trust group assignments
      // once the session's actually been grouped -- an ungrouped session
      // shows (and checks in against) the whole active roster instead.
      const roster = sessionHasAnyAssignments[s.session_number] ? (assignedByGroup[key] || new Set()) : activeIds;
      const checkedSet = checkedInByScheduleAthlete[s.schedule_id];
      let checkedIn = 0;
      if (checkedSet) for (const athleteId of roster) if (checkedSet.has(athleteId)) checkedIn++;
      return {
        schedule_id: s.schedule_id,
        session_number: s.session_number,
        group_number: s.group_number,
        checked_in: checkedIn,
        total: roster.size,
      };
    });
    sessions.sort((a, b) => a.session_number - b.session_number || a.group_number - b.group_number);

    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
