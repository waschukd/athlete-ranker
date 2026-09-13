// Arena codes -> full names, so a location never reaches a person as a bare
// code. Hockey Edmonton codes (spmha.ab.ca/hockey-edmonton-arena-codes) plus
// the rinks CT's associations actually use that are not on that list.
//
// Why: Millwoods is an association AND an arena. Millwoods Hockey skates at
// TMW -- The Meadows West -- and evaluators kept seeing "Millwoods ... TMW"
// and driving to Millwoods Arena. Showing "The Meadows West (TMW)" keeps the
// code the schedule sheet uses and puts the name people navigate by first.
//
// Schedules are typed by hand, so the input is messy: "KNRRC 1", "CDA -
// Castledowns", "CDA  - CASTLEDOWNS A", "Glengarry Arena", "SHERWOOD PK
// SHELL". arenaName() has to find the rink in all of those, and arenaLabel()
// must never lose what was typed if it cannot.

export const ARENAS = {
  AKI: "Akinsdale Arena",
  ALX: "Alexandra Arena",
  ARE: "Ardrossan Recreation Complex, Macmillan Arena",
  ARW: "Ardrossan Recreation Complex, West Arena",
  ARP: "Argyll Plaza",
  BHA: "Bill Hunter Arena",
  CWA: "Callingwood A",
  CWB: "Callingwood B",
  CAC: "Canadian Athletic Club Arena",
  CDA: "Castledowns A",
  CDB: "Castledowns B",
  CVA: "Clareview A",
  CVB: "Clareview B",
  CFA: "Confederation Arena",
  CRA: "Crestwood Arena",
  DOA: "Donnan Arena",
  DOW: "Dow Centennial Centre",
  EIB: "Edmonton IceBox",
  JRC: "Fort Saskatchewan Jubilee Arena",
  SPX: "Fort Saskatchewan Sportsplex Arena",
  FVA: "Fultonvale / Strathcona Olympiette",
  EGA: "Garrison A",
  EGB: "Garrison B",
  SSA: "George S. Hughes South Side Arena",
  GARC: "Glen Allan Recreation Centre",
  GLA: "Glengarry Arena",
  GAA: "Go Auto Arena",
  GTA: "Grand Trunk Arena",
  KEA: "Kenilworth Arena",
  KN1: "Ken Nichol Arena 1",
  KN2: "Ken Nichol Arena 2",
  KNX: "Kinex Arena",
  KMA: "Kinsmen A",
  KMB: "Kinsmen B",
  BGC: "Leduc Recreation Centre",
  LOA: "Londonderry Arena",
  CMM: "Mark Messier Arena",
  MCA: "Michael Cameron Arena",
  MWA: "Millwoods Arena A",
  MWB: "Millwoods Arena B",
  NAIT: "NAIT Arena",
  OLA: "Oliver Arena",
  REX: "Rexall Place",
  ENO: "Enoch Arena",
  RCS: "River Cree South",
  RCN: "River Cree North",
  RBA: "Russ Barnes Arena",
  SAP: "Servus Credit Union Place",
  SPA: "Sherwood Park Arena",
  SPS: "Sherwood Park Shell",
  MPN: "Millennium Place North",
  MPS: "Millennium Place South",
  GRF: "Grant Fuhr Arena (Spruce Grove)",
  SGE: "Spruce Grove East Agrena",
  TCA: "Terwillegar Recreation Centre, A Sheet",
  TCB: "Terwillegar Recreation Centre, B Sheet",
  TCC: "Terwillegar Recreation Centre, C Sheet",
  TCD: "Terwillegar Recreation Centre, D Sheet",
  TME: "The Meadows East",
  TMW: "The Meadows West",
  TIA: "Tipton Arena",
  TLN: "TransAlta Tri-Leisure Centre, North",
  TLS: "TransAlta Tri-Leisure Centre, South",
  CTM: "Troy Murray / Go Auto Arena",
  WEM: "West Edmonton Mall Ice Palace",
  WWA: "Westwood Arena",
  // Not on the Hockey Edmonton list; used by CT's associations.
  KNRRC: "Ken Nichol Regional Recreation Centre (Beaumont)",
  BSRC: "Beaumont Sport & Recreation Centre",
};

// Free-text rink names that show up instead of a code. Keys are normalised
// (uppercase, single spaces, punctuation stripped) to survive the typos.
const BY_NAME = {
  "GLENGARRY": "GLA", "GLENGARRY ARENA": "GLA",
  "GRAND TRUNK": "GTA", "GRAND TRUNK ARENA": "GTA",
  "CLAREVIEW": "CVA", "CLAREVIEW A": "CVA", "CLAREVIEW B": "CVB",
  "CASTLEDOWNS": "CDA", "CASTLEDOWNS A": "CDA", "CASTLEDOWNS B": "CDB",
  "SHERWOOD PARK SHELL": "SPS", "SHERWOOD PK SHELL": "SPS", "SHELL": "SPS",
  "ARDROSSAN WEST": "ARW", "ARDROSSAN EAST": "ARE", "ARDROSSAN": "ARE",
  "RUSS BARNES": "RBA", "RUSS BARNES ARENA": "RBA",
  "BILL HUNTER": "BHA", "BILL HUNTER ARENA": "BHA",
  "MEADOWS WEST": "TMW", "THE MEADOWS WEST": "TMW",
  "MEADOWS EAST": "TME", "THE MEADOWS EAST": "TME",
  "KEN NICHOL": "KNRRC",
};

// Rinks with no Hockey Edmonton code at all -- shown by name, never invented.
const NAMED_ONLY = [
  [/^RANDY ROSEN/, "Randy Rosen Rink (Sherwood Park)"],
  [/^MILL?ENN?IUM.*POWERADE/, "Millennium Place, Powerade Rink (Sherwood Park)"],
  [/^MILL?ENN?IUM.*CHEVROLET/, "Millennium Place, Chevrolet Rink (Sherwood Park)"],
  [/^MILL?ENN?IUM/, "Millennium Place (Sherwood Park)"],
];

const norm = (s) => String(s || "").toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

/**
 * The rink's full name for a schedule location, or null if it is not one we
 * know. Handles a bare code ("TMW"), a code with a rink number ("KNRRC 1"), a
 * code with a name after it ("CDA - Castledowns A"), and a plain name
 * ("Glengarry Arena", "SHERWOOD PK SHELL").
 */
export function arenaName(location) {
  const n = norm(location);
  if (!n) return null;

  for (const [re, name] of NAMED_ONLY) if (re.test(n)) return name;

  // A code that is itself alphanumeric ("KN1", "TCD") before splitting off a
  // trailing digit as a rink number.
  const whole = n.match(/^([A-Z]{2,4}\d?)(?:\s*-\s*.*)?$/);
  if (whole && ARENAS[whole[1]]) return ARENAS[whole[1]];

  // "CODE", "CODE 1", "CODE - anything", "CODE-anything"
  const m = n.match(/^([A-Z]{2,5})(?:\s*(\d))?(?:\s*-\s*.*)?$/);
  if (m && ARENAS[m[1]]) {
    const base = ARENAS[m[1]];
    // A rink number on a multi-sheet code ("KNRRC 1") -> "..., Rink 1".
    return m[2] ? `${base}, Rink ${m[2]}` : base;
  }

  const stripped = n.replace(/\s*-\s*/g, " ").replace(/\b(ARENA|RINK)\b/g, "").replace(/\s+/g, " ").trim();
  for (const key of [n, stripped]) {
    if (BY_NAME[key]) return ARENAS[BY_NAME[key]];
  }
  return null;
}

/**
 * What a person should read: the full name first, the code they will see on
 * the rink sign and the schedule sheet in parentheses. If the location is
 * already a full name, or unknown, it is returned exactly as typed -- the
 * label must never be less informative than the original.
 *
 *   "TMW"              -> "The Meadows West (TMW)"
 *   "KNRRC 1"          -> "Ken Nichol Regional Recreation Centre (Beaumont), Rink 1 (KNRRC 1)"
 *   "Glengarry Arena"  -> "Glengarry Arena (GLA)"
 *   "Some New Rink"    -> "Some New Rink"
 */
export function arenaLabel(location) {
  const raw = String(location || "").trim();
  if (!raw) return "";
  const name = arenaName(raw);
  if (!name) return raw;
  // The code the sheet uses: the leading token(s) of what was typed, if it is
  // a code; otherwise the canonical code for the name.
  const n = norm(raw);
  const codeMatch = n.match(/^([A-Z]{2,5}(?:\s*\d)?)/);
  const tok = codeMatch ? codeMatch[1].replace(/\s+/, " ") : null;
  const typedCode = tok && (ARENAS[tok.replace(/\s/g, "")] ? tok.replace(/\s/g, "") : ARENAS[tok.replace(/\s*\d$/, "")] ? tok : null);
  const canonical = typedCode || Object.keys(ARENAS).find(k => ARENAS[k] === name) || null;
  if (!canonical) return name; // named-only rinks like Randy Rosen
  // Even when the full name was typed, the code goes on: it is what the sheet
  // and the rink sign say, and it is how people cross-check they are in the
  // right building.
  return `${name} (${canonical})`;
}
