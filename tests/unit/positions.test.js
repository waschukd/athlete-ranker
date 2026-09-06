import { describe, it, expect } from "vitest";
import { isPos } from "@/lib/positions";

// Backs the evaluator's D/F/All filter. The trap is forward_defense: a hybrid
// filtered out of BOTH lists silently disappears from the roster an evaluator
// is scoring, and they would never know a player was missing.

describe("isPos", () => {
  it("matches forwards", () => {
    expect(isPos("forward", "forward")).toBe(true);
    expect(isPos("Forward", "forward")).toBe(true);
    expect(isPos("defense", "forward")).toBe(false);
  });

  it("matches defense, including the 'defence' spelling", () => {
    expect(isPos("defense", "defense")).toBe(true);
    expect(isPos("defence", "defense")).toBe(true);
    expect(isPos("D", "defense")).toBe(true);
    expect(isPos("forward", "defense")).toBe(false);
  });

  it("counts forward_defense as BOTH, so a hybrid never vanishes", () => {
    expect(isPos("forward_defense", "forward")).toBe(true);
    expect(isPos("forward_defense", "defense")).toBe(true);
  });

  it("'all' matches everyone, including players with no position", () => {
    for (const p of ["forward", "defense", "goalie", "forward_defense", "", null, undefined]) {
      expect(isPos(p, "all")).toBe(true);
    }
  });

  it("a player with no position recorded matches no specific filter", () => {
    // Better to be absent from D and F than to appear wrongly in one.
    expect(isPos("", "forward")).toBe(false);
    expect(isPos(null, "defense")).toBe(false);
    expect(isPos(undefined, "goalie")).toBe(false);
  });

  it("matches goalies", () => {
    expect(isPos("goalie", "goalie")).toBe(true);
    expect(isPos("G", "goalie")).toBe(true);
    expect(isPos("forward", "goalie")).toBe(false);
  });

  it("every player lands in F or D when the roster has no hybrids", () => {
    const roster = ["forward", "defense", "forward", "defense", "forward"];
    const f = roster.filter(p => isPos(p, "forward")).length;
    const d = roster.filter(p => isPos(p, "defense")).length;
    expect(f + d).toBe(roster.length);
  });
});
