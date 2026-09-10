// Real incident: EFHA U11 Community's testing upload had 124 rows but 1
// failed to match an athlete, so only 123 rows landed in
// testing_drill_results. fieldSize (a count of MATCHED rows) came out to
// 123, but the bottom testers still carried their original sheet's
// overall_rank of 123 and 124 -- testingPercentile(124, 123) went negative
// because rank > fieldSize. Dense-ranking within each session by relative
// order (lib/rankings.js) keeps the real finish order intact while
// guaranteeing rank never exceeds fieldSize, regardless of gaps.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/categoryEvaluators", () => ({ getCoachUserIds: vi.fn(async () => []) }));

const { default: sql } = await import("@/lib/db");
const { computeCategoryRankings } = await import("@/lib/rankings");

const ATHLETES = [
  { id: 1, first_name: "A1", last_name: "L1", position: "forward" },
  { id: 2, first_name: "A2", last_name: "L2", position: "forward" },
  { id: 3, first_name: "A3", last_name: "L3", position: "forward" },
  { id: 5, first_name: "A5", last_name: "L5", position: "forward" }, // id 4 skipped in the upload
];

function mockRankings(testingRanks) {
  sql.mockReset();
  sql
    .mockResolvedValueOnce([{ session_number: 1, session_type: "scrimmage", weight_percentage: 100 }]) // sessions
    .mockResolvedValueOnce([{ id: 95, scoring_scale: 10, eval_format: "standard" }])                    // category
    .mockResolvedValueOnce(ATHLETES)                                                                    // athletes
    .mockResolvedValueOnce([{ count: 0 }])                                                              // category_scores count
    .mockResolvedValueOnce([{ count: testingRanks.length }])                                            // testing_drill_results count
    .mockResolvedValueOnce([])                                                                          // allEvalScores
    .mockResolvedValueOnce(testingRanks);                                                                // testingRanks
}

describe("testing percentile never goes negative when a row was skipped", () => {
  it("dense-ranks matched rows instead of trusting the sheet's original numbering", async () => {
    // Original sheet numbered 1-5; athlete_id 4 never matched, so only 4 rows
    // made it in, carrying overall_rank 1, 2, 3, 5 -- a gap at 4.
    const testingRanks = [
      { athlete_id: 1, session_number: 1, overall_rank: 1 },
      { athlete_id: 2, session_number: 1, overall_rank: 2 },
      { athlete_id: 3, session_number: 1, overall_rank: 3 },
      { athlete_id: 5, session_number: 1, overall_rank: 5 },
    ];
    mockRankings(testingRanks);
    const r = await computeCategoryRankings(95, {});

    const last = r.athletes.find(a => a.id === 5);
    expect(last.weighted_total).toBeGreaterThanOrEqual(0);
    expect(last.weighted_total).not.toBeLessThan(0);
    // Densely ranked 4th of 4 -> testingPercentile(4, 4) = 0, not negative.
    expect(last.weighted_total).toBe(0);

    // The uploaded sheet's original rank number is still preserved for display.
    expect(last.session_scores?.[1]?.overall_rank).toBe(5);
  });

  it("gives two athletes who tied on the sheet the SAME score, not consecutive ranks", async () => {
    // Real incident: EFHA U13, Alyssa Dombroski and Matilda Janzen both tied
    // at overall_rank 100 (out of 101) on the uploaded sheet. Array.sort is
    // stable, so the tie's relative order here is arbitrary (whatever SQL
    // happened to return) -- assigning dense rank by array position instead
    // of by the actual tied value gave them different scores (0.1 and 0)
    // despite being a genuine tie.
    const testingRanks = [
      { athlete_id: 1, session_number: 1, overall_rank: 1 },
      { athlete_id: 2, session_number: 1, overall_rank: 2 },
      { athlete_id: 3, session_number: 1, overall_rank: 2 }, // tied with athlete 2
      { athlete_id: 5, session_number: 1, overall_rank: 4 },
    ];
    mockRankings(testingRanks);
    const r = await computeCategoryRankings(95, {});

    const tiedA = r.athletes.find(a => a.id === 2);
    const tiedB = r.athletes.find(a => a.id === 3);
    expect(tiedA.weighted_total).toBe(tiedB.weighted_total);
    // Both still show their real uploaded rank for display, just scored equally.
    expect(tiedA.session_scores?.[1]?.overall_rank).toBe(2);
    expect(tiedB.session_scores?.[1]?.overall_rank).toBe(2);

    // Dense rank still advances correctly for whoever comes after the tie --
    // testingPercentile(3, 4), not testingPercentile(4, 4).
    const last = r.athletes.find(a => a.id === 5);
    expect(last.weighted_total).toBeCloseTo(((4 - 3) / (4 - 1)) * 100, 1);
  });

  it("still ranks 1st place at 100 and keeps relative order intact", async () => {
    const testingRanks = [
      { athlete_id: 1, session_number: 1, overall_rank: 1 },
      { athlete_id: 2, session_number: 1, overall_rank: 2 },
      { athlete_id: 3, session_number: 1, overall_rank: 3 },
      { athlete_id: 5, session_number: 1, overall_rank: 5 },
    ];
    mockRankings(testingRanks);
    const r = await computeCategoryRankings(95, {});
    const first = r.athletes.find(a => a.id === 1);
    expect(first.weighted_total).toBe(100);
    expect(r.athletes.map(a => a.id)).toEqual(
      [...r.athletes].sort((a, b) => b.weighted_total - a.weighted_total).map(a => a.id)
    );
  });
});
