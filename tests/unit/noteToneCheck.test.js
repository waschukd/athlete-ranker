import { describe, it, expect } from "vitest";
import { checkNoteTone, looksIncomplete } from "@/lib/noteToneCheck";

describe("checkNoteTone", () => {
  it("flags clear profanity/harsh-tone words", () => {
    expect(checkNoteTone("he was so lazy out there").flagged).toBe(true);
    expect(checkNoteTone("terrible positioning tonight").flagged).toBe(true);
    expect(checkNoteTone("what a stupid play").flagged).toBe(true);
  });

  it("does not flag ordinary hockey vocabulary", () => {
    expect(checkNoteTone("good shot selection, strong on the puck").flagged).toBe(false);
    expect(checkNoteTone("needs to work on his stick handling and edges").flagged).toBe(false);
    expect(checkNoteTone("passed the puck well, great class of player").flagged).toBe(false);
  });

  it("handles empty/missing input", () => {
    expect(checkNoteTone("").flagged).toBe(false);
    expect(checkNoteTone(null).flagged).toBe(false);
    expect(checkNoteTone(undefined).flagged).toBe(false);
  });

  it("matches whole words only, not substrings", () => {
    // "hello" contains "hell" as a substring but isn't the word "hell".
    expect(checkNoteTone("hello there, nice game").flagged).toBe(false);
    // "assist" contains "ass" as a substring but isn't the word "ass".
    expect(checkNoteTone("great assist on the second goal").flagged).toBe(false);
  });
});

describe("looksIncomplete", () => {
  it("flags a note that trails off on a function word (real production examples)", () => {
    expect(looksIncomplete("skates hunched over when carrying the")).toBe(true);
    expect(looksIncomplete("knowing where to be positionally when teammates have the")).toBe(true);
  });

  it("does not flag a note that ends with real punctuation", () => {
    expect(looksIncomplete("great compete level, drills are done.")).toBe(false);
    expect(looksIncomplete("needs to work on his stride!")).toBe(false);
  });

  it("does not flag an ordinary complete note with no ending punctuation", () => {
    expect(looksIncomplete("good skater shifty left to right")).toBe(false);
    expect(looksIncomplete("Better job today knowing where puck was")).toBe(false);
  });

  it("does not flag a sentence ending on an object pronoun or common phrase (real production false positives)", () => {
    expect(looksIncomplete("awareness of where the puck is relative to her")).toBe(false);
    expect(looksIncomplete("some lack of awareness about who is around her")).toBe(false);
    expect(looksIncomplete("Needs compete consistency. Dominate all the time. Has the ability to do so")).toBe(false);
  });

  it("handles empty/missing input", () => {
    expect(looksIncomplete("")).toBe(false);
    expect(looksIncomplete(null)).toBe(false);
    expect(looksIncomplete(undefined)).toBe(false);
  });
});
