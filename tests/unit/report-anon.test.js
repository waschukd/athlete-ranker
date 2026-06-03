// Verifies that the purchased public report does NOT expose real evaluator
// names in the per-evaluator score breakdown. The route fetches detailed
// scores joined to `users` (real names); before responding it must replace
// each distinct evaluator with a STABLE anonymous label ("Evaluator 1..N")
// keyed by evaluator_id, and the real name must never reach the payload.
//
// We unit-test the pure labeling helper `anonymizeEvaluators` exported from
// the route module (the full GET path is entangled with paid-tier AI/notes
// work, so a focused helper test gives deterministic, leak-proof assertions).

import { describe, it, expect } from "vitest";

// The labeling logic is extracted into a pure helper (the route module can't
// export non-handler functions without breaking Next's route type check, and
// the full GET path is entangled with paid-tier AI/notes work). Testing the
// helper directly gives deterministic, leak-proof assertions. The route wires
// this exact helper over the detailed-scores rows before responding.
import { anonymizeEvaluators, anonymizeNotes, buildEvaluatorLabelMap } from "@/lib/reportAnon";

describe("anonymizeEvaluators", () => {
  it("maps distinct evaluator_ids to stable Evaluator N labels by first appearance", () => {
    const rows = [
      { evaluator_id: "e1", evaluator_name: "Jane Coach", session_number: 1, score: 8 },
      { evaluator_id: "e2", evaluator_name: "Bob Scout", session_number: 1, score: 7 },
      { evaluator_id: "e1", evaluator_name: "Jane Coach", session_number: 2, score: 9 },
      { evaluator_id: "e3", evaluator_name: "Sue Eval", session_number: 2, score: 6 },
    ];
    const out = anonymizeEvaluators(rows);

    // e1 → Evaluator 1, e2 → Evaluator 2, e3 → Evaluator 3 (first appearance order)
    expect(out.map(r => r.evaluator_name)).toEqual([
      "Evaluator 1",
      "Evaluator 2",
      "Evaluator 1",
      "Evaluator 3",
    ]);
  });

  it("uses the SAME label for every row from the same evaluator (stable per report)", () => {
    const rows = [
      { evaluator_id: "e9", evaluator_name: "Jane Coach", scoring_category_id: "c1", score: 5 },
      { evaluator_id: "e9", evaluator_name: "Jane Coach", scoring_category_id: "c2", score: 6 },
    ];
    const out = anonymizeEvaluators(rows);
    expect(out[0].evaluator_name).toBe("Evaluator 1");
    expect(out[1].evaluator_name).toBe("Evaluator 1");
  });

  it("removes the real evaluator name entirely — no field leaks it", () => {
    const rows = [
      { evaluator_id: "e1", evaluator_name: "Jane Coach", session_number: 1, score: 8 },
    ];
    const out = anonymizeEvaluators(rows);
    // No field anywhere in the serialized output contains the real name.
    expect(JSON.stringify(out)).not.toContain("Jane Coach");
    expect(out[0].evaluator_name).toBe("Evaluator 1");
    // It also must not leave the id behind as a name leak vector beyond mapping.
    expect(out[0].evaluator_id).toBeUndefined();
  });

  it("preserves all non-identifying score fields untouched", () => {
    const rows = [
      { evaluator_id: "e1", evaluator_name: "Jane Coach", session_number: 3, score: 8.5, scoring_category_id: "c1", category_name: "Skating", display_order: 2 },
    ];
    const out = anonymizeEvaluators(rows);
    expect(out[0]).toMatchObject({
      session_number: 3,
      score: 8.5,
      scoring_category_id: "c1",
      category_name: "Skating",
      display_order: 2,
    });
  });

  it("handles empty input", () => {
    expect(anonymizeEvaluators([])).toEqual([]);
  });
});

// The purchased report exposes BOTH a per-evaluator score breakdown AND
// evaluator notes (plus an AI summary derived from those notes). Real evaluator
// names must not leak from EITHER, and — critically — the SAME evaluator must
// get the SAME "Evaluator N" label across both surfaces within one report. The
// route builds ONE shared label map (scores-first) and passes it to both
// anonymizeEvaluators and anonymizeNotes; these tests pin that behavior.
describe("shared label map across scores + notes", () => {
  it("maps the SAME evaluator_id to the SAME label in scores AND notes", () => {
    const scoreRows = [
      { evaluator_id: "e1", evaluator_name: "Jane Coach", session_number: 1, score: 8 },
      { evaluator_id: "e2", evaluator_name: "Bob Scout", session_number: 1, score: 7 },
    ];
    const noteRows = [
      { evaluator_id: "e2", evaluator_name: "Bob Scout", session_number: 1, note_text: "Strong skater" },
      { evaluator_id: "e1", evaluator_name: "Jane Coach", session_number: 2, note_text: "Needs work on shot" },
    ];

    // Replicate the route: ONE shared map over the union of ids (scores first).
    const map = buildEvaluatorLabelMap([
      ...scoreRows.map(r => r.evaluator_id),
      ...noteRows.map(n => n.evaluator_id),
    ]);
    const scoresOut = anonymizeEvaluators(scoreRows, map);
    const notesOut = anonymizeNotes(noteRows, map);

    // e1 → Evaluator 1, e2 → Evaluator 2 in BOTH surfaces.
    expect(scoresOut[0].evaluator_name).toBe("Evaluator 1"); // e1
    expect(scoresOut[1].evaluator_name).toBe("Evaluator 2"); // e2
    expect(notesOut[0].evaluator_name).toBe("Evaluator 2");  // e2 — same label
    expect(notesOut[1].evaluator_name).toBe("Evaluator 1");  // e1 — same label

    // The label assigned to e1 in scores is identical to e1 in notes.
    const e1Score = scoresOut.find(r => r.score === 8).evaluator_name;
    const e1Note = notesOut.find(n => n.note_text === "Needs work on shot").evaluator_name;
    expect(e1Note).toBe(e1Score);
  });

  it("strips real name + evaluator_id from notes — no leak in either surface", () => {
    const scoreRows = [{ evaluator_id: "e1", evaluator_name: "Jane Coach", score: 8 }];
    const noteRows = [{ evaluator_id: "e1", evaluator_name: "Jane Coach", note_text: "Great hands" }];
    const map = buildEvaluatorLabelMap([
      ...scoreRows.map(r => r.evaluator_id),
      ...noteRows.map(n => n.evaluator_id),
    ]);
    const scoresOut = anonymizeEvaluators(scoreRows, map);
    const notesOut = anonymizeNotes(noteRows, map);

    const serialized = JSON.stringify({ scoresOut, notesOut });
    expect(serialized).not.toContain("Jane Coach");
    expect(serialized).not.toContain("e1");
    expect(notesOut[0].evaluator_id).toBeUndefined();
    expect(notesOut[0].evaluator_name).toBe("Evaluator 1");
    // Note text is preserved untouched.
    expect(notesOut[0].note_text).toBe("Great hands");
  });

  it("gives notes-only evaluators their own labels after scores evaluators", () => {
    const scoreRows = [{ evaluator_id: "e1", evaluator_name: "Jane Coach", score: 8 }];
    // e5 appears ONLY in notes, never in scores.
    const noteRows = [{ evaluator_id: "e5", evaluator_name: "Sam Note", note_text: "Quick feet" }];
    const map = buildEvaluatorLabelMap([
      ...scoreRows.map(r => r.evaluator_id),
      ...noteRows.map(n => n.evaluator_id),
    ]);
    const scoresOut = anonymizeEvaluators(scoreRows, map);
    const notesOut = anonymizeNotes(noteRows, map);

    expect(scoresOut[0].evaluator_name).toBe("Evaluator 1"); // e1 first
    expect(notesOut[0].evaluator_name).toBe("Evaluator 2");  // e5 next
    expect(JSON.stringify(notesOut)).not.toContain("Sam Note");
  });

  it("anonymizeNotes self-assigns labels when no shared map is passed", () => {
    const noteRows = [
      { evaluator_id: "e1", evaluator_name: "Jane Coach", note_text: "a" },
      { evaluator_id: "e2", evaluator_name: "Bob Scout", note_text: "b" },
      { evaluator_id: "e1", evaluator_name: "Jane Coach", note_text: "c" },
    ];
    const out = anonymizeNotes(noteRows);
    expect(out.map(n => n.evaluator_name)).toEqual([
      "Evaluator 1",
      "Evaluator 2",
      "Evaluator 1",
    ]);
  });
});

describe("buildEvaluatorLabelMap", () => {
  it("numbers by first appearance and de-dupes", () => {
    const map = buildEvaluatorLabelMap(["e3", "e1", "e3", "e2"]);
    expect(map.get("e3")).toBe("Evaluator 1");
    expect(map.get("e1")).toBe("Evaluator 2");
    expect(map.get("e2")).toBe("Evaluator 3");
    expect(map.size).toBe(3);
  });

  it("extends an existing map without renumbering existing ids", () => {
    const map = buildEvaluatorLabelMap(["e1", "e2"]);
    buildEvaluatorLabelMap(["e2", "e9"], map); // e2 already present
    expect(map.get("e1")).toBe("Evaluator 1");
    expect(map.get("e2")).toBe("Evaluator 2");
    expect(map.get("e9")).toBe("Evaluator 3");
  });
});
