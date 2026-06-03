// Anonymize evaluator identities for the public/purchased report. Parents who
// buy a report are entitled to the per-evaluator score *breakdown* and notes,
// but NOT to the evaluators' real identities. We map each distinct evaluator_id
// to a stable label "Evaluator N" and overwrite the real name with that label,
// dropping evaluator_id/real-name fields so they never reach the response.
//
// IMPORTANT: within a single report the SAME evaluator must get the SAME label
// everywhere — in the score breakdown AND in the notes (and the AI summary
// derived from those notes). Callers build ONE shared map for the whole report
// (via buildEvaluatorLabelMap over the union of evaluator_ids across scores +
// notes) and pass it to both anonymizeEvaluators and anonymizeNotes.

// Build (or extend) a shared evaluator_id -> "Evaluator N" label map. Labels are
// numbered by first appearance across the supplied id list so labeling is
// deterministic per report. Pass an existing map to keep extending it (ids
// already present keep their label); the order you feed ids in determines
// numbering, so feed scores rows before notes for "scores-first" numbering.
export function buildEvaluatorLabelMap(ids, labels = new Map()) {
  for (const id of ids) {
    if (!labels.has(id)) {
      labels.set(id, `Evaluator ${labels.size + 1}`);
    }
  }
  return labels;
}

// Anonymize per-evaluator score rows. If a shared `labels` map is provided it is
// used (and extended in-place for any new ids); otherwise a fresh map is built
// numbered by first appearance in `rows`. Returns rows with evaluator_name
// replaced by the label and evaluator_id stripped.
export function anonymizeEvaluators(rows, labels = new Map()) {
  return rows.map((row) => {
    const { evaluator_id, evaluator_name, ...rest } = row;
    if (!labels.has(evaluator_id)) {
      labels.set(evaluator_id, `Evaluator ${labels.size + 1}`);
    }
    return { ...rest, evaluator_name: labels.get(evaluator_id) };
  });
}

// Anonymize evaluator notes using the shared label map. Each note's displayed
// author (evaluator_name) is set to the label and the real name + evaluator_id
// are stripped so neither reaches the response. If a note's evaluator_id isn't
// in the map yet it is assigned the next label (keeps things leak-proof even if
// a note references an evaluator with no scores).
export function anonymizeNotes(notes, labels = new Map()) {
  return notes.map((note) => {
    const { evaluator_id, evaluator_name, ...rest } = note;
    if (!labels.has(evaluator_id)) {
      labels.set(evaluator_id, `Evaluator ${labels.size + 1}`);
    }
    return { ...rest, evaluator_name: labels.get(evaluator_id) };
  });
}
