import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

// Backs the single-player "Email this player" button (welcome + ice time in
// one click, for a late add who was never swept into the roster-wide
// blasts). Finds the most recent session this athlete is actually placed in
// with a real date/time set, so the caller knows whether there's an ice-time
// email worth sending alongside the welcome one, and which session_number to
// send it for.
export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId, athleteId } = params;
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [row] = await sql`
      SELECT sg.session_number
      FROM player_group_assignments pga
      JOIN session_groups sg ON sg.id = pga.session_group_id
      JOIN evaluation_schedule es ON es.age_category_id = sg.age_category_id
        AND es.session_number = sg.session_number AND es.group_number = sg.group_number
      WHERE sg.age_category_id = ${catId} AND pga.athlete_id = ${athleteId}
        AND es.scheduled_date IS NOT NULL AND es.start_time IS NOT NULL
      ORDER BY sg.session_number DESC
      LIMIT 1
    `;

    return NextResponse.json({ hasSchedule: !!row, session_number: row?.session_number ?? null });
  } catch (error) {
    console.error("athlete current-session GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
