import { describe, it, expect } from "vitest";
import { checkNoteTone } from "@/lib/noteToneCheck";

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
