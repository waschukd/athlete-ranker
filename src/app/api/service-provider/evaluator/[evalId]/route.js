import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { evalId } = params;

    // Get evaluator basic info
    const evaluator = await sql`
      SELECT id, name, email, role, created_at FROM users WHERE id = ${evalId}
    `;
    if (!evaluator.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Full session history
    const sessions = await sql`
      SELECT 
        ess.id, ess.status, ess.created_at as signed_up_at,
        ess.first_score_at, ess.last_score_at, ess.athletes_scored,
        ess.completed, ess.no_show,
        es.id as schedule_id, es.scheduled_date, es.start_time, es.end_time,
        es.session_number, es.group_number, es.location,
        ac.name as category_name,
        o.name as org_name,
        cs.session_type,
        eh.id as hours_id, eh.hours_worked, eh.status as hours_status,
        er.rating, er.notes as rating_notes
      FROM evaluator_session_signups ess
      JOIN evaluation_schedule es ON es.id = ess.schedule_id
      JOIN age_categories ac ON ac.id = es.age_category_id
      JOIN organizations o ON o.id = ac.organization_id
      LEFT JOIN category_sessions cs ON cs.age_category_id = ac.id AND cs.session_number = es.session_number
      LEFT JOIN evaluator_hours eh ON eh.evaluator_id = ess.user_id AND eh.schedule_id = es.id
      LEFT JOIN evaluator_ratings er ON er.evaluator_id = ess.user_id AND er.schedule_id = es.id
      WHERE ess.user_id = ${evalId}
      ORDER BY es.scheduled_date DESC, es.start_time DESC
    `;

    // All flags
    const flags = await sql`
      SELECT ef.*, es.session_number, es.group_number, es.scheduled_date,
        o.name as org_name
      FROM evaluator_flags ef
      LEFT JOIN evaluation_schedule es ON es.id = ef.schedule_id
      LEFT JOIN age_categories ac ON ac.id = es.age_category_id
      LEFT JOIN organizations o ON o.id = ac.organization_id
      WHERE ef.evaluator_id = ${evalId}
      ORDER BY ef.created_at DESC
    `;

    // Stats summary
    const stats = {
      total_sessions: sessions.filter(s => s.status === 'signed_up' || s.status === 'completed').length,
      completed_sessions: sessions.filter(s => s.completed).length,
      no_shows: sessions.filter(s => s.no_show).length,
      total_hours: sessions.reduce((sum, s) => sum + parseFloat(s.hours_worked || 0), 0),
      pending_hours: sessions.filter(s => s.hours_status === 'pending').reduce((sum, s) => sum + parseFloat(s.hours_worked || 0), 0),
      approved_hours: sessions.filter(s => s.hours_status === 'approved').reduce((sum, s) => sum + parseFloat(s.hours_worked || 0), 0),
      avg_rating: sessions.filter(s => s.rating).length > 0
        ? sessions.reduce((sum, s) => sum + parseFloat(s.rating || 0), 0) / sessions.filter(s => s.rating).length
        : 0,
      strike_count: flags.filter(f => f.flag_type === 'late_cancel').length,
      open_flags: flags.filter(f => !f.reviewed).length,
    };

    // ── Scorecard metrics ──────────────────────────────────────
    // All scores this evaluator has submitted
    const allScores = await sql`
      SELECT cs.score, cs.session_number, cs.age_category_id, cs.scoring_category_id, cs.athlete_id
      FROM category_scores cs
      WHERE cs.evaluator_id = ${evalId}
    `;

    // All scores from OTHER evaluators on the same athletes/categories/sessions (for agreement)
    const peerScores = allScores.length > 0 ? await sql`
      SELECT cs.score, cs.session_number, cs.age_category_id, cs.scoring_category_id, cs.athlete_id, cs.evaluator_id
      FROM category_scores cs
      WHERE cs.evaluator_id != ${evalId}
        AND EXISTS (
          SELECT 1 FROM category_scores mine
          WHERE mine.evaluator_id = ${evalId}
            AND mine.athlete_id = cs.athlete_id
            AND mine.session_number = cs.session_number
            AND mine.scoring_category_id = cs.scoring_category_id
            AND mine.age_category_id = cs.age_category_id
        )
    ` : [];

    // Notes count
    const notesData = await sql`
      SELECT pn.session_number, pn.age_category_id, COUNT(*) as count
      FROM player_notes pn
      WHERE pn.evaluator_id = ${evalId}
      GROUP BY pn.session_number, pn.age_category_id
    `;

    // Compare tool usage
    const compareUsage = await sql`
      SELECT COUNT(*) as count FROM audit_log
      WHERE user_id = ${evalId} AND action = 'compare_used'
    `;
    const compareUseCount = parseInt(compareUsage[0]?.count || 0);

    // Build scorecard in JS
    const scorecard = (() => {
      if (!allScores.length) return { agreement_pct: null, score_avg: null, group_avg: null, bias: null, distribution: {}, notes_total: 0, notes_per_session: 0, compare_uses: compareUseCount, sessions_scored: 0, total_scores: 0, score_range: null };

      // Agreement: for each (athlete, category, session), compare this evaluator's score to peer average
      const diffs = [];
      const peerMap = {};
      for (const ps of peerScores) {
        const key = `${ps.athlete_id}-${ps.scoring_category_id}-${ps.session_number}`;
        if (!peerMap[key]) peerMap[key] = [];
        peerMap[key].push(parseFloat(ps.score));
      }
      let totalEvalScore = 0;
      let totalGroupScore = 0;
      let comparisonCount = 0;
      for (const s of allScores) {
        const key = `${s.athlete_id}-${s.scoring_category_id}-${s.session_number}`;
        const peers = peerMap[key];
        if (peers && peers.length > 0) {
          const peerAvg = peers.reduce((a, b) => a + b, 0) / peers.length;
          const evalScore = parseFloat(s.score);
          diffs.push(Math.abs(evalScore - peerAvg));
          totalEvalScore += evalScore;
          totalGroupScore += peerAvg;
          comparisonCount++;
        }
      }
      const avgDiff = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
      const agreement = diffs.length > 0 ? Math.round(Math.max(0, Math.min(100, (1 - avgDiff / 10) * 100))) : null;

      // Score distribution (histogram)
      const distribution = {};
      for (const s of allScores) {
        const bucket = Math.round(parseFloat(s.score) * 2) / 2; // round to 0.5
        distribution[bucket] = (distribution[bucket] || 0) + 1;
      }

      // Bias (positive = generous, negative = harsh)
      const bias = comparisonCount > 0 ? Math.round(((totalEvalScore / comparisonCount) - (totalGroupScore / comparisonCount)) * 100) / 100 : null;

      // Score range (are they using the full scale?)
      const scoreValues = allScores.map(s => parseFloat(s.score));
      const minScore = Math.min(...scoreValues);
      const maxScore = Math.max(...scoreValues);

      // Notes stats
      const notesTotal = notesData.reduce((sum, n) => sum + parseInt(n.count), 0);
      const sessionsScored = new Set(allScores.map(s => `${s.session_number}-${s.age_category_id}`)).size;
      const athletesScored = new Set(allScores.map(s => s.athlete_id)).size;
      const athletesWithNotes = new Set(notesData.map(() => true)).size; // simplified

      return {
        agreement_pct: agreement,
        score_avg: comparisonCount > 0 ? Math.round((totalEvalScore / comparisonCount) * 10) / 10 : null,
        group_avg: comparisonCount > 0 ? Math.round((totalGroupScore / comparisonCount) * 10) / 10 : null,
        bias,
        distribution,
        notes_total: notesTotal,
        notes_per_session: sessionsScored > 0 ? Math.round((notesTotal / sessionsScored) * 10) / 10 : 0,
        sessions_scored: sessionsScored,
        total_scores: allScores.length,
        athletes_scored: athletesScored,
        score_range: { min: minScore, max: maxScore, spread: Math.round((maxScore - minScore) * 10) / 10 },
        compare_uses: compareUseCount,
      };
    })();

    return NextResponse.json({ evaluator: evaluator[0], sessions, flags, stats, scorecard });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
