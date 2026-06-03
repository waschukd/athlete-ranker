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
import { anonymizeEvaluators } from "@/lib/reportAnon";

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
