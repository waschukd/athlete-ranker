// Suggested starting score bands per group/tier, for the moment before any
// real scores exist this session to calibrate against. Real incident:
// evaluators walking into Group 1 of a brand-new session had zero guidance,
// so whatever number they picked first set an arbitrary anchor every group
// below it then had to guess relative to. Group numbers are tiers (Group 1 is
// the top tier), so bands run from the top of the scale down -- most players
// should cluster mid-band; a literal top-of-scale or bottom-of-scale score
// should stay rare regardless of tier.
//
// The 4-tier bands below are hand-picked from real evaluation experience, not
// a formula -- confirmed as the starting point for the common 4-group case.
// A different group count falls back to an even split of the same overall
// range, which is a reasonable default but not guaranteed to fit every
// category's tier spread (e.g. a finer-grained structure like SEERA's) --
// treat that fallback as a starting point to hand-adjust, not gospel.
const FOUR_TIER_BANDS = [
  { low: 6, high: 8 },
  { low: 5, high: 7 },
  { low: 3, high: 5 },
  { low: 0.5, high: 3 },
];

/** Round to one decimal (the precision used throughout scoring). */
function round1(v) {
  return Math.round(v * 10) / 10;
}

/**
 * Suggested {low, high} band for a group/tier before real scores establish
 * an actual range. Bands are authored for a 10-point scale and rescale
 * proportionally for a category using a different max.
 */
export function suggestedRange(groupNumber, totalGroups, scale = 10) {
  const factor = scale / 10;
  if (totalGroups === 4 && groupNumber >= 1 && groupNumber <= 4) {
    const band = FOUR_TIER_BANDS[groupNumber - 1];
    return { low: round1(band.low * factor), high: round1(band.high * factor) };
  }
  const floor = scale * 0.05;
  const span = scale - floor;
  const bandWidth = span / Math.max(1, totalGroups);
  const high = scale - (groupNumber - 1) * bandWidth;
  const low = scale - groupNumber * bandWidth;
  return { low: round1(Math.max(floor, low)), high: round1(high) };
}

/**
 * Does this evaluator's average for one player, in one session, fall outside
 * the group's range? Feeds the live "should this player move?" nudge shown
 * while scoring -- one line, self-updating, nothing to dismiss. Returns
 * "up"/"down"/null rather than a full message so the UI owns the wording.
 *
 * Group 1 is the top tier (see suggestedRange above), so there's nowhere to
 * move UP from group 1, and nowhere to move DOWN from the last group -- pass
 * groupNumber/totalGroups so a top-group player scoring high, or a
 * bottom-group player scoring low, doesn't get a nudge toward a group that
 * doesn't exist.
 */
export function rangeNudgeDirection(avg, range, groupNumber = null, totalGroups = null) {
  if (!range || avg == null) return null;
  if (avg > range.high) return groupNumber === 1 ? null : "up";
  if (avg < range.low) return groupNumber != null && totalGroups != null && groupNumber >= totalGroups ? null : "down";
  return null;
}
