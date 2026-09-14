import { describe, it, expect } from "vitest";
import { violatesSkatingContradiction, applyContradictionGuard } from "@/lib/noteContradictionGuard";

// Standing is relative to the GROUP AVERAGE, not the group's single best
// skater -- see the comment in noteContradictionGuard.js for why. Thresholds
// are deliberately tight (<=0.6 / >=1.6) -- see the "Real incident (2nd
// round)" comment there for why a looser bar produced too many false
// positives on real notes.
const bottomSkater = [{ name: "Skating", player: 3, group: 6 }]; // ratio 0.5 -> bottom
const topSkater = [{ name: "Skating", player: 8.8, group: 5 }]; // ratio 1.76 -> top
const middleSkater = [{ name: "Skating", player: 6, group: 6 }]; // ratio 1.0 -> middle

describe("violatesSkatingContradiction", () => {
  it("flags a positive skating comment on a bottom-ranked skater (Dan's example)", () => {
    expect(violatesSkatingContradiction("Good skater, moves well.", bottomSkater)).toBe(true);
  });

  it("flags a bare negative skating comment on a top-ranked skater", () => {
    expect(violatesSkatingContradiction("Weak skater, poor edges.", topSkater)).toBe(true);
  });

  it("does not flag a hedged/qualified comment, even if it would otherwise contradict", () => {
    // "needs to work on" is a hedge -- see the false-positive comment in
    // noteContradictionGuard.js for why bare claims only.
    expect(violatesSkatingContradiction("Weak skater, needs to work on edges.", topSkater)).toBe(false);
  });

  it("does not flag a positive skating comment on a top-ranked skater", () => {
    expect(violatesSkatingContradiction("Great skater, elite edges.", topSkater)).toBe(false);
  });

  it("does not flag a negative skating comment on a bottom-ranked skater", () => {
    expect(violatesSkatingContradiction("Weaker skater, work on first 3 strides.", bottomSkater)).toBe(false);
  });

  it("stays silent in the middle band either direction", () => {
    expect(violatesSkatingContradiction("Good skater.", middleSkater)).toBe(false);
    expect(violatesSkatingContradiction("Weak skater.", middleSkater)).toBe(false);
  });

  it("ignores notes with no skating claim at all", () => {
    expect(violatesSkatingContradiction("Good compete level, wins battles along the boards.", bottomSkater)).toBe(false);
  });

  it("never flags terse, non-evaluative skating notes", () => {
    expect(violatesSkatingContradiction("Skates tall, needs to get lower.", bottomSkater)).toBe(false);
  });

  it("passes through when there's no matching skill category or no player score yet", () => {
    expect(violatesSkatingContradiction("Good skater.", [])).toBe(false);
    expect(violatesSkatingContradiction("Good skater.", [{ name: "Skating", player: null, group: 6 }])).toBe(false);
  });
});

describe("applyContradictionGuard", () => {
  it("filters out only the contradicting note from a list", () => {
    const notes = [
      { session_number: 1, note_text: "Good skater, moves well." },
      { session_number: 2, note_text: "Weaker puck handling under pressure." },
    ];
    const result = applyContradictionGuard(notes, bottomSkater);
    expect(result).toHaveLength(1);
    expect(result[0].session_number).toBe(2);
  });
});
