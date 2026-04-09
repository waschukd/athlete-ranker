import { describe, it, expect } from "vitest";
import {
  findBestCategoryMatch,
  extractCandidates,
  buildAliasLookup,
  normalizeForMatch,
} from "@/lib/voiceMatch";

describe("normalizeForMatch", () => {
  it("lowercases and replaces slashes with spaces", () => {
    expect(normalizeForMatch("Effort/Compete")).toBe("effort compete");
  });
  it("strips punctuation", () => {
    expect(normalizeForMatch("Hockey I.Q.")).toBe("hockey iq");
  });
  it("collapses multiple spaces", () => {
    expect(normalizeForMatch("Puck   Skills")).toBe("puck skills");
  });
});

describe("buildAliasLookup", () => {
  it("builds reverse map from category names to aliases", () => {
    const lookup = buildAliasLookup(["Effort/Compete", "Puck Skills", "Skating"]);
    expect(lookup["afford compete"]).toBe("Effort/Compete");
    expect(lookup["puck skill"]).toBe("Puck Skills");
    expect(lookup["skading"]).toBe("Skating");
  });
  it("self-maps normalized names", () => {
    const lookup = buildAliasLookup(["Skating"]);
    expect(lookup["skating"]).toBe("Skating");
  });
  it("handles unknown categories without error", () => {
    const lookup = buildAliasLookup(["Custom Category 123"]);
    expect(lookup["custom category 123"]).toBe("Custom Category 123");
  });
});

describe("findBestCategoryMatch", () => {
  const cats = [
    { name: "Skating" },
    { name: "Puck Skills" },
    { name: "Effort/Compete" },
    { name: "Hockey IQ" },
  ];
  const lookup = buildAliasLookup(cats.map(c => c.name));

  it("exact match returns confidence 1.0", () => {
    const result = findBestCategoryMatch("skating", cats, lookup);
    expect(result).not.toBeNull();
    expect(result.match).toBe("Skating");
    expect(result.confidence).toBe(1.0);
    expect(result.method).toBe("exact");
  });

  it("alias match returns confidence 0.95", () => {
    const result = findBestCategoryMatch("afford compete", cats, lookup);
    expect(result).not.toBeNull();
    expect(result.match).toBe("Effort/Compete");
    expect(result.confidence).toBe(0.95);
    expect(result.method).toBe("alias");
  });

  it("puck skill (singular) matches Puck Skills via alias", () => {
    const result = findBestCategoryMatch("puck skill", cats, lookup);
    expect(result).not.toBeNull();
    expect(result.match).toBe("Puck Skills");
  });

  it("fuzzy match for close misspelling", () => {
    const result = findBestCategoryMatch("skading", cats, lookup);
    expect(result).not.toBeNull();
    expect(result.match).toBe("Skating");
  });

  it("returns null for gibberish", () => {
    const result = findBestCategoryMatch("xyzzy foobar", cats, lookup);
    expect(result).toBeNull();
  });

  it("first word exact match works", () => {
    const result = findBestCategoryMatch("effort", cats, lookup);
    expect(result).not.toBeNull();
    expect(result.match).toBe("Effort/Compete");
  });

  it("handles empty phrase", () => {
    const result = findBestCategoryMatch("", cats, lookup);
    expect(result).toBeNull();
  });
});

describe("extractCandidates", () => {
  it("extracts single category + score", () => {
    const result = extractCandidates("skating 8");
    expect(result).toEqual([{ phrase: "skating", value: 8 }]);
  });

  it("extracts multiple categories + scores", () => {
    const result = extractCandidates("skating 8 puck skills 7");
    expect(result).toEqual([
      { phrase: "skating", value: 8 },
      { phrase: "puck skills", value: 7 },
    ]);
  });

  it("handles decimal scores", () => {
    const result = extractCandidates("skating 7.5");
    expect(result).toEqual([{ phrase: "skating", value: 7.5 }]);
  });

  it("ignores trailing words with no number", () => {
    const result = extractCandidates("skating 8 notes");
    expect(result).toEqual([{ phrase: "skating", value: 8 }]);
  });

  it("handles empty string", () => {
    const result = extractCandidates("");
    expect(result).toEqual([]);
  });
});
