// Cross-group floor: the lowest score any athlete has received so far this
// session, from groups that went BEFORE the one currently being scored. Distinct
// from /api/evaluator/session-range, which deliberately stays scoped to the
// CURRENT group's roster (see that route's comment) -- this one is the opposite
// on purpose: groups within a session never play each other directly, but their
// scores all get pooled into one ranking, so an evaluator picking up group 2
// needs to know how low group 1's floor went to keep a clearly-better player
// from landing under it.
//
// Returns: { floor: number|null, prior_groups: number, total_scores: number }

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const catId = searchParams.get("category_id");
    const sessionNumber = searchParams.get("session_number");
    const groupNumber = searchParams.get("group_number");

    if (!catId || !sessionNumber || !groupNumber) {
      return NextResponse.json({ error: "category_id, session_number, group_number required" }, { status: 400 });
    }

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // category_scores.session_group_id is NOT populated by the live scoring path
    // (src/app/api/evaluator/scores/route.js never sets it on insert) -- group
    // membership has to be resolved via player_group_assignments instead, same as
    // the Groups admin page does.
    const rows = await sql`
      SELECT
        MIN(cs.score)::float AS min_score,
        COUNT(*)::int AS total_scores,
        COUNT(DISTINCT sg.group_number)::int AS prior_groups
      FROM category_scores cs
      JOIN player_group_assignments pga ON pga.athlete_id = cs.athlete_id
      JOIN session_groups sg ON sg.id = pga.session_group_id
        AND sg.age_category_id = cs.age_category_id
        AND sg.session_number = cs.session_number
      WHERE cs.age_category_id = ${catId}
        AND cs.session_number = ${sessionNumber}
        AND sg.group_number < ${groupNumber}
    `;

    const r = rows[0] || {};
    return NextResponse.json({
      floor: r.min_score ?? null,
      prior_groups: r.prior_groups || 0,
      total_scores: r.total_scores || 0,
    });
  } catch (error) {
    console.error("Session floor error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
