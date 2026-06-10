import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { computeCategoryRankings } from "@/lib/rankings";
import { getCoachUserIds } from "@/lib/categoryEvaluators";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { athleteId } = params;
    const { searchParams } = new URL(request.url);
    const catId = searchParams.get("cat") || searchParams.get("catId");

    // A category is required so every request is gated by authorizeCategoryAccess
    // plus the athlete-in-category check below. Without it the route would return
    // athlete data with no authorization gate at all (IDOR).
    if (!catId) return NextResponse.json({ error: "category required" }, { status: 400 });

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Verify the athlete actually belongs to the authorized category (IDOR guard)
    const ath = await sql`SELECT id FROM athletes WHERE id = ${athleteId} AND age_category_id = ${catId}`;
    if (!ath.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

    // Get rankings from the single source of truth (computed directly — no HTTP
    // self-fetch, which previously fell back to localhost in production and left
    // every report with null ranking and a 100th-percentile fallback).
    const rankData = await computeCategoryRankings(catId);
    const athleteRanking = rankData.athletes?.find(a => String(a.id) === String(athleteId));
    const totalAthletes = rankData.athletes?.length || 0;

    // ── Standing: a tier + coarse band, deliberately NOT an exact rank ──
    const rank = athleteRanking?.rank || null;
    let standing = null;
    if (rank && totalAthletes > 0) {
      const percentile = totalAthletes > 1 ? Math.round(((totalAthletes - rank) / (totalAthletes - 1)) * 100) : 100;
      const tier = percentile >= 90 ? "Elite" : percentile >= 75 ? "Above Average" : percentile >= 50 ? "Average" : percentile >= 25 ? "Below Average" : "Developing";
      const band = percentile >= 90 ? "Top 10%" : percentile >= 75 ? "Top 25%" : percentile >= 50 ? "Top half" : percentile >= 25 ? "Bottom half" : "Bottom 25%";
      standing = { percentile, tier, band, total: totalAthletes };
    }

    // ── Per-skill profile: player vs group vs top tier (coach scores excluded) ──
    const coachIds = await getCoachUserIds(catId);
    const coachKeys = coachIds.map(String);
    const groupAvg = await sql`
      SELECT cs.scoring_category_id, sc.name AS category_name, sc.display_order, AVG(cs.score)::float AS avg
      FROM category_scores cs JOIN scoring_categories sc ON sc.id = cs.scoring_category_id
      WHERE cs.age_category_id = ${catId} AND cs.evaluator_id <> ALL(${coachIds})
      GROUP BY cs.scoring_category_id, sc.name, sc.display_order
      ORDER BY sc.display_order
    `;
    const topCount = Math.max(1, Math.ceil(totalAthletes * 0.25));
    const topIds = (rankData.athletes || []).filter(a => a.rank && a.rank <= topCount).map(a => a.id);
    let topMap = {};
    if (topIds.length) {
      const topAvg = await sql`
        SELECT cs.scoring_category_id, AVG(cs.score)::float AS avg
        FROM category_scores cs
        WHERE cs.age_category_id = ${catId} AND cs.evaluator_id <> ALL(${coachIds}) AND cs.athlete_id = ANY(${topIds})
        GROUP BY cs.scoring_category_id
      `;
      topMap = Object.fromEntries(topAvg.map(r => [r.scoring_category_id, r.avg]));
    }
    const playerSum = {}, playerCnt = {};
    for (const s of scores) {
      if (coachKeys.includes(String(s.evaluator_id))) continue;
      const k = s.scoring_category_id;
      playerSum[k] = (playerSum[k] || 0) + parseFloat(s.score);
      playerCnt[k] = (playerCnt[k] || 0) + 1;
    }
    const round1 = (v) => v != null ? Math.round(v * 10) / 10 : null;
    const skillProfile = groupAvg.map(r => ({
      scoring_category_id: r.scoring_category_id,
      name: r.category_name,
      display_order: r.display_order,
      player: playerCnt[r.scoring_category_id] ? round1(playerSum[r.scoring_category_id] / playerCnt[r.scoring_category_id]) : null,
      group: round1(r.avg),
      top: round1(topMap[r.scoring_category_id]),
    }));

    // ── Objective testing: best per test vs group avg / group best (lower = better) ──
    let testingProfile = [];
    try {
      const tp = await sql`
        SELECT b.test_name,
          AVG(b.best)::float AS group_avg,
          MIN(b.best)::float AS group_best,
          (MAX(b.best) FILTER (WHERE b.athlete_id = ${athleteId}))::float AS player_best
        FROM (
          SELECT athlete_id, test_name, MIN(value) AS best
          FROM testing_results WHERE age_category_id = ${catId}
          GROUP BY athlete_id, test_name
        ) b
        GROUP BY b.test_name
        ORDER BY b.test_name
      `;
      const round3 = (v) => v != null ? Math.round(v * 1000) / 1000 : null;
      testingProfile = tp.map(r => ({
        test_name: r.test_name,
        player_best: round3(r.player_best),
        group_avg: round3(r.group_avg),
        group_best: round3(r.group_best),
        lower_is_better: true,
      }));
    } catch (e) {
      testingProfile = [];
    }

    return NextResponse.json({
      athlete: athleteRes[0],
      category: category[0],
      sessions,
      scores,
      testing,
      notes,
      ranking: athleteRanking || null,
      total_athletes: totalAthletes,
      standing,
      skillProfile,
      testingProfile,
    });
  } catch (error) {
    console.error("Player report error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
