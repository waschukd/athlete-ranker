import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(request, { params }) {
  try {
    const { athleteId } = params;
    const { searchParams } = new URL(request.url);
    const catId = searchParams.get("cat");

    const athlete = await sql`
      SELECT a.*, o.name as org_name
      FROM athletes a
      JOIN organizations o ON o.id = a.organization_id
      WHERE a.id = ${athleteId}
    `;
    if (!athlete.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const category = await sql`SELECT * FROM age_categories WHERE id = ${catId}`;

    const sessions = await sql`
      SELECT * FROM category_sessions
      WHERE age_category_id = ${catId}
      ORDER BY session_number
    `;

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

    // Get all athletes ranked directly from DB
    const allAthletes = await sql`
      SELECT DISTINCT a.id
      FROM athletes a
      WHERE a.age_category_id = ${catId} AND a.is_active = true
    `;
    const totalAthletes = allAthletes.length;

    // Get this athlete's rank from category_scores aggregation
    const rankQuery = await sql`
      WITH athlete_scores AS (
        SELECT
          cs.athlete_id,
          cs.session_number,
          AVG(cs.score) as avg_score
        FROM category_scores cs
        WHERE cs.age_category_id = ${catId}
        GROUP BY cs.athlete_id, cs.session_number
      ),
      session_weights AS (
        SELECT session_number, weight_percentage FROM category_sessions WHERE age_category_id = ${catId}
      ),
      weighted AS (
        SELECT
          a.athlete_id,
          SUM(a.avg_score * sw.weight_percentage / 100.0) as weighted_total
        FROM athlete_scores a
        JOIN session_weights sw ON sw.session_number = a.session_number
        GROUP BY a.athlete_id
      ),
      ranked AS (
        SELECT athlete_id, weighted_total,
          RANK() OVER (ORDER BY weighted_total DESC) as rank
        FROM weighted
      )
      SELECT rank, weighted_total FROM ranked WHERE athlete_id = ${athleteId}
    `;

    const rankRow = rankQuery[0];

    // Build session scores summary
    const sessionScores = {};
    for (const s of sessions) {
      const sessionScoreRows = scores.filter(sc => sc.session_number === s.session_number);
      if (s.session_type === "testing") {
        const t = testing.find(t => t.session_number === s.session_number);
        if (t && totalAthletes > 1) {
          const normalized = Math.round(((totalAthletes - t.overall_rank) / (totalAthletes - 1)) * 100);
          sessionScores[s.session_number] = { normalized_score: normalized, source: "testing", overall_rank: t.overall_rank, evaluator_count: 0 };
        }
      } else if (sessionScoreRows.length > 0) {
        const avg = sessionScoreRows.reduce((sum, sc) => sum + parseFloat(sc.score), 0) / sessionScoreRows.length;
        const scale = category[0]?.scoring_scale || 10;
        const normalized = Math.round((avg / scale) * 100);
        const evalIds = [...new Set(sessionScoreRows.map(sc => sc.evaluator_id))];
        sessionScores[s.session_number] = { normalized_score: normalized, source: "evaluator", evaluator_count: evalIds.length };
      }
    }

    // Rank history per completed session
    const rank_history = sessions.map(s => sessionScores[s.session_number]?.normalized_score).filter(Boolean);

    const ranking = rankRow ? {
      rank: parseInt(rankRow.rank),
      weighted_total: parseFloat(rankRow.weighted_total),
      session_scores: sessionScores,
      rank_history,
    } : null;

    return NextResponse.json({
      athlete: athlete[0],
      category: category[0],
      sessions,
      scores,
      testing,
      notes,
      ranking,
      total_athletes: totalAthletes,
    });
  } catch (error) {
    console.error("Player report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
