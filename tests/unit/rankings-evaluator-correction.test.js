// Real incident: BAHA U11/U13/U15 AA (round_robin format) rotates different
// evaluator panels across different nights -- one evaluator's raw average ran
// ~1-1.5 points above every other evaluator's, every night. Since a round_robin
// athlete's session score is just AVG(score) across whoever happened to score
// them, two equally-good players scored by different panels landed with very
// different numbers, which read to the association as "wild swings" that were
// really just "who was in the room." applyEvaluatorCorrection() in rankings.js
// re-centers each evaluator's raw scores to the category's own overall mean
// before they're blended into an athlete's session average.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/categoryEvaluators", () => ({ getCoachUserIds: vi.fn(async () => []) }));

const { default: sql } = await import("@/lib/db");
const { computeCategoryRankings } = await import("@/lib/rankings");

// 8 athletes, 2 scoring categories. "Hot" scores athletes 1-4 a flat 9 on both
// categories (8 rows -- meets the MIN_SCORES_FOR_EVALUATOR_CORRECTION floor).
// "Normal" scores athletes 5-8 a flat 5 on both (also 8 rows). Ground truth:
// both groups are equally good: the raw 9-vs-5 gap is pure evaluator generosity.
const ATHLETES = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1, first_name: `A${i + 1}`, last_name: `L${i + 1}`, position: "forward",
}));

function scoreRows() {
  const rows = [];
  for (let a = 1; a <= 4; a++) {
    for (const scoringCat of [1, 2]) {
      rows.push({ athlete_id: a, scoring_category_id: scoringCat, session_number: 1, evaluator_id: "hot", score: "9" });
    }
  }
  for (let a = 5; a <= 8; a++) {
    for (const scoringCat of [1, 2]) {
      rows.push({ athlete_id: a, scoring_category_id: scoringCat, session_number: 1, evaluator_id: "normal", score: "5" });
    }
  }
  return rows;
}

function mockRankings(evalFormat) {
  sql.mockReset();
  sql
    .mockResolvedValueOnce([{ session_number: 1, session_type: "scrimmage", weight_percentage: 100 }]) // sessions
    .mockResolvedValueOnce([{ id: 99, scoring_scale: 10, eval_format: evalFormat }])                    // category
    .mockResolvedValueOnce(ATHLETES)                                                                    // athletes
    .mockResolvedValueOnce([{ count: 16 }])                                                             // category_scores count
    .mockResolvedValueOnce([{ count: 0 }])                                                              // testing_drill_results count
    .mockResolvedValueOnce(scoreRows())                                                                 // allEvalScores
    .mockResolvedValueOnce([]);                                                                         // testingRanks
  // round_robin fetches session_groups/player_group_assignments to scope
  // per-session "complete" status to that session's actual roster.
  if (evalFormat === "round_robin") sql.mockResolvedValueOnce([]);
}

describe("evaluator score correction (round_robin only)", () => {
  it("equalizes two equally-good groups scored by a generous vs. a normal evaluator", async () => {
    mockRankings("round_robin");
    const r = await computeCategoryRankings(99, {});
    const hotSide = r.athletes.find(a => a.id === 1);
    const normalSide = r.athletes.find(a => a.id === 5);

    // Grand mean across all 16 rows is 7 -- "hot" (avg 9) gets a -2 correction,
    // "normal" (avg 5) gets a +2 correction, both land on 7/10 = 70.0.
    expect(hotSide.weighted_total).toBe(70);
    expect(normalSide.weighted_total).toBe(70);
    expect(r.scoring_info.evaluator_corrected).toBe(true);
  });

  it("leaves raw scores untouched for non-round_robin categories", async () => {
    mockRankings("standard");
    const r = await computeCategoryRankings(99, {});
    const hotSide = r.athletes.find(a => a.id === 1);
    const normalSide = r.athletes.find(a => a.id === 5);

    expect(hotSide.weighted_total).toBe(90);   // raw 9/10
    expect(normalSide.weighted_total).toBe(50); // raw 5/10
    expect(r.scoring_info.evaluator_corrected).toBe(false);
  });

  it("does not correct an evaluator with too few scores to trust the signal", async () => {
    sql.mockReset();
    const rows = [
      ...scoreRows(),
      // A 3rd evaluator with only 2 scores (well under the floor) who also
      // runs hot -- their raw scores should pass through uncorrected.
      { athlete_id: 1, scoring_category_id: 1, session_number: 1, evaluator_id: "oneoff", score: "10" },
      { athlete_id: 1, scoring_category_id: 2, session_number: 1, evaluator_id: "oneoff", score: "10" },
    ];
    sql
      .mockResolvedValueOnce([{ session_number: 1, session_type: "scrimmage", weight_percentage: 100 }])
      .mockResolvedValueOnce([{ id: 99, scoring_scale: 10, eval_format: "round_robin" }])
      .mockResolvedValueOnce(ATHLETES)
      .mockResolvedValueOnce([{ count: rows.length }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([])   // testingRanks
      .mockResolvedValueOnce([]);  // session_groups/player_group_assignments (round_robin only)

    const r = await computeCategoryRankings(99, {});
    // Athlete 1 was scored by both "hot" (corrected) and "oneoff" (uncorrected,
    // raw 10 passes through) -- confirm the oneoff row wasn't shifted by
    // checking the blended average moved up relative to the other hot-side
    // athletes who were NOT also scored by oneoff.
    const withOneoff = r.athletes.find(a => a.id === 1);
    const withoutOneoff = r.athletes.find(a => a.id === 2);
    expect(withOneoff.weighted_total).toBeGreaterThan(withoutOneoff.weighted_total);
  });
});
