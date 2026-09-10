import { describe, it, expect } from "vitest";
import { suggestedRange, rangeNudgeDirection } from "@/lib/scoringGuidance";

describe("suggestedRange", () => {
  it("uses the hand-picked 4-tier bands on a 10-point scale", () => {
    expect(suggestedRange(1, 4, 10)).toEqual({ low: 6, high: 8 });
    expect(suggestedRange(2, 4, 10)).toEqual({ low: 5, high: 7 });
    expect(suggestedRange(3, 4, 10)).toEqual({ low: 3, high: 5 });
    expect(suggestedRange(4, 4, 10)).toEqual({ low: 0.5, high: 3 });
  });

  it("rescales the 4-tier bands proportionally for a different scale", () => {
    // 5-point scale -- everything halves.
    expect(suggestedRange(1, 4, 5)).toEqual({ low: 3, high: 4 });
    expect(suggestedRange(4, 4, 5)).toEqual({ low: 0.3, high: 1.5 }); // 0.25 rounds to one decimal
  });

  it("falls back to an even split for a group count other than 4", () => {
    // 5 groups, scale 10: floor=0.5, span=9.5, bandWidth=1.9
    const g1 = suggestedRange(1, 5, 10);
    const g5 = suggestedRange(5, 5, 10);
    expect(g1.high).toBe(10);
    expect(g5.low).toBeCloseTo(0.5, 5);
    // Bands should be contiguous and cover the full scale top-to-bottom.
    expect(suggestedRange(1, 5, 10).low).toBeCloseTo(suggestedRange(2, 5, 10).high, 5);
  });

  it("never suggests below the scale's small floor", () => {
    const bottom = suggestedRange(10, 10, 10);
    expect(bottom.low).toBeGreaterThanOrEqual(0.5);
  });
});

describe("rangeNudgeDirection", () => {
  // Real request: an evaluator whose average for a player falls outside the
  // group's range gets a soft, self-updating nudge -- "should this player
  // move?" -- instead of only finding out after the fact on the Groups page.
  const range = { low: 6, high: 8 };

  it("nudges up when the average is above the range", () => {
    expect(rangeNudgeDirection(8.5, range)).toBe("up");
  });

  it("nudges down when the average is below the range", () => {
    expect(rangeNudgeDirection(5.5, range)).toBe("down");
  });

  it("says nothing when the average is inside the range, including the edges", () => {
    expect(rangeNudgeDirection(7, range)).toBeNull();
    expect(rangeNudgeDirection(6, range)).toBeNull();
    expect(rangeNudgeDirection(8, range)).toBeNull();
  });

  it("says nothing without a range or an average yet", () => {
    expect(rangeNudgeDirection(9, null)).toBeNull();
    expect(rangeNudgeDirection(null, range)).toBeNull();
  });

  it("never nudges UP from group 1 -- there's no group above the top tier", () => {
    expect(rangeNudgeDirection(9, range, 1, 4)).toBeNull();
    // Still nudges down from group 1 if the score is low -- that direction exists.
    expect(rangeNudgeDirection(4, range, 1, 4)).toBe("down");
  });

  it("never nudges DOWN from the last group -- there's no tier below the bottom", () => {
    expect(rangeNudgeDirection(4, range, 4, 4)).toBeNull();
    // Still nudges up from the last group if the score is high -- that direction exists.
    expect(rangeNudgeDirection(9, range, 4, 4)).toBe("up");
  });

  it("nudges both directions normally for a group in the middle", () => {
    expect(rangeNudgeDirection(9, range, 2, 4)).toBe("up");
    expect(rangeNudgeDirection(4, range, 2, 4)).toBe("down");
  });
});
