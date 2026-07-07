// Canonical division key for bulk onboarding. Both the schedule (AI-normalized,
// which gives age_group + division) and the roster (division column) funnel
// through this so "U11 AA" from either source resolves to the SAME category.
//
// Load-bearing rule: tiers must NEVER collapse — AA ≠ AAA ≠ A ≠ House.

// "U11", "u-11", "Under 11", "U 11" → "U11"
export function normAge(s) {
  const str = String(s || "");
  const m = str.match(/\bu\s*-?\s*(\d{1,2})\b/i) || str.match(/\bunder\s*(\d{1,2})\b/i);
  return m ? `U${parseInt(m[1], 10)}` : null;
}

// Strip scheduling noise (TEAM 1, GROUP 2, GAME, //, matchup halves, and an age
// token) from a division/label so the tier stands alone.
function stripNoise(s) {
  let t = String(s || "").toUpperCase();
  t = t.split(/\/\/|\bVS\b|\bGAME\b/)[0];                 // keep the first side of a matchup
  t = t.replace(/\bu\s*-?\s*\d{1,2}\b/gi, " ");           // drop the age token
  t = t.replace(/\b(TEAM|GROUP|GRP|GM|GAME|DIV|DIVISION)\b\s*\d*[A-Z]*/gi, " "); // drop TEAM 1 / GROUP 2 / GM 1 etc.
  t = t.replace(/\b(TIME\s*TRIALS?|PRE[-\s]?SKATE|SKILLS?|SCRIMMAGE|EVALS?|TESTING|PRACTICE)\b/gi, " "); // session-type words
  return t.replace(/[^A-Z0-9&\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Standardize a division string to a canonical tier. Recognized hockey tiers snap
// to a canonical form; anything else (named divisions like "Jr Kings") is kept,
// title-cased, so it still forms a stable, distinct key.
export function normTier(division, label) {
  const cleanedD = stripNoise(division);
  const cleanedL = stripNoise(label);
  const pick = (t) => {
    if (!t) return null;
    if (/^AAA\b/.test(t)) return "AAA";
    if (/^AA\b/.test(t)) return "AA";
    if (/^BBB\b/.test(t)) return "BBB";
    if (/^BB\b/.test(t)) return "BB";
    if (/\bHOUSE\b|\bHL\b/.test(t)) return "House";
    if (/^A\b/.test(t)) return "A";
    if (/^B\b/.test(t)) return "B";
    if (/^C\b/.test(t)) return "C";
    // Recognized tier appearing later in the string (e.g. "SOMENAME AA")
    if (/\bAAA\b/.test(t)) return "AAA";
    if (/\bAA\b/.test(t)) return "AA";
    if (/\bHOUSE\b/.test(t)) return "House";
    return null;
  };
  // Prefer an explicit division field; fall back to scanning the label.
  const tier = pick(cleanedD) || pick(cleanedL);
  if (tier) return tier;
  // No standard tier — keep a named division verbatim (title-cased) if present.
  const named = cleanedD || null;
  if (named) return named.split(" ").map(w => w ? w[0] + w.slice(1).toLowerCase() : w).join(" ");
  return null;
}

// input: { ageGroup, division, label } (any subset). Returns { key, age, tier } or
// null if no age could be determined (can't form a category without an age group).
export function canonicalDivision({ ageGroup, division, label } = {}) {
  const age = normAge(ageGroup) || normAge(division) || normAge(label);
  if (!age) return null;
  const tier = normTier(division, label);
  const key = tier ? `${age} ${tier}` : age;
  return { key, age, tier: tier || null };
}
