import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = await getAppUserId(session);
    if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const catId = searchParams.get("category_id");
    const currentSession = parseInt(searchParams.get("session_number") || "0");

    if (!catId || currentSession <= 1) {
      return NextResponse.json({ calibration: null }); // No prior session to compare
    }

    const prevSession = currentSession - 1;

    // Get all scores from the previous session
    const allScores = await sql`
      SELECT cs.athlete_id, cs.evaluator_id, cs.score, cs.scoring_category_id
      FROM category_scores cs
      WHERE cs.age_category_id = ${catId} AND cs.session_number = ${prevSession}
    `;

    if (!allScores.length) return NextResponse.json({ calibration: null });

    // Check if this evaluator scored in the previous session
    const myScores = allScores.filter(s => s.evaluator_id === userId);
    if (!myScores.length) return NextResponse.json({ calibration: null });

    // Build per-evaluator rankings
    const evaluatorTotals = {}; // { evalId: { athleteId: avgScore } }
    for (const s of allScores) {
      if (!evaluatorTotals[s.evaluator_id]) evaluatorTotals[s.evaluator_id] = {};
      if (!evaluatorTotals[s.evaluator_id][s.athlete_id]) evaluatorTotals[s.evaluator_id][s.athlete_id] = { total: 0, count: 0 };
      evaluatorTotals[s.evaluator_id][s.athlete_id].total += parseFloat(s.score);
      evaluatorTotals[s.evaluator_id][s.athlete_id].count++;
    }

    // Compute rankings per evaluator
    const evalRankings = {}; // { evalId: [{ athlete_id, avg, rank }] }
    for (const [evalId, athletes] of Object.entries(evaluatorTotals)) {
      const ranked = Object.entries(athletes)
        .map(([aid, d]) => ({ athlete_id: parseInt(aid), avg: d.total / d.count }))
        .sort((a, b) => b.avg - a.avg)
        .map((a, i) => ({ ...a, rank: i + 1 }));
      evalRankings[evalId] = ranked;
    }

    // Compute group ranking (average across all evaluators)
    const athleteGroupAvg = {};
    for (const s of allScores) {
      if (!athleteGroupAvg[s.athlete_id]) athleteGroupAvg[s.athlete_id] = { total: 0, count: 0 };
      athleteGroupAvg[s.athlete_id].total += parseFloat(s.score);
      athleteGroupAvg[s.athlete_id].count++;
    }
    const groupRanking = Object.entries(athleteGroupAvg)
      .map(([aid, d]) => ({ athlete_id: parseInt(aid), avg: d.total / d.count }))
      .sort((a, b) => b.avg - a.avg)
      .map((a, i) => ({ ...a, rank: i + 1 }));

    // My ranking vs group ranking
    const myRanking = evalRankings[userId] || [];
    const myRankMap = Object.fromEntries(myRanking.map(a => [a.athlete_id, a.rank]));
    const groupRankMap = Object.fromEntries(groupRanking.map(a => [a.athlete_id, a.rank]));

    // Find rank correlation + biggest disagreements
    let totalRankDiff = 0;
    let comparisons = 0;
    const disagreements = [];

    // Get athlete names for disagreements
    const athleteNames = await sql`
      SELECT id, first_name, last_name FROM athletes WHERE age_category_id = ${catId} AND is_active = true
    `;
    const nameMap = Object.fromEntries(athleteNames.map(a => [a.id, `${a.first_name} ${a.last_name}`]));

    for (const a of myRanking) {
      const groupRank = groupRankMap[a.athlete_id];
      if (groupRank === undefined) continue;
      const diff = Math.abs(a.rank - groupRank);
      totalRankDiff += diff;
      comparisons++;
      if (diff >= 3) {
        disagreements.push({
          name: nameMap[a.athlete_id] || `Athlete ${a.athlete_id}`,
          your_rank: a.rank,
          group_rank: groupRank,
          diff,
        });
      }
    }

    // Rank match percentage
    const maxPossibleDiff = comparisons > 0 ? comparisons * (comparisons - 1) / 2 : 1;
    const rankMatch = comparisons > 0
      ? Math.round((1 - totalRankDiff / (maxPossibleDiff * 2)) * 100)
      : null;

    // Score spread (are they using the full scale?)
    const myScoreValues = myScores.map(s => parseFloat(s.score));
    const spread = Math.round((Math.max(...myScoreValues) - Math.min(...myScoreValues)) * 10) / 10;

    // Per-category bias
    const catBias = {};
    const scoringCats = await sql`SELECT id, name FROM scoring_categories WHERE age_category_id = ${catId} ORDER BY display_order`;
    for (const cat of scoringCats) {
      const myForCat = allScores.filter(s => s.evaluator_id === userId && s.scoring_category_id === cat.id);
      const allForCat = allScores.filter(s => s.scoring_category_id === cat.id);
      if (myForCat.length && allForCat.length) {
        const myAvg = myForCat.reduce((s, v) => s + parseFloat(v.score), 0) / myForCat.length;
        const groupAvg = allForCat.reduce((s, v) => s + parseFloat(v.score), 0) / allForCat.length;
        catBias[cat.name] = Math.round((myAvg - groupAvg) * 10) / 10;
      }
    }

    disagreements.sort((a, b) => b.diff - a.diff);

    return NextResponse.json({
      calibration: {
        prev_session: prevSession,
        rank_match: rankMatch,
        spread,
        athletes_scored: myRanking.length,
        disagreements: disagreements.slice(0, 5), // top 5 biggest disagreements
        category_bias: catBias,
      },
    });
  } catch (error) {
    console.error("Calibration error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
