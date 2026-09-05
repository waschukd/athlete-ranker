// Pure scoring/ranking math shared by the consensus and rankings routes.
//
// Everything here is deliberately free of DB, auth, and request concerns so it
// can be unit-tested in isolation. The API routes import these helpers instead
// of inlining the formulas, which also keeps the two routes from drifting apart
// (the agreement formula used to be copy-pasted in both, slightly differently).

/**
 * Population standard deviation of a list of numbers.
 * Returns 0 for fewer than two values (no spread to measure).
 */
export function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Inter-rater agreement as a 0-100 percentage: how closely a set of evaluator
 * scores agree, where 100 = identical scores and lower = more spread.
 *
 * agreement = (1 - stdDev/scale) * 100, clamped to [0, 100] and rounded.
 * With a single score (or none) there is nothing to disagree about, so 100.
 *
 * @param {number[]} values evaluator scores for one athlete/category
 * @param {number} scale    max score on the scoring scale (e.g. 10)
 */
export function agreementPct(values, scale = 10) {
  if (values.length < 2) return 100;
  const sd = stdDev(values);
  return Math.round(Math.max(0, Math.min(100, (1 - sd / scale) * 100)));
}

/**
 * Classify a 1-based rank into a tier: top 25%, bottom 25%, middle otherwise.
 * Boundaries are computed so that every group has at least a top and a bottom
 * slot even when the field is tiny.
 *
 * @param {number} rank  1-based rank (1 = best)
 * @param {number} total number of ranked athletes
 * @returns {"top"|"middle"|"bottom"}
 */
export function getTier(rank, total) {
  const t = Math.max(1, Math.ceil(total * 0.25));
  const b = Math.max(t + 1, total - Math.ceil(total * 0.25) + 1);
  if (rank <= t) return "top";
  if (rank >= b) return "bottom";
  return "middle";
}

/**
 * Normalize an average skills score onto a 0-100 scale.
 * e.g. an average of 7.5 on a scale of 10 → 75. Clamped to [0, 100].
 */
export function normalizeScore(avgScore, scale) {
  return Math.min(100, Math.max(0, (avgScore / scale) * 100));
}

/**
 * Convert a 1-based testing rank into a 0-100 percentile, where rank 1 is the
 * best (100) and the last rank is 0. A field of one is treated as 100.
 *
 * e.g. rank 1 of 26 → 100, rank 13 of 26 → 50, rank 26 of 26 → 0.
 */
export function testingPercentile(rank, total) {
  return total > 1 ? ((total - rank) / (total - 1)) * 100 : 100;
}

/** Round to one decimal place (the precision used throughout the score UI). */
export function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * How often each evaluator lands on the losing side of a tier disagreement --
 * the same top/middle/bottom split the live consensus screen
 * (categories/[catId]/consensus) flags a director to go review.
 *
 * Real incident: an evaluator with excellent raw score agreement (tight to
 * the group's point average) turned out to be the single most frequent
 * source of real consensus splits once measured this way. Point-level
 * closeness and tier-boundary agreement are different things -- a small
 * point deviation right at a tier cutoff still flips top/middle/bottom,
 * and that's what actually costs a director a manual review. This is the
 * metric that should back any "agreement" number shown to a director or an
 * evaluator, not raw score deviation.
 *
 * @param {Array<{age_category_id:number, session_number:number, group_number:number, athlete_id:number, evaluator_id:number, score:number}>} rows
 *   Every score row for the population being analyzed, already resolved to a
 *   group_number (via session_groups/player_group_assignments -- category_scores
 *   itself doesn't reliably carry one).
 * @param {Set<string>} coachSet  `${age_category_id}-${user_id}` pairs to exclude
 *   (coaches are a parallel, comparison-only track and must never count as a
 *   disagreeing official evaluator).
 * @returns {Map<number, {totalJudged:number, splitsInvolved:number, timesDiffered:number}>}
 *   Keyed by evaluator_id. totalJudged = athletes they scored alongside >=1
 *   other evaluator in the same group. timesDiffered = of those, how many
 *   times their tier didn't match the majority tier.
 */
export function tierDisagreementStats(rows, coachSet = new Set()) {
  // group -> evaluator -> athlete -> {sum, n}
  const groups = new Map();
  for (const r of rows) {
    if (coachSet.has(`${r.age_category_id}-${r.evaluator_id}`)) continue;
    const gkey = `${r.age_category_id}-${r.session_number}-${r.group_number}`;
    if (!groups.has(gkey)) groups.set(gkey, new Map());
    const evalMap = groups.get(gkey);
    if (!evalMap.has(r.evaluator_id)) evalMap.set(r.evaluator_id, new Map());
    const athleteMap = evalMap.get(r.evaluator_id);
    const score = parseFloat(r.score);
    const prev = athleteMap.get(r.athlete_id) || { sum: 0, n: 0 };
    athleteMap.set(r.athlete_id, { sum: prev.sum + score, n: prev.n + 1 });
  }

  const stats = new Map();
  const bump = (eid) => {
    if (!stats.has(eid)) stats.set(eid, { totalJudged: 0, splitsInvolved: 0, timesDiffered: 0 });
    return stats.get(eid);
  };

  for (const evalMap of groups.values()) {
    const evalIds = [...evalMap.keys()];
    if (evalIds.length < 2) continue;

    // This evaluator's own rank-order (and thus tier) of the athletes THEY scored.
    const tierByEvalAthlete = new Map();
    for (const eid of evalIds) {
      const athleteAvgs = [...evalMap.get(eid).entries()].map(([aid, v]) => ({ aid, avg: v.sum / v.n }));
      athleteAvgs.sort((a, b) => b.avg - a.avg);
      const total = athleteAvgs.length;
      const tierMap = new Map();
      athleteAvgs.forEach((a, i) => tierMap.set(a.aid, getTier(i + 1, total)));
      tierByEvalAthlete.set(eid, tierMap);
    }

    // Union across evaluators, per athlete.
    const athleteEvalTiers = new Map();
    for (const eid of evalIds) {
      for (const [aid, tier] of tierByEvalAthlete.get(eid)) {
        if (!athleteEvalTiers.has(aid)) athleteEvalTiers.set(aid, []);
        athleteEvalTiers.get(aid).push({ eid, tier });
      }
    }

    for (const entries of athleteEvalTiers.values()) {
      if (entries.length < 2) continue;
      for (const e of entries) bump(e.eid).totalJudged++;

      const tierCounts = {};
      for (const e of entries) tierCounts[e.tier] = (tierCounts[e.tier] || 0) + 1;
      if (Object.keys(tierCounts).length === 1) continue; // unanimous

      const majorityTier = Object.entries(tierCounts).sort((a, b) => b[1] - a[1])[0][0];
      for (const e of entries) {
        const s = bump(e.eid);
        s.splitsInvolved++;
        if (e.tier !== majorityTier) s.timesDiffered++;
      }
    }
  }

  return stats;
}
