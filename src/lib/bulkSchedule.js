// Deterministic, format-aware parse of the all-association bulk schedule template.
// The header row must contain "division" and "date". Returns rows in the shape the
// bulk-onboard commit expects, or null when there's no Division column (caller
// then falls back to the AI normalizer). Pure — no DB, unit-testable.
//
// Format column drives two behaviours:
//   Standard   → Group/Matchup is a group number (1,2,3); Type is the session type.
//   Tournament → Group/Matchup is a matchup label ("A vs B"); Type is blank (Game).

const isTourn = (v) => /tourn|round|robin/.test(String(v || "").toLowerCase());

const to24 = (t) => { const s = String(t || "").trim(); if (!s) return null; const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i); if (!m) { const m2 = s.match(/^(\d{1,2}):(\d{2})/); return m2 ? `${m2[1].padStart(2, "0")}:${m2[2]}` : null; } let h = parseInt(m[1]); const ap = m[3] ? m[3].toUpperCase() : null; if (ap === "PM" && h < 12) h += 12; if (ap === "AM" && h === 12) h = 0; return `${String(h).padStart(2, "0")}:${m[2]}`; };
const toISO = (d) => { const s = String(d || "").trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0]; m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/); if (m) return `20${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; return null; };
const stype = (t) => { const s = String(t || "").toLowerCase(); if (s.includes("test") || s.includes("time trial")) return "testing"; if (s.includes("goalie")) return "goalie_skills"; if (s.includes("scrim") || s.includes("game")) return "scrimmage"; if (s.includes("skill") || s.includes("pre")) return "skills"; return "scrimmage"; };

export function mapColumns(H) {
  const col = (names) => H.findIndex(h => names.some(n => h.includes(n)));
  return {
    div: col(["division"]),
    fmt: col(["format"]),
    sess: H.findIndex(h => h.includes("session") && (h.includes("#") || h.includes("number")) && !h.includes("type")),
    gm: H.findIndex(h => h.includes("matchup") || h.includes("group")),
    type: col(["session type", "type"]),
    date: col(["date"]), start: col(["start"]), end: col(["end"]),
    loc: col(["location", "rink"]), pe: col(["player eval"]), ge: col(["goalie eval"]),
  };
}

export function scheduleFromColumns(grid) {
  let hi = -1, H = [];
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const low = (grid[i] || []).map(c => String(c).toLowerCase().trim());
    if (low.some(c => c.includes("division")) && low.some(c => c.includes("date"))) { hi = i; H = low; break; }
  }
  if (hi < 0) return null;
  const ci = mapColumns(H);
  const rows = [];
  for (let i = hi + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const division = ci.div >= 0 ? String(r[ci.div] || "").trim() : "";
    const date = toISO(ci.date >= 0 ? r[ci.date] : "");
    if (!division && !date) continue;
    const eval_format = ci.fmt >= 0 && isTourn(r[ci.fmt]) ? "round_robin" : "standard";
    const gmVal = ci.gm >= 0 ? String(r[ci.gm] || "").trim() : "";
    const isT = eval_format === "round_robin";
    const session_number = ci.sess >= 0 ? (parseInt(r[ci.sess]) || null) : null;
    rows.push({
      raw_label: division, age_group: null, division,
      eval_format, session_number,
      group_number: isT ? null : (parseInt(gmVal) || null),
      matchup: isT ? (gmVal || null) : null,
      session_type: stype(ci.type >= 0 ? r[ci.type] : ""),
      date, start_time: to24(ci.start >= 0 ? r[ci.start] : ""), end_time: to24(ci.end >= 0 ? r[ci.end] : ""),
      location: ci.loc >= 0 ? String(r[ci.loc] || "").trim() || null : null,
      player_evaluators: ci.pe >= 0 ? r[ci.pe] : null, goalie_evaluators: ci.ge >= 0 ? r[ci.ge] : null,
    });
  }
  return rows;
}
