import { describe, it, expect } from "vitest";
import { draftAssignments } from "@/lib/scrimmageTeams";

// The rule: the top-ranked defender and the top-ranked forward never end up on
// the same team.
//
// The old draft ran defense and forwards as ONE continuous snake, so with an odd
// number of defenders it turned back on itself at the D/F boundary and handed
// the same team both. EFHA's U13 came out that way -- #1 D and #1 forward
// together -- which is the opposite of what a snake draft is for.

const mk = (n, prefix) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, rank: i + 1 }));
const teamOf = (picks, id) => picks.find(p => p.athlete.id === id)?.teamIdx;
const sizes = (picks, T) => Array.from({ length: T }, (_, t) => picks.filter(p => p.teamIdx === t).length);

describe("top D and top forward are never on the same team", () => {
  // Odd D counts are the case that used to break; even ones must not regress.
  for (const d of [1, 2, 3, 5, 7, 8, 15]) {
    for (const f of [2, 5, 12, 20]) {
      it(`${d}D / ${f}F across 2 teams`, () => {
        const picks = draftAssignments(mk(d, "d"), mk(f, "f"), 2);
        expect(teamOf(picks, "d1")).not.toBe(teamOf(picks, "f1"));
      });
    }
  }

  it("holds for 3 and 4 teams too", () => {
    for (const T of [3, 4]) {
      for (const d of [3, 5, 15]) {
        const picks = draftAssignments(mk(d, "d"), mk(20, "f"), T);
        expect(teamOf(picks, "d1"), `${d}D across ${T} teams`).not.toBe(teamOf(picks, "f1"));
      }
    }
  });

  it("the exact EFHA U13 shape: 15D / 20F across 2 teams", () => {
    const picks = draftAssignments(mk(15, "d"), mk(20, "f"), 2);
    expect(teamOf(picks, "d1")).toBe(0);
    expect(teamOf(picks, "f1")).toBe(1);
  });
});

describe("rosters stay balanced", () => {
  it("never differs by more than one player per team", () => {
    for (const T of [2, 3, 4]) {
      for (const d of [0, 1, 7, 15]) {
        for (const f of [0, 5, 20, 33]) {
          const picks = draftAssignments(mk(d, "d"), mk(f, "f"), T);
          const s = sizes(picks, T);
          expect(Math.max(...s) - Math.min(...s), `${d}D/${f}F across ${T}`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it("15D / 20F across 2 teams splits 18/17", () => {
    const s = sizes(draftAssignments(mk(15, "d"), mk(20, "f"), 2), 2);
    expect(s.sort((a, b) => b - a)).toEqual([18, 17]);
  });

  it("places every player exactly once", () => {
    const picks = draftAssignments(mk(15, "d"), mk(20, "f"), 2);
    expect(picks).toHaveLength(35);
    expect(new Set(picks.map(p => p.athlete.id)).size).toBe(35);
  });

  it("spreads defense across teams rather than stacking it", () => {
    const picks = draftAssignments(mk(8, "d"), mk(20, "f"), 2);
    const dPerTeam = [0, 1].map(t => picks.filter(p => p.teamIdx === t && p.athlete.id.startsWith("d")).length);
    expect(Math.abs(dPerTeam[0] - dPerTeam[1])).toBeLessThanOrEqual(1);
  });
});

describe("edge cases", () => {
  it("no defense: forwards still start at team 0", () => {
    const picks = draftAssignments([], mk(6, "f"), 2);
    expect(teamOf(picks, "f1")).toBe(0);
    expect(sizes(picks, 2)).toEqual([3, 3]);
  });

  it("no forwards: defense drafts normally", () => {
    const picks = draftAssignments(mk(6, "d"), [], 2);
    expect(teamOf(picks, "d1")).toBe(0);
    expect(sizes(picks, 2)).toEqual([3, 3]);
  });

  it("empty roster and degenerate team counts do not throw", () => {
    expect(draftAssignments([], [], 2)).toEqual([]);
    expect(draftAssignments(mk(3, "d"), mk(3, "f"), 0)).toEqual([]);
    expect(() => draftAssignments(mk(3, "d"), mk(3, "f"), 1)).not.toThrow();
  });

  it("one team: everyone lands there, rule cannot apply", () => {
    const picks = draftAssignments(mk(2, "d"), mk(2, "f"), 1);
    expect(picks.every(p => p.teamIdx === 0)).toBe(true);
  });
});
