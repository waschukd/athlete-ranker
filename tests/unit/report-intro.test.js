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
    // U11's copy may reference U9 as the PRIOR stage the player came from --
    // that's legitimate context, not a claim the player is in both brackets
    // at once (the actual bug: "entering U9/U7 hockey" as one combined claim).
    expect(u9).not.toMatch(/entering U9\/U\d+/i);
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
});
