// The uploaded overall_rank number IS the rank -- it already encodes proper
// competition ("1224") ranking, ties included. Real EFHA U13 data runs
// ...23, 24, 24, 26, 27... -- two testers tied at 24, and the sheet already
// skips to 26, not 25. An earlier version of this code instead re-derived a
// "dense" rank from relative sort order, which closed every one of those
// intentional skip-gaps -- fine for a single isolated tie, but it compounds:
// five scattered ties earlier in a 101-person field ate five slots, and the
// two testers actually tied for 100th (Alyssa Dombroski, Matilda Janzen,
// EFHA U13) scored 6 instead of what "tied for 100th of 101" should mean.
//
// The only real problem was ever field size, not rank. Real incident: EFHA
// U11 Community's testing upload had 124 rows but 1 failed to match an
// athlete, so only 123 rows landed in testing_drill_results. fieldSize (a
// count of MATCHED rows) came out to 123, but the bottom testers still
// carried their original sheet's overall_rank of 123 and 124 --
// testingPercentile(124, 123) went negative because rank > fieldSize. Fixed
// at the root instead: field size is the larger of the matched-row count and
// the highest overall_rank actually observed.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/categoryEvaluators", () => ({ getCoachUserIds: vi.fn(async () => []) }));

const { default: sql } = await import("@/lib/db");
const { computeCategoryRankings } = await import("@/lib/rankings");

const ATHLETES = [
  { id: 1, first_name: "A1", last_name: "L1", position: "forward" },
  { id: 2, first_name: "A2", last_name: "L2", position: "forward" },
  { id: 3, first_name: "A3", last_name: "L3", position: "forward" },
  { id: 4, first_name: "A4", last_name: "L4", position: "forward" },
  { id: 5, first_name: "A5", last_name: "L5", position: "forward" },
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
const pct = (rank, total) => ((total - rank) / (total - 1)) * 100;

describe("testing percentile trusts the sheet's own competition ranking", () => {
  it("never goes negative when a row was dropped for not matching an athlete", async () => {
    // Original sheet numbered 1-5; athlete_id 4 never matched, so only 4 rows
    // made it in, carrying overall_rank 1, 2, 3, 5 -- a gap at 4. True field
    // size is 5 (the highest rank observed), not 4 (the matched-row count).
    const testingRanks = [
      { athlete_id: 1, session_number: 1, overall_rank: 1 },
      { athlete_id: 2, session_number: 1, overall_rank: 2 },
      { athlete_id: 3, session_number: 1, overall_rank: 3 },
      { athlete_id: 5, session_number: 1, overall_rank: 5 },
    ];
    mockRankings(testingRanks);
    const r = await computeCategoryRankings(95, {});

    const last = r.athletes.find(a => a.id === 5);
    expect(last.weighted_total).toBe(0); // testingPercentile(5, 5) = 0, not negative
    expect(last.session_scores?.[1]?.overall_rank).toBe(5);
  });

  it("gives two athletes tied on the sheet the exact same score", async () => {
    // Real incident: EFHA U13, Alyssa Dombroski and Matilda Janzen both tied
    // at overall_rank 100 on the uploaded sheet.
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
    expect(tiedA.session_scores?.[1]?.overall_rank).toBe(2);
    expect(tiedB.session_scores?.[1]?.overall_rank).toBe(2);
    // fieldSize = 4 (matches the count here). Tied pair at rank 2 of 4.
    expect(tiedA.weighted_total).toBeCloseTo(pct(2, 4), 1);
  });

  it("does NOT compress the skip-gap after a tie -- the actual bug this was fixing", async () => {
    // Sheet already reads 1, 2, 2, 4, 5 -- a real competition sheet skips 3
    // after the two-way tie at 2. A dense re-rank would wrongly renumber this
    // as 1, 2, 2, 3, 4 (collapsing the intentional gap), giving the last two
    // testers a materially better score than they actually earned.
    const testingRanks = [
      { athlete_id: 1, session_number: 1, overall_rank: 1 },
      { athlete_id: 2, session_number: 1, overall_rank: 2 },
      { athlete_id: 3, session_number: 1, overall_rank: 2 },
      { athlete_id: 4, session_number: 1, overall_rank: 4 },
      { athlete_id: 5, session_number: 1, overall_rank: 5 },
    ];
    mockRankings(testingRanks);
    const r = await computeCategoryRankings(95, {});

    const fourth = r.athletes.find(a => a.id === 4);
    const fifth = r.athletes.find(a => a.id === 5);
    // Correct: testingPercentile(4, 5) = 25, testingPercentile(5, 5) = 0.
    // Wrong (dense-collapsed): would read as testingPercentile(3, 5) = 50
    // and testingPercentile(4, 5) = 25 instead -- one full slot too generous.
    expect(fourth.weighted_total).toBeCloseTo(pct(4, 5), 1);
    expect(fifth.weighted_total).toBeCloseTo(pct(5, 5), 1);
  });

  it("handles a tie that lands ON the sheet's own last rank number", async () => {
    // Two testers tied for 100th out of a 101-person field -- nobody
    // separately holds 101st, so the highest rank NUMBER observed is only
    // 100 even though 101 people actually tested. Field size must come from
    // the row COUNT here, not the max rank, or these two would be scored as
    // if the field were only 100 people.
    const ranks = [];
    for (let i = 1; i <= 99; i++) ranks.push({ athlete_id: 100 + i, session_number: 1, overall_rank: i });
    ranks.push({ athlete_id: 1, session_number: 1, overall_rank: 100 });
    ranks.push({ athlete_id: 2, session_number: 1, overall_rank: 100 });
    const athletes = ranks.map(r => ({ id: r.athlete_id, first_name: `A${r.athlete_id}`, last_name: "L", position: "forward" }));
    sql.mockReset();
    sql
      .mockResolvedValueOnce([{ session_number: 1, session_type: "scrimmage", weight_percentage: 100 }])
      .mockResolvedValueOnce([{ id: 95, scoring_scale: 10, eval_format: "standard" }])
      .mockResolvedValueOnce(athletes)
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: ranks.length }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(ranks);
    const r = await computeCategoryRankings(95, {});

    const tiedA = r.athletes.find(a => a.id === 1);
    const tiedB = r.athletes.find(a => a.id === 2);
    expect(tiedA.weighted_total).toBe(tiedB.weighted_total);
    // fieldSize = 101 (row count), not 100 (max observed rank).
    expect(tiedA.weighted_total).toBeCloseTo(pct(100, 101), 1);
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
