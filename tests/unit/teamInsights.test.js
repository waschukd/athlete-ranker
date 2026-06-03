import { describe, it, expect } from "vitest";
import { buildSignals, detectBreaks, computeLean, analyzeTeams, cutsToSizes } from "@/lib/teamInsights";

const sessions = [
  { session_number: 1, session_type: "testing" },
  { session_number: 2, session_type: "scrimmage" },
  { session_number: 3, session_type: "scrimmage" },
];

function athlete(id, rank, composite, testing, game, agreement, rankHist) {
  return {
    id, first_name: "P" + id, last_name: "L" + id, rank,
    weighted_total: composite, agreement_pct: agreement,
    rank_history: rankHist || [],
    session_scores: {
      1: { normalized_score: testing, source: "testing" },
      2: { normalized_score: game, source: "skills" },
      3: { normalized_score: game, source: "skills" },
    },
  };
}

describe("buildSignals", () => {
  it("splits testing vs game and computes divergence", () => {
    const s = buildSignals(athlete("a", 1, 80, 90, 60, 75, [2, 1]), sessions);
    expect(s.testingScore).toBe(90);
    expect(s.gameScore).toBe(60);
    expect(s.divergence).toBe(-30);
    expect(s.trend).toBeGreaterThan(0);
  });
});

describe("detectBreaks", () => {
  const ranked = [
    { composite: 90 }, { composite: 89 }, { composite: 88 },
    { composite: 70 }, { composite: 69 }, { composite: 68 },
  ];
  it("finds a clean break at the obvious gap near the cut", () => {
    const breaks = detectBreaks(ranked, [3, 3], {});
    expect(breaks).toHaveLength(1);
    expect(breaks[0].suggestedCut).toBe(3);
    expect(breaks[0].isClean).toBe(true);
    expect(breaks[0].gap).toBeCloseTo(18, 1);
  });
  it("reports no clean break on a flat field", () => {
    const flat = [90, 89, 88, 87, 86, 85].map(c => ({ composite: c }));
    const breaks = detectBreaks(flat, [3, 3], {});
    expect(breaks[0].isClean).toBe(false);
  });
  it("returns one entry per interior cut", () => {
    const breaks = detectBreaks(ranked, [2, 2, 2], {});
    expect(breaks).toHaveLength(2);
    expect(breaks.map(b => b.intendedCut)).toEqual([2, 4]);
  });
});

describe("computeLean (game prioritized)", () => {
  it("leans DOWN when a player tests well but plays poorly", () => {
    const r = computeLean({ divergence: -30, trend: 0, agreement: 80 }, {});
    expect(r.lean).toBe("down");
    expect(r.reasons.join(" ").toLowerCase()).toContain("game play prioritized");
  });
  it("leans UP when a player plays better than they test", () => {
    const r = computeLean({ divergence: 30, trend: 0, agreement: 80 }, {});
    expect(r.lean).toBe("up");
  });
  it("is a toss-up with a balanced profile and high agreement", () => {
    const r = computeLean({ divergence: 0, trend: 0, agreement: 85 }, {});
    expect(r.lean).toBe("tossup");
    expect(r.confidence).toBe("high");
  });
  it("flags low evaluator agreement for human review without flipping the lean", () => {
    const r = computeLean({ divergence: 0, trend: 0, agreement: 50 }, {});
    expect(r.confidence).toBe("low");
    expect(r.needsReview).toBe(true);
  });
});

describe("analyzeTeams", () => {
  it("returns breaks and a bubble list with leans", () => {
    const ranked = [
      athlete("a", 1, 90, 92, 88, 90, [1, 1]),
      athlete("b", 2, 89, 70, 95, 85, [3, 1]),
      athlete("c", 3, 88, 88, 88, 80, [2, 2]),
      athlete("d", 4, 70, 90, 60, 55, [1, 5]),
      athlete("e", 5, 69, 68, 70, 80, [5, 4]),
      athlete("f", 6, 68, 66, 69, 80, [6, 6]),
    ];
    const out = analyzeTeams(ranked, sessions, [3, 3], {});
    expect(out.breaks).toHaveLength(1);
    expect(out.bubbles.length).toBeGreaterThan(0);
    expect(out.bubbles[0]).toHaveProperty("lean");
    expect(out.bubbles[0]).toHaveProperty("reasons");
  });
});

describe("cutsToSizes", () => {
  it("turns a single cut into two team sizes", () => {
    expect(cutsToSizes([16], 34)).toEqual([16, 18]);
  });
  it("turns multiple cuts into sizes", () => {
    expect(cutsToSizes([12, 23], 34)).toEqual([12, 11, 11]);
  });
  it("returns one team when there are no cuts", () => {
    expect(cutsToSizes([], 10)).toEqual([10]);
  });
  it("sorts and ignores out-of-range cuts", () => {
    expect(cutsToSizes([23, 12, 0, 40], 34)).toEqual([12, 11, 11]);
  });
});
