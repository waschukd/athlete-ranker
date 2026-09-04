import { describe, it, expect } from "vitest";
import { suggestedRange } from "@/lib/scoringGuidance";

describe("suggestedRange", () => {
  it("uses the hand-picked 4-tier bands on a 10-point scale", () => {
    expect(suggestedRange(1, 4, 10)).toEqual({ low: 7, high: 10 });
    expect(suggestedRange(2, 4, 10)).toEqual({ low: 5, high: 7 });
    expect(suggestedRange(3, 4, 10)).toEqual({ low: 3, high: 5 });
    expect(suggestedRange(4, 4, 10)).toEqual({ low: 0.5, high: 3 });
  });

  it("rescales the 4-tier bands proportionally for a different scale", () => {
    // 5-point scale -- everything halves.
    expect(suggestedRange(1, 4, 5)).toEqual({ low: 3.5, high: 5 });
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
