import { getSession } from "@/lib/auth";

import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const sessions = await sql`SELECT * FROM category_sessions WHERE age_category_id = ${catId} ORDER BY session_number`;
    const categoryRes = await sql`SELECT * FROM age_categories WHERE id = ${catId}`;
    const category = categoryRes[0];
    const athletes = await sql`SELECT * FROM athletes WHERE age_category_id = ${catId} AND is_active = true ORDER BY last_name, first_name`;

    if (!athletes.length) {
      return NextResponse.json({ athletes: [], has_scores: false, phase: "pre_session", sessions, category });
    }

    const N = athletes.length;
    const scale = parseFloat(category?.scoring_scale || 10);

    // Check for any scores
    const scoreCheck = await sql`SELECT COUNT(*) as count FROM category_scores WHERE age_category_id = ${catId}`;
    const testingCheck = await sql`SELECT COUNT(*) as count FROM testing_drill_results WHERE age_category_id = ${catId}`;
    const hasScores = parseInt(scoreCheck[0].count) > 0 || parseInt(testingCheck[0].count) > 0;

    if (!hasScores) {
      return NextResponse.json({
        athletes: athletes.map((a, i) => ({ ...a, rank: i + 1, weighted_total: null, session_scores: {}, rank_history: [] })),
        has_scores: false, phase: "pre_session", sessions, category,
      });
    }

    // ── Calculate inter-rater agreement per athlete ────────────────────────
    const allEvalScores = await sql`
      SELECT athlete_id, scoring_category_id, score
      FROM category_scores
      WHERE age_category_id = ${catId}
    `;

    // Build agreement map per athlete
    const agreementMap = {};
    const evalByAthleteCat = {};
    for (const s of allEvalScores) {
      const key = `${s.athlete_id}_${s.scoring_category_id}`;
      if (!evalByAthleteCat[key]) evalByAthleteCat[key] = [];
      evalByAthleteCat[key].push(parseFloat(s.score));
    }
    for (const [key, vals] of Object.entries(evalByAthleteCat)) {
      const athleteId = key.split("_")[0];
      if (vals.length < 2) continue;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length);
      const pct = Math.max(0, Math.min(100, Math.round((1 - sd / scale) * 100)));
      if (!agreementMap[athleteId]) agreementMap[athleteId] = [];
      agreementMap[athleteId].push(pct);
    }
    for (const [id, vals] of Object.entries(agreementMap)) {
      agreementMap[id] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }

    // Skills/scrimmage scores
    // AVG(score) = average per-category score across all evaluators for this athlete+session
    // normalized = (avg_score / scale) × 100
    // e.g. avg 7.5/10 = 75.0, avg 5/10 = 50.0
    const sessionScores = await sql`
      SELECT athlete_id, session_number,
        AVG(score) as avg_score,
        COUNT(DISTINCT evaluator_id) as evaluator_count
      FROM category_scores
      WHERE age_category_id = ${catId}
      GROUP BY athlete_id, session_number
    `;

    // Testing ranks — percentile: (N - rank) / (N - 1) × 100
    // rank 1 of 26 = 100.0, rank 13 = 50.0, rank 26 = 0.0
    const testingRanks = await sql`
      SELECT DISTINCT ON (athlete_id, session_number) athlete_id, session_number, overall_rank
      FROM testing_drill_results
      WHERE age_category_id = ${catId}
      ORDER BY athlete_id, session_number
    `;

    const completedSessions = [...new Set([
      ...sessionScores.map(s => parseInt(s.session_number)),
      ...testingRanks.map(t => parseInt(t.session_number)),
    ])].sort();

    // Build scoreMap: { athleteId: { sessionNum: { normalized_score, source, ... } } }
    const scoreMap = {};

    for (const s of sessionScores) {
      if (!scoreMap[s.athlete_id]) scoreMap[s.athlete_id] = {};
      const normalized = Math.min(100, Math.max(0, (parseFloat(s.avg_score) / scale) * 100));
      scoreMap[s.athlete_id][s.session_number] = {
        normalized_score: Math.round(normalized * 10) / 10,
        avg_score: Math.round(parseFloat(s.avg_score) * 10) / 10,
        evaluator_count: parseInt(s.evaluator_count),
        source: "skills",
      };
    }

    for (const t of testingRanks) {
      if (!scoreMap[t.athlete_id]) scoreMap[t.athlete_id] = {};
      const percentile = N > 1 ? ((N - parseInt(t.overall_rank)) / (N - 1)) * 100 : 100;
      scoreMap[t.athlete_id][t.session_number] = {
        normalized_score: Math.round(percentile * 10) / 10,
        overall_rank: parseInt(t.overall_rank),
        source: "testing",
      };
    }

    // Weighted total: Σ (normalized_score × weight_pct / 100)
    // Result is 0-100
    const withTotals = athletes.map(a => {
      const athleteScores = scoreMap[a.id] || {};
      let weightedTotal = 0;
      const sessionBreakdown = {};

      for (const session of sessions) {
        const sd = athleteScores[session.session_number];
        if (sd) {
          const weight = parseFloat(session.weight_percentage) / 100;
          const contribution = Math.round(sd.normalized_score * weight * 10) / 10;
          weightedTotal += contribution;
          sessionBreakdown[session.session_number] = { ...sd, weight: session.weight_percentage, contribution };
        }
      }

      return { ...a, weighted_total: Math.round(weightedTotal * 10) / 10, session_scores: sessionBreakdown };
    });

    // Rank history: re-rank after each completed session
    const rankHistory = {};
    for (let si = 0; si < completedSessions.length; si++) {
      const sessionsUpTo = completedSessions.slice(0, si + 1);
      const relevantSessions = sessions.filter(s => sessionsUpTo.includes(parseInt(s.session_number)));
      const totalWeight = relevantSessions.reduce((sum, s) => sum + parseFloat(s.weight_percentage), 0);

      const isAllSessions = sessionsUpTo.length === completedSessions.length && completedSessions.length === sessions.length;
      const partials = athletes.map(a => {
        const athleteScores = scoreMap[a.id] || {};
        let partialTotal = 0;
        for (const session of relevantSessions) {
          const sd = athleteScores[session.session_number];
          if (sd && totalWeight > 0) {
            // Use same formula as final rank when all sessions complete
            const weight = isAllSessions
              ? parseFloat(session.weight_percentage) / 100
              : parseFloat(session.weight_percentage) / totalWeight;
            partialTotal += sd.normalized_score * weight;
          }
        }
        return { id: a.id, partialTotal };
      });

      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });
      partials.sort((a, b) => b.partialTotal - a.partialTotal);
      partials.forEach((p, idx) => {
        if (!rankHistory[p.id]) rankHistory[p.id] = [];
        rankHistory[p.id].push(idx + 1);
      });
    }

    // Final sort and rank
    withTotals.sort((a, b) => b.weighted_total !== a.weighted_total
      ? b.weighted_total - a.weighted_total
      : a.last_name.localeCompare(b.last_name));

    let currentRank = 1;
    const ranked = withTotals.map((a, i) => {
      currentRank = (i > 0 && a.weighted_total === withTotals[i - 1].weighted_total)
        ? withTotals[i - 1].rank : i + 1;
      return { ...a, rank: currentRank, rank_history: rankHistory[a.id] || [], agreement_pct: agreementMap[a.id] || null };
    });

    // Determine per-session status: not_started / in_progress / complete
    const sessionStatus = {};
    for (const session of sessions) {
      const sNum = session.session_number;
      const hasData = completedSessions.includes(sNum);
      if (!hasData) { sessionStatus[sNum] = "not_started"; continue; }

      if (session.session_type === "testing") {
        // Testing complete if all athletes have a rank
        const testingCount = testingRanks.filter(t => parseInt(t.session_number) === sNum).length;
        sessionStatus[sNum] = testingCount >= athletes.length ? "complete" : "in_progress";
      } else {
        // Skills/scrimmage: complete if all athletes have been scored by required evaluators
        const scoredAthletes = [...new Set(sessionScores.filter(s => parseInt(s.session_number) === sNum).map(s => s.athlete_id))];
        const evaluatorsInSession = [...new Set(sessionScores.filter(s => parseInt(s.session_number) === sNum).map(s => s.evaluator_id))];
        sessionStatus[sNum] = scoredAthletes.length >= athletes.length ? "complete" : "in_progress";
      }
    }

    const trueCompletedSessions = Object.entries(sessionStatus).filter(([,v]) => v === "complete").map(([k]) => parseInt(k));
    const inProgressSessions = Object.entries(sessionStatus).filter(([,v]) => v === "in_progress").map(([k]) => parseInt(k));

    const phase = completedSessions.length === 0 ? "pre_session"
      : trueCompletedSessions.length === sessions.length ? "complete" : "in_progress";

    return NextResponse.json({
      athletes: ranked, has_scores: true, phase, sessions,
      completed_sessions: trueCompletedSessions,
      in_progress_sessions: inProgressSessions,
      session_status: sessionStatus, category,
      scoring_info: { scale, method: "percentile_and_normalized_0_100" },
    });

  } catch (error) {
    console.error("Rankings error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
