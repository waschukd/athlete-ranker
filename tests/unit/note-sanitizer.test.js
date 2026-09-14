import { describe, it, expect } from "vitest";
import { sanitizeNoteText, sanitizeNotes } from "@/lib/noteSanitizer";

describe("sanitizeNoteText", () => {
  it("passes clean hockey notes through untouched", () => {
    const r = sanitizeNoteText("Weaker skater, work on first 3 strides.");
    expect(r).toEqual({ text: "Weaker skater, work on first 3 strides.", dropped: false, flagged: false, reason: null });
  });

  it("never flags common hockey vocabulary that contains a flagged substring", () => {
    const r = sanitizeNoteText("Great assist on the shot, class player, needs to work on his stick handling.");
    expect(r.dropped).toBe(false);
    expect(r.flagged).toBe(false);
  });

  it("removes mild profanity but keeps the rest of the sentence (real production fix)", () => {
    const r = sanitizeNoteText("Weaker skater, fucking around at the blue line instead of backchecking.");
    expect(r.dropped).toBe(false);
    expect(r.flagged).toBe(true);
    expect(r.text).not.toMatch(/fuck/i);
    expect(r.text).toContain("Weaker skater");
    expect(r.text).toContain("backchecking");
  });

  it("drops the whole note when redaction would leave an unsalvageable fragment", () => {
    const r = sanitizeNoteText("So fucking lazy");
    expect(r.dropped).toBe(true);
    expect(r.text).toBeNull();
  });

  it("drops sexual content entirely rather than redacting a single word", () => {
    const r = sanitizeNoteText("Keep bottom hand on dick instead of stick.");
    expect(r.dropped).toBe(true);
    expect(r.flagged).toBe(true);
    expect(r.reason).toBe("severe");
    expect(r.text).toBeNull();
  });

  it("drops slurs entirely", () => {
    const r = sanitizeNoteText("player is a retard on the ice");
    expect(r.dropped).toBe(true);
    expect(r.reason).toBe("severe");
  });

  it("passes through null/empty text without throwing", () => {
    expect(sanitizeNoteText(null)).toEqual({ text: null, dropped: false, flagged: false, reason: null });
    expect(sanitizeNoteText("")).toEqual({ text: "", dropped: false, flagged: false, reason: null });
  });
});

describe("sanitizeNotes", () => {
  it("filters a list, dropping unsalvageable/severe notes and rewriting salvageable ones", () => {
    const notes = [
      { session_number: 1, note_text: "Good compete level, wins battles." },
      { session_number: 2, note_text: "Keep bottom hand on dick instead of stick." },
      { session_number: 3, note_text: "Weaker skater, fucking around at the blue line." },
      { session_number: 4, note_text: "So fucking lazy" },
    ];
    const result = sanitizeNotes(notes);
    expect(result).toHaveLength(2);
    expect(result[0].note_text).toBe("Good compete level, wins battles.");
    expect(result[1].note_text).not.toMatch(/fuck/i);
    expect(result[1].session_number).toBe(3);
  });

  it("is stable across repeated calls (no shared regex lastIndex state)", () => {
    const notes = [{ session_number: 1, note_text: "fucking terrible skater" }];
    const first = sanitizeNoteText(notes[0].note_text);
    const second = sanitizeNoteText(notes[0].note_text);
    expect(first).toEqual(second);
  });
});
