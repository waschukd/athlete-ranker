import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(request, { params }) {
  try {
    const { athleteId } = params;
    const { searchParams } = new URL(request.url);
    const catId = searchParams.get("cat");

    // Athlete info
    const athlete = await sql`
      SELECT a.*, o.name as org_name
      FROM athletes a
      JOIN organizations o ON o.id = a.organization_id
      WHERE a.id = ${athleteId}
    `;
    if (!athlete.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Category + sessions
    const sessions = await sql`
      SELECT * FROM category_sessions
      WHERE age_category_id = ${catId}
      ORDER BY session_number
    `;

    const category = await sql`SELECT * FROM age_categories WHERE id = ${catId}`;

    // All scores for this athlete — per evaluator per session per category
    const scores = await sql`
      SELECT 
        cs.session_number, cs.score, cs.scoring_category_id, cs.scored_via,
        cs.created_at, cs.updated_at,
        u.name as evaluator_name, u.id as evaluator_id,
        sc.name as category_name
      FROM category_scores cs
      JOIN users u ON u.id = cs.evaluator_id
      JOIN scoring_categories sc ON sc.id = cs.scoring_category_id
      WHERE cs.athlete_id = ${athleteId} AND cs.age_category_id = ${catId}
      ORDER BY cs.session_number, u.name, sc.name
    `;

    // Testing ranks
    const testing = await sql`
      SELECT tdr.session_number, tdr.overall_rank, tdr.created_at
      FROM testing_drill_results tdr
      WHERE tdr.athlete_id = ${athleteId} AND tdr.age_category_id = ${catId}
      ORDER BY tdr.session_number
    `;

    // All notes for this athlete
    const notes = await sql`
      SELECT 
        pn.session_number, pn.note_text, pn.created_at,
        u.name as evaluator_name
      FROM player_notes pn
      JOIN users u ON u.id = pn.evaluator_id
      WHERE pn.athlete_id = ${athleteId} AND pn.age_category_id = ${catId}
      ORDER BY pn.session_number, pn.created_at
    `;

    // Rank history from rankings API
    const rankRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/categories/${catId}/rankings`
    );
    const rankData = await rankRes.json();
    const athleteRanking = rankData.athletes?.find(a => a.id === parseInt(athleteId));

    // Total athletes for percentile
    const totalAthletes = rankData.athletes?.length || 0;

    return NextResponse.json({
      athlete: athlete[0],
      category: category[0],
      sessions,
      scores,
      testing,
      notes,
      ranking: athleteRanking,
      total_athletes: totalAthletes,
    });
  } catch (error) {
    console.error("Player report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
