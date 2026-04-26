// Calibration band: min/max of OTHER evaluators' scores in the current
// session. Used by the scoring page to show a real-time range so an
// evaluator can sanity-check their scoring against the room.
//
// Returns:
//   { min: number|null, max: number|null, evaluator_count: number, total_scores: number }
// Empty session -> all-null values + 0 counts.

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userRow = await sql`SELECT id FROM users WHERE email = ${session.email}`;
    const myUserId = userRow[0]?.id;
    if (!myUserId) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get("schedule_id");
    const catId = searchParams.get("category_id");
    const sessionNumber = searchParams.get("session_number");

    if (!scheduleId || !catId || !sessionNumber) {
      return NextResponse.json({ error: "schedule_id, category_id, session_number required" }, { status: 400 });
    }

    // Limit to athletes checked into THIS schedule (== this group's roster) so
    // we don't blend other groups' scores under the same age_category +
    // session_number.
    const rows = await sql`
      SELECT
        MIN(cs.score)::float AS min_score,
        MAX(cs.score)::float AS max_score,
        COUNT(*)::int AS total_scores,
        COUNT(DISTINCT cs.evaluator_id)::int AS evaluator_count
      FROM category_scores cs
      JOIN player_checkins pc ON pc.athlete_id = cs.athlete_id AND pc.schedule_id = ${scheduleId}
      WHERE cs.age_category_id = ${catId}
        AND cs.session_number = ${sessionNumber}
        AND cs.evaluator_id != ${myUserId}
        AND pc.checked_in = true
    `;

    const r = rows[0] || {};
    return NextResponse.json({
      min: r.min_score ?? null,
      max: r.max_score ?? null,
      evaluator_count: r.evaluator_count || 0,
      total_scores: r.total_scores || 0,
    });
  } catch (error) {
    console.error("Session range error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
