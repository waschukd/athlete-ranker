import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { athleteId } = params;
    const { searchParams } = new URL(request.url);
    const catId = searchParams.get("cat");

    if (catId) {
      const auth = await authorizeCategoryAccess(session, catId);
      if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const athleteRes = await sql`
      SELECT a.*, o.name as org_name
      FROM athletes a
      JOIN organizations o ON o.id = a.organization_id
      WHERE a.id = ${athleteId}
    `;
    if (!athleteRes.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const category = await sql`SELECT * FROM age_categories WHERE id = ${catId}`;
    const sessions = await sql`SELECT * FROM category_sessions WHERE age_category_id = ${catId} ORDER BY session_number`;

    const scores = await sql`
      SELECT
        cs.session_number, cs.score, cs.scoring_category_id, cs.scored_via,
        cs.created_at, cs.updated_at,
        u.name as evaluator_name, u.id as evaluator_id,
        sc.name as category_name, sc.display_order
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
      FROM player_notes pn
      JOIN users u ON u.id = pn.evaluator_id
      WHERE pn.athlete_id = ${athleteId} AND pn.age_category_id = ${catId}
      ORDER BY pn.session_number, pn.created_at
    `;

    // Get rankings from the single source of truth
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const rankRes = await fetch(`${baseUrl}/api/categories/${catId}/rankings`, {
      headers: { cookie: request.headers.get("cookie") || "" },
    });
    let rankData = {};
    try { if (rankRes.ok) rankData = await rankRes.json(); } catch {}
    const athleteRanking = rankData.athletes?.find(a => String(a.id) === String(athleteId));
    const totalAthletes = rankData.athletes?.length || 0;

    return NextResponse.json({
      athlete: athleteRes[0],
      category: category[0],
      sessions,
      scores,
      testing,
      notes,
      ranking: athleteRanking || null,
      total_athletes: totalAthletes,
    });
  } catch (error) {
    console.error("Player report error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
