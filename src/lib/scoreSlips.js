// Catch a slipped finger: an evaluator meant 7 and entered 0.5.
//
// The signal is internal to ONE evaluator's scores for ONE athlete in ONE
// session. Brad gave Olivia Hennessey 7, 7, 7.5 and 0.5. No honest opinion of
// a player looks like that; a real weak area on an otherwise-7 player is a 5,
// not a 0.5. Peers are not needed for the test and are not used -- a whole
// panel legitimately scoring a kid low must never be flagged as a slip.
//
// A flagged score is a SUGGESTION. Nothing is changed until the service
// provider approves it; the suggested value is the median of that evaluator's
// other criteria for the same athlete, snapped to the category's increment.

export const SLIP_MIN_OTHER_CRITERIA = 3;   // need a real picture of the player
export const SLIP_MIN_GAP = 4;              // points below the median, on a 10 scale
export const SLIP_MAX_RATIO = 0.4;          // and no more than 40% of it

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function snapToIncrement(value, increment = 1, scale = 10) {
  const inc = increment > 0 ? increment : 1;
  const snapped = Math.round(value / inc) * inc;
  return Math.max(0, Math.min(scale, Math.round(snapped * 100) / 100));
}

/**
 * rows: [{ id, evaluator_id, athlete_id, age_category_id, session_number,
 *          scoring_category_id, score }]
 * Returns one suggestion per slipped score:
 *   { score_id, evaluator_id, athlete_id, age_category_id, session_number,
 *     scoring_category_id, original, suggested, others, reason }
 */
export function detectSlips(rows, { scale = 10, increment = 1 } = {}) {
  const gap = SLIP_MIN_GAP * (scale / 10);
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.evaluator_id}|${r.athlete_id}|${r.age_category_id}|${r.session_number}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = [];
  for (const list of groups.values()) {
    if (list.length < SLIP_MIN_OTHER_CRITERIA + 1) continue;
    for (const r of list) {
      const others = list.filter(o => o !== r).map(o => parseFloat(o.score)).filter(v => !Number.isNaN(v));
      if (others.length < SLIP_MIN_OTHER_CRITERIA) continue;
      const v = parseFloat(r.score);
      if (Number.isNaN(v)) continue;
      const med = median(others);
      // Both conditions: far below in absolute terms AND a small fraction of
      // the rest. A 3 next to 7s is a strong opinion; a 0.5 next to 7s is a slip.
      if (med - v >= gap && v <= med * SLIP_MAX_RATIO) {
        out.push({
          score_id: r.id,
          evaluator_id: r.evaluator_id, athlete_id: r.athlete_id,
          age_category_id: r.age_category_id, session_number: r.session_number,
          scoring_category_id: r.scoring_category_id,
          original: v,
          suggested: snapToIncrement(med, increment, scale),
          others,
          reason: `${v} beside ${others.slice().sort((a, b) => a - b).join(", ")} from the same evaluator`,
        });
      }
    }
  }
  return out;
}
