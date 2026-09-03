// Real incident: SPS Fuzion U11 Jr Kings (24 on roster: 21 skaters + 3
// goalies, only 19 skaters actually tested) gave its worst tester a testing
// score of 21.7 instead of 0, while Millwoods U9 Tier 1 (28 skaters, 0
// goalies, all 28 tested) correctly gave its worst tester a 0 -- same exact
// formula, just N (whole active roster) happened to equal the real field
// size there and not at Fuzion.
//
// The fix: testing percentile is scored against how many athletes actually
// have a result for THAT testing session, not N.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/categoryEvaluators", () => ({ getCoachUserIds: vi.fn(async () => []) }));

const { default: sql } = await import("@/lib/db");
const { computeCategoryRankings } = await import("@/lib/rankings");

// 2 skaters + 1 goalie -- N (active roster) = 3, but only the 2 skaters ever
// take the skater testing session, so the real field size is 2.
const ATHLETES = [
  { id: 1, first_name: "A", last_name: "Best", position: "forward" },
  { id: 2, first_name: "B", last_name: "Worst", position: "forward" },
  { id: 3, first_name: "G", last_name: "Goalie", position: "goalie" },
];

function mockScoredWithTesting() {
  sql.mockReset();
  sql
    .mockResolvedValueOnce([{ session_number: 1, session_type: "testing", weight_percentage: 100 }]) // sessions
    .mockResolvedValueOnce([{ id: 43, scoring_scale: 10, eval_format: "standard" }])                  // category
    .mockResolvedValueOnce(ATHLETES)                                                                  // athletes
    .mockResolvedValueOnce([{ count: 0 }])                                                            // category_scores count
    .mockResolvedValueOnce([{ count: 2 }])                                                            // testing_drill_results count
    .mockResolvedValueOnce([])                                                                        // allEvalScores
    .mockResolvedValueOnce([                                                                          // testingRanks
      { athlete_id: 1, session_number: 1, overall_rank: 1 },
      { athlete_id: 2, session_number: 1, overall_rank: 2 },
    ]);
}

describe("testing percentile uses the actual per-session tester count, not the whole roster", () => {
  beforeEach(() => mockScoredWithTesting());

  it("gives the worst of 2 real testers a 0, even though the roster (N) is 3", async () => {
    const r = await computeCategoryRankings(43, {});
    const worst = r.athletes.find(a => a.last_name === "Worst");
    expect(worst.session_scores[1].normalized_score).toBe(0);
    expect(worst.weighted_total).toBe(0);
  });

  it("gives the best tester 100", async () => {
    const r = await computeCategoryRankings(43, {});
    const best = r.athletes.find(a => a.last_name === "Best");
    expect(best.session_scores[1].normalized_score).toBe(100);
    expect(best.weighted_total).toBe(100);
  });

  it("never counts the goalie toward the skater testing field size", async () => {
    const r = await computeCategoryRankings(43, {});
    expect(r.athletes).toHaveLength(2);
    expect(r.goalies).toHaveLength(1);
  });
});
