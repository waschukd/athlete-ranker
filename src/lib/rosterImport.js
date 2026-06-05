// Provider-agnostic roster import engine. Turns a raw registration export
// (RAMP, TeamSnap, TeamLinkt, or our own template) into canonical athlete rows.
// Pure functions — unit tested in tests/unit/rosterImport.test.js.

// ── CSV parsing (quote-aware) ──────────────────────────────────────────────
// Handles quoted fields containing commas/newlines and "" escaped quotes —
// the naive line.split(",") approach mangles real exports (addresses, notes).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  // Drop fully-empty trailing rows
  const cleaned = rows.filter(r => r.some(v => (v || "").trim() !== ""));
  if (!cleaned.length) return { headers: [], rows: [] };
  const headers = cleaned[0].map(h => h.trim());
  const dataRows = cleaned.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
    return obj;
  });
  return { headers, rows: dataRows };
}

const norm = (h) => (h || "").toLowerCase().replace(/[\s._-]+/g, " ").trim();

// Header synonym tables (normalized). Order matters — earlier = higher priority.
const SYN = {
  firstName: ["first name", "firstname", "first", "player first name", "participant first name", "athlete first name"],
  lastName: ["last name", "lastname", "last", "surname", "player last name", "participant last name", "athlete last name"],
  fullName: ["participant", "player name", "full name", "athlete name", "member name", "skater name", "name"],
  birthYear: ["birth year", "year of birth", "yob"],
  birthdate: ["birthdate", "birth date", "date of birth", "dob", "birthday", "d.o.b"],
  position: ["players position", "player position", "hockey canada position", "position", "pos"],
  externalId: ["hockey canada registration number", "hockey canada #", "hockey canada number", "hc number", "hc #", "hc#", "hcr #", "hcr", "usa hockey #", "usa hockey number", "member id", "registration id", "external id", "player id"],
  parentEmail: ["parent email", "guardian parent 1 email", "guardian email", "parent 1 email", "registrant email", "primary email", "email", "parent 2 email", "contact email"],
  division: ["participant group", "hockey canada division", "division", "age group", "team", "group", "category", "level"],
};

// Headers that should NOT be picked as the athlete's own name/email even if they
// contain "name"/"email" (they belong to a parent/guardian/coach/etc).
const NAME_EXCLUDE = ["parent", "guardian", "registrant", "emergency", "coach", "contact", "committee", "relation"];

function pickHeader(headers, key, { excludeNameish = false } = {}) {
  const normed = headers.map(h => ({ raw: h, n: norm(h) }));
  for (const syn of SYN[key]) {
    // exact normalized match first
    const exact = normed.find(h => h.n === syn
      && !(excludeNameish && NAME_EXCLUDE.some(x => h.n.includes(x))));
    if (exact) return exact.raw;
  }
  for (const syn of SYN[key]) {
    const part = normed.find(h => h.n.includes(syn)
      && !(excludeNameish && NAME_EXCLUDE.some(x => h.n.includes(x))));
    if (part) return part.raw;
  }
  return null;
}

// Best-guess column mapping for a set of headers.
export function detectMapping(headers) {
  const firstName = pickHeader(headers, "firstName", { excludeNameish: true });
  const lastName = pickHeader(headers, "lastName", { excludeNameish: true });
  const fullName = (firstName && lastName) ? null : pickHeader(headers, "fullName", { excludeNameish: true });
  return {
    firstName,
    lastName,
    fullName,
    birthYear: pickHeader(headers, "birthYear"),
    birthdate: pickHeader(headers, "birthdate"),
    position: pickHeader(headers, "position"),
    externalId: pickHeader(headers, "externalId"),
    parentEmail: pickHeader(headers, "parentEmail", { excludeNameish: false }),
    division: pickHeader(headers, "division"),
  };
}

// "First Last" or "Last, First" → { first, last }
export function splitName(full) {
  const v = (full || "").trim().replace(/\s+/g, " ");
  if (!v) return { first: "", last: "" };
  if (v.includes(",")) {
    const [last, first] = v.split(",").map(x => x.trim());
    return { first: first || "", last: last || "" };
  }
  const parts = v.split(" ");
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

// Pull a 4-digit birth year out of any date string ("09/22/2018", "2018-05-01", "2018").
export function parseBirthYear(val) {
  if (!val) return null;
  const m = String(val).match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : null;
}

const POS = {
  f: "forward", forward: "forward", fwd: "forward", fw: "forward",
  d: "defense", def: "defense", defense: "defense", defence: "defense", defenceman: "defense", defenseman: "defense",
  g: "goalie", gk: "goalie", goalie: "goalie", goaltender: "goalie", goalkeeper: "goalie",
};
// Registration exports often say "Player" or leave it blank — those are not skating
// positions, so they normalize to null (unknown) rather than a bogus value.
export function normalizePosition(val) {
  const v = (val || "").toLowerCase().trim();
  if (!v || v === "player" || v === "skater") return null;
  return POS[v] || null;
}

// Turn one parsed CSV row into a canonical athlete using the mapping.
export function toAthlete(row, mapping) {
  let first = "", last = "";
  if (mapping.firstName || mapping.lastName) {
    first = (row[mapping.firstName] || "").trim();
    last = (row[mapping.lastName] || "").trim();
    if (!first && !last && mapping.fullName) ({ first, last } = splitName(row[mapping.fullName]));
  } else if (mapping.fullName) {
    ({ first, last } = splitName(row[mapping.fullName]));
  }
  const birth_year = mapping.birthYear
    ? parseBirthYear(row[mapping.birthYear])
    : (mapping.birthdate ? parseBirthYear(row[mapping.birthdate]) : null);
  return {
    first_name: first,
    last_name: last,
    external_id: mapping.externalId ? (row[mapping.externalId] || "").trim() : "",
    position: mapping.position ? normalizePosition(row[mapping.position]) : null,
    birth_year,
    parent_email: mapping.parentEmail ? (row[mapping.parentEmail] || "").trim() : "",
    _division: mapping.division ? (row[mapping.division] || "").trim() : "",
  };
}

// Counts of rows per division value (for the "which group is this category?" filter).
export function summarizeDivisions(rows, divisionHeader) {
  if (!divisionHeader) return [];
  const counts = new Map();
  for (const r of rows) {
    const v = (r[divisionHeader] || "").trim() || "(blank)";
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

function ageNum(str) {
  const s = String(str || "").toLowerCase();
  const m = s.match(/\bu\s*(\d{1,2})\b/) || s.match(/\bunder\s*(\d{1,2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

// Given the category being set up (e.g. "U13 AA") and the division values found in
// the file, return the division value(s) that best match — used to pre-tick the
// right group as a fallback when someone uploads a whole-association export.
export function suggestDivisions(categoryName, divisionValues) {
  if (!categoryName || !divisionValues?.length) return [];
  const catAge = ageNum(categoryName);
  const catNorm = norm(categoryName).replace(/\s+/g, "");
  const out = [];
  for (const d of divisionValues) {
    const dv = typeof d === "string" ? d : d?.value;
    if (!dv) continue;
    const dAge = ageNum(dv);
    const dNorm = norm(dv).replace(/\s+/g, "");
    let hit = false;
    if (catAge != null && dAge != null) hit = catAge === dAge;
    else if (dNorm && catNorm) hit = catNorm.includes(dNorm) || dNorm.includes(catNorm);
    if (hit) out.push(dv);
  }
  return out;
}

// Full pipeline: parsed rows + mapping (+ optional division filter) → valid athletes.
// Returns { athletes, skipped } where skipped lacked a usable name.
export function buildAthletes(rows, mapping, selectedDivisions = null) {
  const out = [];
  let skipped = 0;
  const sel = selectedDivisions ? selectedDivisions.map(d => (d || "").trim()) : null;
  for (const row of rows) {
    if (sel && mapping.division) {
      const v = (row[mapping.division] || "").trim();
      if (!sel.includes(v)) continue;
    }
    const a = toAthlete(row, mapping);
    if (!a.first_name || !a.last_name) { skipped++; continue; }
    out.push(a);
  }
  return { athletes: out, skipped };
}
