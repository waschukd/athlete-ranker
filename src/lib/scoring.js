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
