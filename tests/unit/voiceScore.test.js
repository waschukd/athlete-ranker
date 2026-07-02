import { describe, it, expect } from "vitest";
import { parseScoreCommands, firstNumber } from "../../src/lib/voiceScore.js";

const P = (t, opts) => parseScoreCommands(t, opts);
const map = (t, opts) => Object.fromEntries(P(t, opts).map(r => [r.categoryId, r.score]));

describe("firstNumber", () => {
  it("digit forms", () => { expect(firstNumber("4")).toBe(4); expect(firstNumber("4.5")).toBe(4.5); });
  it("spelled integers", () => { expect(firstNumber("three")).toBe(3); expect(firstNumber("ten")).toBe(10); });
  it("spelled decimals", () => { expect(firstNumber("four point five")).toBe(4.5); });
  it("half-points", () => { expect(firstNumber("two and a half")).toBe(2.5); expect(firstNumber("three a half")).toBe(3.5); });
  it("returns null when none", () => { expect(firstNumber("skating")).toBe(null); });
});

describe("parseScoreCommands", () => {
  it("parses a single spoken decimal command", () => {
    expect(map("skating four point five")).toEqual({ skating: 4.5 });
  });

  it("parses multiple commands in one utterance", () => {
    expect(map("skating four point five puck skills three hockey iq two and a half compete six"))
      .toEqual({ skating: 4.5, puck: 3, iq: 2.5, compete: 6 });
  });

  it("parses digit forms with punctuation", () => {
    expect(map("Skating 4.5, Puck Skills 3.")).toEqual({ skating: 4.5, puck: 3 });
  });

  it("longest category alias wins (puck skills beats puck)", () => {
    const r = P("puck skills seven");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ categoryId: "puck", score: 7 });
  });

  it("last mention of a category wins (correction)", () => {
    expect(map("skating four no skating five")).toEqual({ skating: 5 });
  });

  it("flags out-of-range against the scale", () => {
    const r = P("skating twelve");
    expect(r[0]).toMatchObject({ categoryId: "skating", valid: false, reason: "out_of_range", raw: 12 });
  });

  it("snaps to the scoring increment", () => {
    // 4.3 → nearest 0.5 = 4.5
    expect(map("skating four point three")).toEqual({ skating: 4.5 });
  });

  it("flags a category said with no number", () => {
    const r = P("skating");
    expect(r[0]).toMatchObject({ categoryId: "skating", valid: false, reason: "no_number" });
  });

  it("returns results in category-definition order regardless of speech order", () => {
    const ids = P("compete six skating four").map(r => r.categoryId);
    expect(ids).toEqual(["skating", "compete"]);
  });

  it("tolerates a common IQ phrasing", () => {
    expect(map("hockey iq eight")).toEqual({ iq: 8 });
  });
});
