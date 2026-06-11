import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { buildAthleteReport } from "@/lib/reportData";
import { computeCategoryRankings } from "@/lib/rankings";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { athleteId } = params;
    const { searchParams } = new URL(request.url);
    const catId = searchParams.get("cat") || searchParams.get("catId");

    // A category is required so every request is gated by authorizeCategoryAccess
    // plus the athlete-in-category check below (IDOR guard).
    if (!catId) return NextResponse.json({ error: "category required" }, { status: 400 });

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const ath = await sql`SELECT id FROM athletes WHERE id = ${athleteId} AND age_category_id = ${catId}`;
    if (!ath.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Aggregated payload the dark Development Report renders (standing, skill +
    // testing profile, progress, notes-without-names, athlete, category).
    const report = await buildAthleteReport(catId, athleteId);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Rich fields the on-screen director report (/player/report) needs: raw
    // per-evaluator scores, testing ranks, ranking detail, and notes WITH
    // evaluator names. These override report.notes (which is name-stripped for
    // the parent surface). Directors are authorized, so names are fine here.
    const sessions = await sql`SELECT * FROM category_sessions WHERE age_category_id = ${catId} ORDER BY session_number`;
    const scores = await sql`
      SELECT cs.session_number, cs.score, cs.scoring_category_id, cs.scored_via, cs.created_at, cs.updated_at,
        u.name as evaluator_name, u.id as evaluator_id, sc.name as category_name, sc.display_order
      FROM category_scores cs
      JOIN users u ON u.id = cs.evaluator_id
      JOIN scoring_categories sc ON sc.id = cs.scoring_category_id
      WHERE cs.athlete_id = ${athleteId} AND cs.age_category_id = ${catId}
      ORDER BY cs.session_number, u.name, sc.display_order
    `;
    const testing = await sql`
      SELECT session_number, overall_rank, created_at
      FROM testing_drill_results
      WHERE athlete_id = ${athleteId} AND age_category_id = ${catId}
      ORDER BY session_number
    `;
    const notes = await sql`
      SELECT pn.session_number, pn.note_text, pn.created_at, u.name as evaluator_name
      FROM player_notes pn JOIN users u ON u.id = pn.evaluator_id
      WHERE pn.athlete_id = ${athleteId} AND pn.age_category_id = ${catId}
      ORDER BY pn.session_number, pn.created_at
    `;
    const rankData = await computeCategoryRankings(catId);
    const ranking = rankData.athletes?.find(a => String(a.id) === String(athleteId)) || null;

    return NextResponse.json({ ...report, sessions, scores, testing, notes, ranking });
  } catch (error) {
    console.error("Player report error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
