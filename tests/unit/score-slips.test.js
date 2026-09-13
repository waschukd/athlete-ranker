import { describe, it, expect } from "vitest";
import { detectSlips, snapToIncrement } from "@/lib/scoreSlips";

// Brad gave Olivia Hennessey 7, 7, 7.5 and 0.5. That 0.5 is a slipped finger,
// not an opinion. The detector has to find it from the evaluator's OWN other
// scores for the same kid -- and must never flag a panel that genuinely
// scored someone low, or an evaluator who genuinely rates one skill weak.

const row = (id, ev, ath, cat, score, over = {}) =>
  ({ id, evaluator_id: ev, athlete_id: ath, age_category_id: 1, session_number: 1, scoring_category_id: cat, score, ...over });

describe("detectSlips", () => {
  it("flags Brad's 0.5 next to 7, 7, 7.5", () => {
    const rows = [row(1, 10, 500, 1, 7), row(2, 10, 500, 2, 7), row(3, 10, 500, 3, 7.5), row(4, 10, 500, 4, 0.5)];
    const s = detectSlips(rows, { scale: 10, increment: 0.5 });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ score_id: 4, evaluator_id: 10, athlete_id: 500, scoring_category_id: 4, original: 0.5, suggested: 7 });
    expect(s[0].reason).toMatch(/0\.5 beside 7, 7, 7\.5/);
  });

  it("does not flag a genuine weak area -- a 3 beside 7s is an opinion", () => {
    const rows = [row(1, 10, 500, 1, 7), row(2, 10, 500, 2, 7), row(3, 10, 500, 3, 7.5), row(4, 10, 500, 4, 3)];
    expect(detectSlips(rows)).toHaveLength(0);
  });

  it("does not flag a kid the evaluator scored low across the board", () => {
    const rows = [row(1, 10, 500, 1, 2), row(2, 10, 500, 2, 1.5), row(3, 10, 500, 3, 2), row(4, 10, 500, 4, 1)];
    expect(detectSlips(rows)).toHaveLength(0);
  });

  it("needs at least three other criteria to judge against", () => {
    const rows = [row(1, 10, 500, 1, 7), row(2, 10, 500, 2, 7), row(3, 10, 500, 3, 0.5)];
    expect(detectSlips(rows)).toHaveLength(0);
  });

  it("never compares across evaluators", () => {
    // Evaluator 10 gave 7s; evaluator 11 gave a 1 on one criterion and nothing
    // else. 11's single score cannot be judged against 10's.
    const rows = [row(1, 10, 500, 1, 7), row(2, 10, 500, 2, 7), row(3, 10, 500, 3, 7), row(4, 11, 500, 4, 1)];
    expect(detectSlips(rows)).toHaveLength(0);
  });

  it("never compares across sessions or athletes", () => {
    const rows = [
      row(1, 10, 500, 1, 7), row(2, 10, 500, 2, 7), row(3, 10, 500, 3, 7),
      row(4, 10, 500, 4, 0.5, { session_number: 2 }),   // a different session
      row(5, 10, 501, 4, 0.5),                            // a different kid
    ];
    expect(detectSlips(rows)).toHaveLength(0);
  });

  it("scales the gap with the category's scale", () => {
    // On a 5-point scale a 0.5 beside 3.5s is the same slip as 1 beside 7s.
    const rows = [row(1, 10, 500, 1, 3.5), row(2, 10, 500, 2, 3.5), row(3, 10, 500, 3, 4), row(4, 10, 500, 4, 0.5)];
    const s = detectSlips(rows, { scale: 5, increment: 0.5 });
    expect(s).toHaveLength(1);
    expect(s[0].suggested).toBe(3.5);
  });

  it("suggests the median of the others, snapped to the increment", () => {
    const rows = [row(1, 10, 500, 1, 6), row(2, 10, 500, 2, 8), row(3, 10, 500, 3, 7.5), row(4, 10, 500, 4, 0.5)];
    expect(detectSlips(rows, { increment: 1 })[0].suggested).toBe(8);   // median 7.5 -> 8 on whole increments
    expect(detectSlips(rows, { increment: 0.5 })[0].suggested).toBe(7.5);
  });

  it("can flag more than one slip for the same evaluator on different kids", () => {
    const rows = [
      row(1, 10, 500, 1, 7), row(2, 10, 500, 2, 7), row(3, 10, 500, 3, 7), row(4, 10, 500, 4, 0.5),
      row(5, 10, 501, 1, 8), row(6, 10, 501, 2, 8), row(7, 10, 501, 3, 8.5), row(8, 10, 501, 4, 1),
    ];
    expect(detectSlips(rows).map(s => s.score_id).sort()).toEqual([4, 8]);
  });
});

describe("snapToIncrement", () => {
  it("rounds to the category's increment and clamps to the scale", () => {
    expect(snapToIncrement(7.4, 0.5, 10)).toBe(7.5);
    expect(snapToIncrement(7.24, 0.5, 10)).toBe(7);
    expect(snapToIncrement(11, 1, 10)).toBe(10);
    expect(snapToIncrement(-1, 1, 10)).toBe(0);
  });
});
