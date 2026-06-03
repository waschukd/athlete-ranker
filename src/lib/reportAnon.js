// Anonymize per-evaluator score rows for the public/purchased report. Parents
// who buy a report are entitled to the per-evaluator score *breakdown*, but
// NOT to the evaluators' real identities. We map each distinct evaluator_id to
// a stable label "Evaluator N" (numbered by first appearance in the ordered
// rows so the labeling is deterministic per report), overwrite evaluator_name
// with that label, and drop evaluator_id entirely so the real name/id never
// reaches the response payload in any field.
export function anonymizeEvaluators(rows) {
  const labels = new Map(); // evaluator_id -> "Evaluator N"
  return rows.map((row) => {
    const { evaluator_id, evaluator_name, ...rest } = row;
    if (!labels.has(evaluator_id)) {
      labels.set(evaluator_id, `Evaluator ${labels.size + 1}`);
    }
    return { ...rest, evaluator_name: labels.get(evaluator_id) };
  });
}
