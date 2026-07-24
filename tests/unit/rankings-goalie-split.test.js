// Goalies must never appear in the skater ranking — they're a separate pool.
//
// Regression: when a category had no scores yet, the pre-scores fallback lumped
// every athlete into `athletes` ranked 1..N, so a goalie showed a SKATER rank on
// the group-making page (Ruby Flynn, alphabetically 4th, ranked #4 among
// skaters). The scored path already split them; the fallback didn't.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/categoryEvaluators", () => ({ getCoachUserIds: vi.fn(async () => []) }));

const { default: sql } = await import("@/lib/db");
const { computeCategoryRankings } = await import("@/lib/rankings");

// The five queries the no-scores branch runs, in order:
// sessions, category, athletes, category_scores count, testing count.
function mockNoScores(athletes) {
  sql.mockReset();
  sql
    .mockResolvedValueOnce([{ session_number: 1, session_type: "scrimmage" }]) // sessions
    .mockResolvedValueOnce([{ id: 76, scoring_scale: 10 }])                    // category
    .mockResolvedValueOnce(athletes)                                           // athletes
    .mockResolvedValueOnce([{ count: 0 }])                                     // category_scores
    .mockResolvedValueOnce([{ count: 0 }]);                                    // testing_drill_results
}

const CAT_76 = [
  { id: 1, first_name: "Ella", last_name: "Boyd", position: "forward" },
  { id: 2, first_name: "Mia", last_name: "Chan", position: "forward" },
  { id: 3, first_name: "Olivia", last_name: "Doyle", position: "defense" },
  { id: 4, first_name: "Ruby", last_name: "Flynn", position: "goalie" },
  { id: 5, first_name: "Isla", last_name: "Fraser", position: "forward" },
];

describe("no-scores ranking keeps goalies out of the skater pool", () => {
  beforeEach(() => mockNoScores(CAT_76));

  it("returns no goalie in the athletes list", async () => {
    const r = await computeCategoryRankings(76, {});
    expect(r.has_scores).toBe(false);
    expect(r.athletes.some(a => a.position === "goalie")).toBe(false);
  });

  it("puts the goalie in its own pool, ranked from 1", async () => {
    const r = await computeCategoryRankings(76, {});
    expect(r.goalies).toHaveLength(1);
    expect(r.goalies[0].last_name).toBe("Flynn");
    expect(r.goalies[0].rank).toBe(1);
  });

  it("re-ranks skaters 1..N with the goalie removed", async () => {
    // Ruby Flynn was alphabetically 4th. With her gone, Isla Fraser is skater #4,
    // and ranks are contiguous 1..4 with no gap where the goalie was.
    const r = await computeCategoryRankings(76, {});
    expect(r.athletes.map(a => a.rank)).toEqual([1, 2, 3, 4]);
    expect(r.athletes.find(a => a.rank === 4).last_name).toBe("Fraser");
  });

  it("handles a category with no goalies (empty pool, all skaters ranked)", async () => {
    mockNoScores(CAT_76.filter(a => a.position !== "goalie"));
    const r = await computeCategoryRankings(76, {});
    expect(r.goalies).toEqual([]);
    expect(r.athletes).toHaveLength(4);
  });
});
