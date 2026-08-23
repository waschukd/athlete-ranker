// ── Status helpers ─────────────────────────────────────────────────────────
export function getStatus(athleteId, scores, totalCats) {
  if (!totalCats) return "empty";
  const s = scores[athleteId];
  if (!s) return "empty";
  const filled = Object.values(s.cats || {}).filter(v => v !== null && v !== undefined).length;
  if (filled === 0) return "empty";
  if (filled < totalCats) return "partial";
  return "complete";
}
