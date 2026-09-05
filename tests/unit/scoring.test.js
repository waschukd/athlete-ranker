import { describe, it, expect } from "vitest";
import {
  stdDev,
  agreementPct,
  getTier,
  normalizeScore,
  testingPercentile,
  round1,
  tierDisagreementStats,
} from "@/lib/scoring";

describe("stdDev", () => {
  it("returns 0 for fewer than two values", () => {
    expect(stdDev([])).toBe(0);
    expect(stdDev([7])).toBe(0);
  });

  it("returns 0 when every value is identical", () => {
    expect(stdDev([5, 5, 5, 5])).toBe(0);
  });

  it("computes the population standard deviation", () => {
    // mean 5, deviations ±3/±1 → variance (9+1+1+9)/4 = 5 → sqrt(5)
    expect(stdDev([2, 4, 6, 8])).toBeCloseTo(Math.sqrt(5), 10);
  });

  it("is order-independent", () => {
    expect(stdDev([8, 2, 6, 4])).toBeCloseTo(stdDev([2, 4, 6, 8]), 10);
  });
});

describe("agreementPct", () => {
  it("is 100 with zero or one score (nothing to disagree about)", () => {
    expect(agreementPct([])).toBe(100);
    expect(agreementPct([7])).toBe(100);
  });

  it("is 100 when evaluators score identically", () => {
    expect(agreementPct([6, 6, 6])).toBe(100);
  });

  it("drops as scores spread apart", () => {
    const tight = agreementPct([7, 7, 8]);
    const loose = agreementPct([2, 7, 10]);
    expect(tight).toBeGreaterThan(loose);
  });

  it("clamps to 0 rather than going negative on huge spread", () => {
    // On a tiny scale a big spread would push (1 - sd/scale) below 0.
    expect(agreementPct([0, 10], 1)).toBe(0);
  });

  it("honours a custom scale", () => {
    // Same spread is proportionally less significant on a larger scale.
    expect(agreementPct([4, 6], 100)).toBeGreaterThan(agreementPct([4, 6], 10));
  });

  it("returns an integer percentage", () => {
    const pct = agreementPct([3, 7, 8]);
    expect(Number.isInteger(pct)).toBe(true);
  });
});

describe("getTier", () => {
  it("splits a field of 8 into top/middle/bottom quartiles", () => {
    // total 8 → top cutoff ceil(2)=2, bottom = 8-2+1 = 7
    expect(getTier(1, 8)).toBe("top");
    expect(getTier(2, 8)).toBe("top");
    expect(getTier(3, 8)).toBe("middle");
    expect(getTier(6, 8)).toBe("middle");
    expect(getTier(7, 8)).toBe("bottom");
    expect(getTier(8, 8)).toBe("bottom");
  });

  it("guarantees a top and bottom slot even with a tiny field", () => {
    // total 2 → top cutoff 1, bottom forced to top+1 = 2
    expect(getTier(1, 2)).toBe("top");
    expect(getTier(2, 2)).toBe("bottom");
  });

  it("classifies a single athlete as top", () => {
    expect(getTier(1, 1)).toBe("top");
  });

  it("never returns middle when top and bottom would overlap", () => {
    // total 3 → top=1, bottom=max(2, 3-1+1=3)=3, rank 2 is middle
    expect(getTier(1, 3)).toBe("top");
    expect(getTier(2, 3)).toBe("middle");
    expect(getTier(3, 3)).toBe("bottom");
  });
});

describe("normalizeScore", () => {
  it("maps an average onto a 0-100 scale", () => {
    expect(normalizeScore(7.5, 10)).toBe(75);
    expect(normalizeScore(5, 10)).toBe(50);
    expect(normalizeScore(0, 10)).toBe(0);
    expect(normalizeScore(10, 10)).toBe(100);
  });

  it("respects a non-default scale", () => {
    expect(normalizeScore(3, 5)).toBe(60);
  });

  it("clamps out-of-range averages into [0, 100]", () => {
    expect(normalizeScore(12, 10)).toBe(100);
    expect(normalizeScore(-2, 10)).toBe(0);
  });
});

describe("testingPercentile", () => {
  it("maps rank 1 to 100 and last place to 0", () => {
    expect(testingPercentile(1, 26)).toBe(100);
    expect(testingPercentile(26, 26)).toBe(0);
  });

  it("maps the middle rank to ~50", () => {
    // rank 13 of 26 → (26-13)/25 * 100 = 52
    expect(testingPercentile(13, 26)).toBeCloseTo(52, 10);
  });

  it("treats a field of one as the top percentile", () => {
    expect(testingPercentile(1, 1)).toBe(100);
  });
});

describe("tierDisagreementStats", () => {
  // 4 athletes, one group. E1 and E2 rank them identically; E3 ranks them
  // in reverse -- so A and D (top/bottom) split, B and C (both middle
  // either way) don't.
  const baseRows = [
    { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "A", evaluator_id: "E1", score: 9 },
    { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "B", evaluator_id: "E1", score: 7 },
    { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "C", evaluator_id: "E1", score: 5 },
    { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "D", evaluator_id: "E1", score: 2 },
    { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "A", evaluator_id: "E2", score: 9 },
    { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "B", evaluator_id: "E2", score: 7 },
    { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "C", evaluator_id: "E2", score: 5 },
    { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "D", evaluator_id: "E2", score: 2 },
    { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "A", evaluator_id: "E3", score: 2 },
    { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "B", evaluator_id: "E3", score: 5 },
    { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "C", evaluator_id: "E3", score: 7 },
    { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "D", evaluator_id: "E3", score: 9 },
  ];

  it("flags the evaluator whose tier breaks from the majority, not the majority itself", () => {
    const stats = tierDisagreementStats(baseRows);
    expect(stats.get("E1")).toEqual({ totalJudged: 4, splitsInvolved: 2, timesDiffered: 0 });
    expect(stats.get("E2")).toEqual({ totalJudged: 4, splitsInvolved: 2, timesDiffered: 0 });
    expect(stats.get("E3")).toEqual({ totalJudged: 4, splitsInvolved: 2, timesDiffered: 2 });
  });

  it("counts nothing for a group with only one evaluator", () => {
    const rows = [
      { age_category_id: 2, session_number: 1, group_number: 1, athlete_id: "A", evaluator_id: "E1", score: 8 },
      { age_category_id: 2, session_number: 1, group_number: 1, athlete_id: "B", evaluator_id: "E1", score: 3 },
    ];
    const stats = tierDisagreementStats(rows);
    expect(stats.size).toBe(0);
  });

  it("never disagrees when every evaluator ranks the field identically", () => {
    const rows = baseRows.filter(r => r.evaluator_id !== "E3"); // just E1 and E2, who agree
    const stats = tierDisagreementStats(rows);
    for (const s of stats.values()) expect(s.timesDiffered).toBe(0);
  });

  it("excludes a coach's scores entirely, and doesn't count them against others", () => {
    const coachRows = [
      ...baseRows,
      { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "A", evaluator_id: "COACH", score: 0.5 },
      { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "B", evaluator_id: "COACH", score: 10 },
      { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "C", evaluator_id: "COACH", score: 0.5 },
      { age_category_id: 1, session_number: 1, group_number: 1, athlete_id: "D", evaluator_id: "COACH", score: 10 },
    ];
    const stats = tierDisagreementStats(coachRows, new Set(["1-COACH"]));
    expect(stats.has("COACH")).toBe(false);
    // Same result as without the coach's rows at all.
    expect(stats.get("E1")).toEqual({ totalJudged: 4, splitsInvolved: 2, timesDiffered: 0 });
    expect(stats.get("E3")).toEqual({ totalJudged: 4, splitsInvolved: 2, timesDiffered: 2 });
  });
});

describe("round1", () => {
  it("rounds to one decimal place", () => {
    expect(round1(75.04)).toBe(75);
    expect(round1(75.05)).toBeCloseTo(75.1, 10);
    expect(round1(52.349)).toBeCloseTo(52.3, 10);
  });
});
