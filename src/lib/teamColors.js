// Per-session jersey colours.
//
// Evaluators identify players by the colour of the jersey in front of them, so
// the circle on their screen should be that colour -- not a "Light"/"Dark"
// abstraction they have to translate. Rinks hand out whatever is in the bag, so
// the palette is per-session and free-form rather than a fixed pair.
//
// Storage (no migration needed -- both columns already existed):
//   checkin_sessions.team_colors  JSON array of {name, hex, text, border}
//   player_checkins.team_color    the NAME of one of those entries
//
// Backward compatibility is the hard requirement here: every existing row in
// production is the string "White" or "Dark", and every existing checkin_session
// holds the literal ["White","Dark"]. parseTeamColors() upgrades that legacy
// shape in place, and colorFor() falls back to the default palette by name, so
// untouched sessions keep rendering exactly as they did.

/** The pair every session gets unless someone picks something else. */
export const DEFAULT_TEAM_COLORS = [
  { name: "White", hex: "#ffffff", text: "#111827", border: "#9ca3af" },
  { name: "Dark", hex: "#111827", text: "#ffffff", border: "#374151" },
];

/**
 * Colours offered in the picker. `text` is the paired foreground that stays
 * legible on `hex` -- never derive it at render time, a jersey number on a
 * yellow circle needs dark ink and one on navy needs white.
 */
export const PRESET_TEAM_COLORS = [
  { name: "White", hex: "#ffffff", text: "#111827", border: "#9ca3af" },
  { name: "Dark", hex: "#111827", text: "#ffffff", border: "#374151" },
  { name: "Red", hex: "#dc2626", text: "#ffffff", border: "#991b1b" },
  { name: "Blue", hex: "#2563eb", text: "#ffffff", border: "#1e40af" },
  { name: "Green", hex: "#16a34a", text: "#ffffff", border: "#15803d" },
  { name: "Yellow", hex: "#facc15", text: "#111827", border: "#a16207" },
  { name: "Orange", hex: "#ea580c", text: "#ffffff", border: "#9a3412" },
  { name: "Purple", hex: "#7c3aed", text: "#ffffff", border: "#5b21b6" },
  { name: "Teal", hex: "#0d9488", text: "#ffffff", border: "#115e59" },
  { name: "Pink", hex: "#db2777", text: "#ffffff", border: "#9d174d" },
  { name: "Grey", hex: "#9ca3af", text: "#111827", border: "#4b5563" },
  { name: "Maroon", hex: "#7f1d1d", text: "#ffffff", border: "#450a0a" },
];

/** Rendered when a stored team_color matches nothing in the palette. */
export const UNKNOWN_TEAM_COLOR = { name: "", hex: "#f3f4f6", text: "#4b5563", border: "#e5e7eb" };

const byName = (name) =>
  PRESET_TEAM_COLORS.find(c => c.name.toLowerCase() === String(name).toLowerCase());

/**
 * Normalize whatever is in checkin_sessions.team_colors into full entries.
 *
 * Accepts the JSON string Postgres sometimes hands back, an array of plain
 * names (the legacy ["White","Dark"] shape), or an array of full objects.
 * Always returns at least the default pair -- callers should never have to
 * guard against an empty palette.
 */
export function parseTeamColors(raw) {
  let arr = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return DEFAULT_TEAM_COLORS; }
  }
  if (!Array.isArray(arr) || arr.length === 0) return DEFAULT_TEAM_COLORS;

  const out = arr.map(entry => {
    if (entry && typeof entry === "object" && entry.name) {
      // Trust a stored hex, but fill in anything the row is missing from the
      // preset of the same name so half-written rows still render.
      const preset = byName(entry.name) || UNKNOWN_TEAM_COLOR;
      return {
        name: String(entry.name),
        hex: entry.hex || preset.hex,
        text: entry.text || preset.text,
        border: entry.border || preset.border,
      };
    }
    // Legacy: a bare colour name.
    const preset = byName(entry);
    return preset ? { ...preset } : { ...UNKNOWN_TEAM_COLOR, name: String(entry ?? "") };
  }).filter(c => c.name);

  return out.length ? out : DEFAULT_TEAM_COLORS;
}

/**
 * Resolve a stored player_checkins.team_color to a renderable entry.
 * Falls back to the default palette so a legacy "White"/"Dark" row still
 * renders correctly even on a session that has since picked custom colours.
 */
export function colorFor(teamColor, colors) {
  if (!teamColor) return UNKNOWN_TEAM_COLOR;
  const list = Array.isArray(colors) && colors.length ? colors : DEFAULT_TEAM_COLORS;
  const match = list.find(c => c.name.toLowerCase() === String(teamColor).toLowerCase());
  if (match) return match;
  const legacy = DEFAULT_TEAM_COLORS.find(c => c.name.toLowerCase() === String(teamColor).toLowerCase());
  return legacy || byName(teamColor) || UNKNOWN_TEAM_COLOR;
}

/** Inline style for a jersey circle. Inline on purpose: [data-theme="premium"]
 *  remaps utility classes like .bg-white with !important, which is what made
 *  "Light" and "Dark" indistinguishable in the evaluator's grid view. */
export function swatchStyle(entry) {
  const c = entry || UNKNOWN_TEAM_COLOR;
  return { background: c.hex, color: c.text, border: `2px solid ${c.border}` };
}

/**
 * The colour to switch to when someone taps a jersey circle. Cycles through the
 * session's palette, so this still reads as a straight toggle for the usual two
 * colours but keeps working if a session ever defines three or more.
 */
export function nextColor(teamColor, colors) {
  const list = Array.isArray(colors) && colors.length ? colors : DEFAULT_TEAM_COLORS;
  const i = list.findIndex(c => c.name.toLowerCase() === String(teamColor ?? "").toLowerCase());
  return list[(i + 1) % list.length].name;
}

/** Short badge label for a colour -- first letter, e.g. "W"/"D"/"R". */
export function colorInitial(name) {
  return String(name || "?").trim().charAt(0).toUpperCase() || "?";
}

/** Just the names, for the filter chips and for seeding assignments. */
export function colorNames(colors) {
  return parseTeamColors(colors).map(c => c.name);
}
