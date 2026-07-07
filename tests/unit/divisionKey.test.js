import { describe, it, expect } from "vitest";
import { canonicalDivision, normAge, normTier } from "../../src/lib/divisionKey.js";

const key = (o) => canonicalDivision(o)?.key;

describe("normAge", () => {
  it("parses common age forms", () => {
    expect(normAge("U11")).toBe("U11");
    expect(normAge("u-9")).toBe("U9");
    expect(normAge("Under 13")).toBe("U13");
    expect(normAge("U11 AA TEAM 1")).toBe("U11");
  });
  it("returns null when absent", () => expect(normAge("Practice")).toBe(null));
});

describe("canonicalDivision — real messy labels", () => {
  it("AA / AAA / A never collapse (the load-bearing rule)", () => {
    expect(key({ label: "U11 AA TEAM 1" })).toBe("U11 AA");
    expect(key({ label: "U11 AAA" })).toBe("U11 AAA");
    expect(key({ ageGroup: "U11", division: "A" })).toBe("U11 A");
    expect(key({ label: "U11 AA TEAM 1" })).not.toBe(key({ label: "U11 AAA" }));
  });

  it("matchup halves resolve to one key", () => {
    expect(key({ label: "U13 AA TEAM 1 // U13 AA TEAM 2" })).toBe("U13 AA");
    expect(key({ label: "U11 AA TEAM 1 // U11 AATEAM 3" })).toBe("U11 AA");
  });

  it("House divisions", () => {
    expect(key({ label: "U13 HOUSE TEAM 1" })).toBe("U13 House");
    expect(key({ label: "U18 HOUSE TEAM 1BC" })).toBe("U18 House");
    expect(key({ ageGroup: "U15", division: "House" })).toBe("U15 House");
  });

  it("session-type rows with no tier resolve to just the age", () => {
    expect(key({ label: "U9 TIME TRIALS GROUP 1" })).toBe("U9");
    expect(key({ label: "U11 TIME TRIALS GROUP 2" })).toBe("U11");
    expect(key({ ageGroup: "U9", division: "" })).toBe("U9");
  });

  it("AI-normalized {age_group, division} inputs", () => {
    expect(key({ ageGroup: "U11", division: "AA" })).toBe("U11 AA");
    expect(key({ ageGroup: "U13", division: "AAA" })).toBe("U13 AAA");
  });

  it("roster division column that includes the age", () => {
    expect(key({ label: "U13 AA", division: "U13 AA" })).toBe("U13 AA");
  });

  it("named (non-standard) divisions are kept, distinct", () => {
    const k = key({ ageGroup: "U11", division: "JR KINGS" });
    expect(k).toBe("U11 Jr Kings");
    expect(k).not.toBe("U11");
  });

  it("no age → null (can't form a category)", () => {
    expect(canonicalDivision({ label: "Goalie PreSkate" })).toBe(null);
  });

  it("schedule and roster forms of the same division align", () => {
    const fromSchedule = key({ label: "U11 AA TEAM 1", ageGroup: "U11", division: "AA" });
    const fromRoster = key({ division: "U11 AA", label: "U11 AA" });
    expect(fromSchedule).toBe(fromRoster);
    expect(fromSchedule).toBe("U11 AA");
  });
});
