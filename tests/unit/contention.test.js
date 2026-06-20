import { describe, it, expect } from "vitest";
import { analyzeContention, normalizeTargets, estimateMovementSd } from "../../src/lib/contention.js";

// Build a ranking-shaped fixture: N athletes, 2 scored sessions + 1 remaining.
// Athlete i has a stable level so ranks are well separated except near the cut line.
function makeRanking({ n = 30, levels, remainingWeight = 33 }) {
  const sessions = [
    { session_number: 2, weight_percentage: 33 },
    { session_number: 3, weight_percentage: 34 },
    { session_number: 4, weight_percentage: remainingWeight }, // remaining (not in completed)
  ];
  const athletes = Array.from({ length: n }, (_, i) => {
    const lvl = levels ? levels(i) : 90 - i * 2; // descending, well-separated
    return {
      id: i + 1, first_name: `A${i}`, last_name: `L${String(i).padStart(2, "0")}`, position: "forward",
      rank: i + 1, weighted_total: lvl,
      session_scores: {
        2: { normalized_score: lvl, weight: 33 },
        3: { normalized_score: lvl, weight: 34 },
      },
    };
  });
  return { athletes, sessions, completed_sessions: [2, 3] };
}

describe("normalizeTargets", () => {
  it("accepts a single number", () => {
    expect(normalizeTargets(17)).toEqual([{ name: "Roster", size: 17 }]);
  });
  it("accepts tier objects and drops non-positive", () => {
    expect(normalizeTargets([{ name: "AA", size: 17 }, { name: "A", size: 0 }])).toEqual([{ name: "AA", size: 17 }]);
  });
  it("accepts an array of numbers", () => {
    expect(normalizeTargets([17, 15])).toEqual([{ name: "Tier 1", size: 17 }, { name: "Tier 2", size: 15 }]);
  });
});

describe("estimateMovementSd", () => {
  it("returns a default when there's not enough data", () => {
    expect(estimateMovementSd([{ session_scores: { 2: { normalized_score: 70 } } }], [{ session_number: 2 }])).toBe(8);
  });
  it("measures within-athlete spread", () => {
    const sessions = [{ session_number: 2 }, { session_number: 3 }];
    const athletes = [
      { session_scores: { 2: { normalized_score: 60 }, 3: { normalized_score: 80 } } },
      { session_scores: { 2: { normalized_score: 50 }, 3: { normalized_score: 70 } } },
    ];
    expect(estimateMovementSd(athletes, sessions)).toBeGreaterThan(0);
  });
});

describe("analyzeContention", () => {
  it("reports not-ready without roster targets", () => {
    const r = analyzeContention(makeRanking({ n: 10 }), { rosterTargets: null });
    expect(r.dataReady).toBe(false);
    expect(r.reason).toBe("no_roster_targets");
  });

  it("reports not-ready when no session remains", () => {
    const ranking = makeRanking({ n: 10 });
    ranking.completed_sessions = [2, 3, 4];
    const r = analyzeContention(ranking, { rosterTargets: 5 });
    expect(r.dataReady).toBe(false);
    expect(r.reason).toBe("no_remaining_sessions");
  });

  it("locks the clear top, eliminates the clear bottom, leaves the cut-line bubble", () => {
    // 30 players, cut line at 15. Wide separation except a tight cluster around 14-17.
    const ranking = makeRanking({
      n: 30,
      levels: (i) => {
        if (i < 12) return 95 - i;            // clear top: 95..84
        if (i >= 19) return 40 - (i - 19);    // clear bottom: 40..29
        return 70 - (i - 12) * 0.4;           // tight bubble 12..18 around the line
      },
    });
    const r = analyzeContention(ranking, { rosterTargets: 15, runs: 3000, movementSd: 6 });
    expect(r.dataReady).toBe(true);

    const byId = Object.fromEntries(r.players.map(p => [p.id, p]));
    expect(byId[1].status).toBe("locked");    // top player
    expect(byId[30].status).toBe("out");      // bottom player
    // someone right at the line should be a bubble (must play)
    const nearLine = r.players.filter(p => p.rank >= 13 && p.rank <= 17);
    expect(nearLine.some(p => p.status === "bubble")).toBe(true);
    // recommended sits = locked + out, must-play = bubble, partition is complete
    expect(r.recommended_sits.length + r.must_play.length).toBe(30);
    expect(r.counts.locked + r.counts.bubble + r.counts.out).toBe(30);
  });

  it("is deterministic for the same input", () => {
    const a = analyzeContention(makeRanking({ n: 20 }), { rosterTargets: 10, runs: 1000 });
    const b = analyzeContention(makeRanking({ n: 20 }), { rosterTargets: 10, runs: 1000 });
    expect(a.recommended_sits).toEqual(b.recommended_sits);
  });

  it("supports multi-tier targets", () => {
    const r = analyzeContention(makeRanking({ n: 30 }), { rosterTargets: [{ name: "AA", size: 10 }, { name: "A", size: 10 }], runs: 1000 });
    expect(r.lines.map(l => l.at)).toEqual([10, 20]);
    expect(r.total_kept).toBe(20);
  });
});
