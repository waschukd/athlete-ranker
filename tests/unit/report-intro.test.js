import { describe, it, expect } from "vitest";
import { getReportIntro } from "@/lib/reportIntro";

const REAL_BRACKETS = [9, 11, 13, 15, 16, 18, 20];

describe("getReportIntro", () => {
  it("returns a distinct paragraph for every real age bracket", () => {
    const results = REAL_BRACKETS.map(age => getReportIntro(`U${age}`, "Jordan"));
    const unique = new Set(results);
    expect(unique.size).toBe(REAL_BRACKETS.length);
    for (const r of results) expect(r).toContain("Jordan");
  });

  it("never combines or guesses across brackets from a tiered category name", () => {
    const u9 = getReportIntro("U9 House", "Jordan");
    const u11 = getReportIntro("U11 AA", "Jordan");
    expect(u9).not.toBe(u11);
    expect(u9).not.toMatch(/entering U9\/U\d+/i);
  });

  // Real feedback: U11's copy used to open with "U9 was about laying the
  // skating foundation" as context for the prior stage -- reasonable intent,
  // but confusing in practice (reads like the player was also in U9). No
  // bracket's copy should name any OTHER bracket at all.
  it("never mentions another age bracket inside any one bracket's own copy", () => {
    for (const age of REAL_BRACKETS) {
      const intro = getReportIntro(`U${age}`, "Jordan");
      for (const other of REAL_BRACKETS) {
        if (other === age) continue;
        expect(intro).not.toMatch(new RegExp(`\\bU${other}\\b`));
      }
    }
  });

  it("keys off the leading age number only, ignoring the skill-tier suffix", () => {
    expect(getReportIntro("U13 Tier 1", "Sam")).toBe(getReportIntro("U13 Community", "Sam"));
  });

  it("falls back to a generic, honest paragraph for an unrecognized bracket", () => {
    const r = getReportIntro("U7", "Sam");
    expect(r).toContain("Sam");
    expect(r.length).toBeGreaterThan(20);
  });

  it("handles a missing category name without throwing", () => {
    expect(() => getReportIntro(null, "Sam")).not.toThrow();
    expect(() => getReportIntro(undefined, undefined)).not.toThrow();
  });

  it("closes every bracket, and the fallback, with the same line", () => {
    const closing = "This report will address what was captured and seen throughout the evaluation.";
    for (const age of REAL_BRACKETS) expect(getReportIntro(`U${age}`, "Jordan")).toMatch(new RegExp(`${closing}$`));
    expect(getReportIntro("U7", "Jordan")).toMatch(new RegExp(`${closing}$`));
  });

  it("keeps U9 focused on love of the game and entry-level habits, not permanent habit-setting language", () => {
    const u9 = getReportIntro("U9", "Jordan");
    expect(u9).toMatch(/love (for|of) the game/i);
    expect(u9).not.toMatch(/habits.{0,20}set here|dramatically easier/i);
  });
});
