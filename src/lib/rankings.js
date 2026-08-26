import sql from "@/lib/db";
import { agreementPct, normalizeScore, testingPercentile, round1 } from "@/lib/scoring";
import { getCoachUserIds } from "@/lib/categoryEvaluators";

// Below this fraction of the season's total weight attended, an athlete's
// prorated total is still shown (their own record/report) but never lets them
// outrank a fully-sampled athlete -- see low_data in buildTotals below.
const MIN_WEIGHT_FOR_RANK = 0.5;

// Single source of truth for category rankings. Pure DB computation — no request
// or auth context — so it can be called directly from any already-authorized route
// instead of self-fetching the /rankings HTTP endpoint (which broke in production
// when NEXT_PUBLIC_BASE_URL was unset and the fetch fell back to localhost).
// Returns the same object shape the /api/categories/[catId]/rankings route serves.
// opts.scope: "official" (default) excludes COACH evaluators' scores; "coach"
// ranks using ONLY coach scores (the parallel coaches' ranking for compare).
export async function computeCategoryRankings(catId, opts = {}) {
  const coachScope = opts.scope === "coach";

  // Four independent reads -- none depends on another's result -- run as one
  // round trip instead of four sequential ones. This function is polled every
  // 120s per open dashboard tab and re-run per athlete during player
  // comparison, so its query count matters more than most.
  const [coachIds, sessions, categoryRes, athletes] = await Promise.all([
    getCoachUserIds(catId),
    sql`SELECT * FROM category_sessions WHERE age_category_id = ${catId} ORDER BY session_number`,
    sql`SELECT * FROM age_categories WHERE id = ${catId}`,
    sql`SELECT * FROM athletes WHERE age_category_id = ${catId} AND is_active = true ORDER BY last_name, first_name`,
  ]);
  // onlyIds: when coach-scope, restrict to coaches. exclIds: official excludes coaches.
  const onlyIds = coachScope ? coachIds : null;   // null = no include-restriction
  const onlyGuard = onlyIds ? 0 : 1;              // 1 → include everyone; 0 → only onlyArr
  const onlyArr = onlyIds ?? [];
  const exclIds = coachScope ? [] : coachIds;     // official excludes coaches

  const category = categoryRes[0];

  if (!athletes.length) {
    return { athletes: [], has_scores: false, phase: "pre_session", sessions, category };
  }

  const N = athletes.length;
  const scale = parseFloat(category?.scoring_scale || 10);

  // Check for any scores — independent of each other, run together.
  const [scoreCheck, testingCheck] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM category_scores WHERE age_category_id = ${catId}`,
    sql`SELECT COUNT(*) as count FROM testing_drill_results WHERE age_category_id = ${catId}`,
  ]);
  const hasScores = parseInt(scoreCheck[0].count) > 0 || parseInt(testingCheck[0].count) > 0;

  if (!hasScores) {
    // Goalies are ranked as a separate pool and must never appear in the skater
    // list — same split as the scored path below. Before this, the no-scores
    // fallback lumped everyone into `athletes`, so a goalie showed a skater rank
    // (e.g. alphabetically 4th) on the group-making page.
    const isGoalie = (a) => (a.position || "").toLowerCase() === "goalie";
    const preRank = (list) => list.map((a, i) => ({ ...a, rank: i + 1, weighted_total: null, session_scores: {}, rank_history: [] }));
    return {
      athletes: preRank(athletes.filter(a => !isGoalie(a))),
      goalies: preRank(athletes.filter(isGoalie)),
      has_scores: false, phase: "pre_session", sessions, category,
    };
  }

  // ── Calculate inter-rater agreement per athlete ────────────────────────
  // allEvalScores, sessionScores, and testingRanks below are three independent
  // reads (different aggregations of category_scores, plus a separate table) --
  // batched together rather than run one after another.
  const [allEvalScores, sessionScores, testingRanks] = await Promise.all([
    sql`
      SELECT athlete_id, scoring_category_id, score
      FROM category_scores
      WHERE age_category_id = ${catId}
        AND (${onlyGuard} = 1 OR evaluator_id = ANY(${onlyArr}))
        AND evaluator_id <> ALL(${exclIds})
    `,
    sql`
      SELECT athlete_id, session_number,
        AVG(score) as avg_score,
        COUNT(DISTINCT evaluator_id) as evaluator_count
      FROM category_scores
      WHERE age_category_id = ${catId}
        AND (${onlyGuard} = 1 OR evaluator_id = ANY(${onlyArr}))
        AND evaluator_id <> ALL(${exclIds})
      GROUP BY athlete_id, session_number
    `,
    sql`
      SELECT DISTINCT ON (athlete_id, session_number) athlete_id, session_number, overall_rank
      FROM testing_drill_results
      WHERE age_category_id = ${catId}
      ORDER BY athlete_id, session_number
    `,
  ]);

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
    if (!agreementMap[athleteId]) agreementMap[athleteId] = [];
    agreementMap[athleteId].push(agreementPct(vals, scale));
  }
  for (const [id, vals] of Object.entries(agreementMap)) {
    agreementMap[id] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  // Skills/scrimmage scores: AVG(score) = average per-category score across all
  // evaluators for this athlete+session; normalized = (avg_score / scale) × 100
  // (e.g. avg 7.5/10 = 75.0, avg 5/10 = 50.0). Testing ranks: percentile =
  // (N - rank) / (N - 1) × 100 (rank 1 of 26 = 100.0, rank 26 = 0.0). Both
  // fetched above alongside allEvalScores.

  const completedSessions = [...new Set([
    ...sessionScores.map(s => parseInt(s.session_number)),
    ...testingRanks.map(t => parseInt(t.session_number)),
  ])].sort();

  // Build scoreMap: { athleteId: { sessionNum: { normalized_score, source, ... } } }
  const scoreMap = {};

  for (const s of sessionScores) {
    if (!scoreMap[s.athlete_id]) scoreMap[s.athlete_id] = {};
    const normalized = normalizeScore(parseFloat(s.avg_score), scale);
    scoreMap[s.athlete_id][s.session_number] = {
      normalized_score: round1(normalized),
      avg_score: round1(parseFloat(s.avg_score)),
      evaluator_count: parseInt(s.evaluator_count),
      source: "skills",
    };
  }

  for (const t of testingRanks) {
    if (!scoreMap[t.athlete_id]) scoreMap[t.athlete_id] = {};
    const percentile = testingPercentile(parseInt(t.overall_rank), N);
    scoreMap[t.athlete_id][t.session_number] = {
      normalized_score: round1(percentile),
      overall_rank: parseInt(t.overall_rank),
      source: "testing",
    };
  }

  // Weighted total: prorate from attended sessions only
  // If athlete attended 1 of 2 sessions (each 50%), their score is prorated
  // to 100% instead of penalizing for missed sessions
  // Skaters rank on the category sessions. Goalies rank on their OWN configured
  // sessions (category.goalie_config.sessions) when present, else fall back to
  // the shared sessions. Skater behaviour is byte-identical to before — they
  // always use `sessions`; only the goalie branch can diverge.
  const goalieCfg = category?.goalie_config;
  const goalieSessions = (Array.isArray(goalieCfg?.sessions) && goalieCfg.sessions.length) ? goalieCfg.sessions : sessions;

  // Weighted total for a set of athletes over a given session set. Prorates from
  // attended sessions only (a missed session doesn't penalise the rest).
  const buildTotals = (list, sess) => list.map(a => {
    const athleteScores = scoreMap[a.id] || {};
    let weightedTotal = 0, totalWeightAttended = 0, sessionsAttended = 0;
    const sessionBreakdown = {};
    for (const session of sess) {
      const sd = athleteScores[session.session_number];
      if (sd) {
        const weight = parseFloat(session.weight_percentage) / 100;
        totalWeightAttended += weight;
        sessionsAttended++;
        sessionBreakdown[session.session_number] = { ...sd, weight: session.weight_percentage };
      }
    }
    if (totalWeightAttended > 0) {
      const prorateFactor = 1 / totalWeightAttended;
      for (const session of sess) {
        const sd = athleteScores[session.session_number];
        if (sd) {
          const weight = parseFloat(session.weight_percentage) / 100;
          const contribution = Math.round(sd.normalized_score * weight * prorateFactor * 10) / 10;
          weightedTotal += contribution;
          sessionBreakdown[session.session_number].contribution = contribution;
        }
      }
    }
    return {
      ...a,
      weighted_total: Math.round(weightedTotal * 10) / 10,
      session_scores: sessionBreakdown,
      sessions_attended: sessionsAttended,
      sessions_total: sess.length,
      incomplete: sessionsAttended < sess.length,
      total_weight_attended: Math.round(totalWeightAttended * 1000) / 1000,
      // An athlete with only a sliver of the season's weight attended (e.g. just
      // the 20%-weighted testing session) gets that sliver prorated up to their
      // FULL total -- a single strong testing rank can outrank kids with two full
      // sessions of real data. Below this floor they still get a weighted_total
      // (for their own record/report) but never outrank a fully-sampled athlete.
      low_data: totalWeightAttended < MIN_WEIGHT_FOR_RANK,
    };
  });

  // Rank a set independently: per-session rank history is computed WITHIN the set
  // (over that set's sessions), overall rank is 1..n. Goalies are ranked separately
  // from skaters — they're evaluated on different terms (apples vs oranges).
  const rankGroup = (group, sess) => {
    const rankHistory = {};
    for (const session of sess) {
      const sNum = session.session_number;
      const list = group
        .map(a => { const sd = (scoreMap[a.id] || {})[sNum]; return { id: a.id, score: sd ? sd.normalized_score : null }; })
        .filter(s => s.score !== null);
      if (!list.length) continue;
      list.sort((a, b) => b.score - a.score);
      list.forEach((s, idx) => { (rankHistory[s.id] ||= []).push(idx + 1); });
    }
    // Fully/adequately-sampled athletes always rank ahead of low-data ones,
    // regardless of prorated total -- see low_data above.
    const sorted = [...group].sort((a, b) => {
      if (a.low_data !== b.low_data) return a.low_data ? 1 : -1;
      return b.weighted_total !== a.weighted_total
        ? b.weighted_total - a.weighted_total
        : a.last_name.localeCompare(b.last_name);
    });
    let currentRank = 1;
    return sorted.map((a, i) => {
      currentRank = (i > 0 && a.weighted_total === sorted[i - 1].weighted_total && a.low_data === sorted[i - 1].low_data) ? currentRank : i + 1;
      return { ...a, rank: currentRank, rank_history: rankHistory[a.id] || [], agreement_pct: agreementMap[a.id] || null };
    });
  };

  const isGoalie = (a) => (a.position || "").toLowerCase() === "goalie";
  const ranked = rankGroup(buildTotals(athletes.filter(a => !isGoalie(a)), sessions), sessions);
  const rankedGoalies = rankGroup(buildTotals(athletes.filter(isGoalie), goalieSessions), goalieSessions);

  // Determine per-session status: not_started / in_progress / complete
  const sessionStatus = {};
  for (const session of sessions) {
    const sNum = session.session_number;
    const hasData = completedSessions.includes(sNum);
    if (!hasData) { sessionStatus[sNum] = "not_started"; continue; }

    if (session.session_type === "testing") {
      // Testing complete when the SKATERS have ranks — goalies don't do testing
      // (they run goalie stations instead), so don't hold the session open for them.
      const skaterCount = athletes.filter(a => (a.position || "").toLowerCase() !== "goalie").length;
      const testingCount = testingRanks.filter(t => parseInt(t.session_number) === sNum).length;
      sessionStatus[sNum] = testingCount >= skaterCount ? "complete" : "in_progress";
    } else {
      // Skills/scrimmage: complete if all athletes have been scored by required evaluators
      const scoredAthletes = [...new Set(sessionScores.filter(s => parseInt(s.session_number) === sNum).map(s => s.athlete_id))];
      // Complete if at least 70% of athletes scored (handles partial imports/no-shows)
      sessionStatus[sNum] = scoredAthletes.length >= Math.ceil(athletes.length * 0.7) ? "complete" : "in_progress";
    }
  }

  const trueCompletedSessions = Object.entries(sessionStatus).filter(([,v]) => v === "complete").map(([k]) => parseInt(k));
  const inProgressSessions = Object.entries(sessionStatus).filter(([,v]) => v === "in_progress").map(([k]) => parseInt(k));

  // Trend arrow: rank as of the PREVIOUS completed session vs the current overall
  // rank -- both computed the same way (blended, prorated, low_data-aware), so it's
  // apples-to-apples. Previously this compared the overall rank to the athlete's
  // isolated rank WITHIN just their most recent session (rank_history's last entry),
  // which mixes two different rank spaces: a session's own internal order rarely
  // matches the blended weighted order, so "down from #2" could fire on an athlete
  // who actually climbed overall (e.g. testing rank 2nd but overall 3rd once skills
  // is blended in reads as "down from 2" despite never having been ranked 2nd overall).
  const sortedCompleted = [...trueCompletedSessions].sort((a, b) => a - b);
  if (sortedCompleted.length >= 2) {
    const prevCheckpoint = sortedCompleted[sortedCompleted.length - 2];
    const prevSessions = sessions.filter(s => s.session_number <= prevCheckpoint);
    const prevRanked = rankGroup(buildTotals(athletes.filter(a => !isGoalie(a)), prevSessions), prevSessions);
    const prevRankById = Object.fromEntries(prevRanked.map(a => [a.id, a.rank]));
    for (const a of ranked) a.prev_rank = prevRankById[a.id] ?? null;
  } else {
    for (const a of ranked) a.prev_rank = null;
  }

  const phase = completedSessions.length === 0 ? "pre_session"
    : trueCompletedSessions.length === sessions.length ? "complete" : "in_progress";

  return {
    athletes: ranked, goalies: rankedGoalies, has_scores: true, phase, sessions,
    completed_sessions: trueCompletedSessions,
    in_progress_sessions: inProgressSessions,
    session_status: sessionStatus, category,
    has_coaches: coachIds.length > 0,
    scoring_info: { scale, method: "percentile_and_normalized_0_100" },
  };
}
