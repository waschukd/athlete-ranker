// One definition of "is this player a forward / a defender", used by the
// evaluator position filter and anywhere else that has to split a roster.
//
// forward_defense counts as BOTH: a hybrid should appear whichever way an
// evaluator filters, or they silently vanish from one of the two lists.
export function isPos(position, want) {
  const p = String(position || "").toLowerCase();
  if (want === "all" || !want) return true;
  if (!p) return false;
  if (want === "defense") return p.startsWith("d") || p === "forward_defense";
  if (want === "forward") return p.startsWith("f");
  if (want === "goalie") return p.startsWith("g");
  return p === want;
}
