// Canonical skill/age keys for the scoring-rubric reference guide. Keyword
// matching mirrors src/components/DevelopmentReport.jsx's skillInfo/skillElite
// exactly, on purpose -- a rubric authored for "skating" should apply to any
// scoring_category whose name the report already treats as skating, whatever an
// association happens to have named it.

const G_MOVE = (n) => n.includes("mobil") || n.includes("skat") || n.includes("move") || n.includes("crease") || n.includes("balance") || n.includes("agil") || n.includes("edge") || n.includes("push") || n.includes("recover");
const G_POS = (n) => n.includes("position") || n.includes("angle") || n.includes("net") || n.includes("depth") || n.includes("cover") || n.includes("square");
const G_SAVE = (n) => n.includes("save") || n.includes("rebound") || n.includes("glove") || n.includes("blocker") || n.includes("hand") || n.includes("stick") || n.includes("feet") || n.includes("foot");
const G_READ = (n) => n.includes("anticip") || n.includes("read") || n.includes("track") || n.includes("iq") || n.includes("sense") || n.includes("compete");

export function resolveSkillKey(name, isGoalie) {
  const n = (name || "").toLowerCase();
  if (isGoalie) {
    if (G_MOVE(n)) return "g_movement";
    if (G_POS(n)) return "g_positioning";
    if (G_SAVE(n)) return "g_saves";
    if (G_READ(n)) return "g_reading";
    return null;
  }
  if (n.includes("skat") || n.includes("edge") || n.includes("balance")) return "skating";
  if (n.includes("puck") || n.includes("stick") || n.includes("hand")) return "puck";
  if (n.includes("iq") || n.includes("sense") || n.includes("position") || n.includes("hockey")) return "iq";
  if (n.includes("compete") || n.includes("effort") || n.includes("battle") || n.includes("work")) return "compete";
  if (n.includes("shot") || n.includes("shoot")) return "shot";
  if (n.includes("pass")) return "pass";
  return null;
}

// "U15 AA" -> "U15", "U9 Tier 1" -> "U9". Every age category in this codebase's
// naming convention starts with "U<number>" -- falls back to "ALL" (the
// age-agnostic default band set) when a name doesn't match.
export function resolveAgeTier(categoryName) {
  const m = (categoryName || "").match(/U(\d{1,2})/i);
  return m ? `U${m[1]}` : "ALL";
}
