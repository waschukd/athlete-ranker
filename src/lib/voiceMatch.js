// ── Fuzzy voice matching for scoring categories ──────────────────────────────
// No external dependencies. Used by the evaluator scoring page to handle
// speech-to-text misrecognitions (e.g. "afford compete" → "effort/compete").

// ── Levenshtein distance ────────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// 0–1 similarity score (1 = identical)
function similarity(a, b) {
  if (!a.length && !b.length) return 1;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}

// ── Normalize for comparison ────────────────────────────────────────────────
export function normalizeForMatch(str) {
  return str
    .toLowerCase()
    .replace(/[/\\-]/g, " ")       // "effort/compete" → "effort compete"
    .replace(/[^a-z0-9\s]/g, "")   // strip punctuation
    .replace(/\s+/g, " ")          // collapse spaces
    .trim();
}

// ── Phonetic alias map ──────────────────────────────────────────────────────
// Keys are normalized canonical names. Values are common speech-to-text
// misrecognitions the Web Speech API produces for these words.
const PHONETIC_ALIASES = {
  "effort compete": [
    "afford compete", "effort complete", "afford complete", "ever compete",
    "f or compete", "effort competes", "afford competes", "effort competing",
    "effort can pete", "effort compete"
  ],
  "puck skills": [
    "puck skill", "pock skills", "pock skill", "pucks kills", "pucks kill",
    "puck scale", "park skills", "puck's kills", "puck's skill", "puck schools",
    "buckskills", "buck skills", "puk skills"
  ],
  "hockey iq": [
    "hockey i q", "hockey i queue", "hot key iq", "hockey like you",
    "hockey i cute", "hockey icu", "hockeyiq", "hockey eye q",
    "hockey eye queue"
  ],
  "hockey sense": [
    "hockey since", "hockey cents", "hockey sends", "hot key sense",
    "hockey scents", "hockey sins", "hockey sence"
  ],
  "skating": [
    "skading", "scating", "skeating", "skatin", "skating",
    "scading", "skater"
  ],
  "athleticism": [
    "athletics", "athletism", "athletic ism", "athletic schism",
    "athletic rhythm", "at the this ism"
  ],
  "compete": [
    "complete", "can pete", "competes", "competing"
  ],
  "effort": [
    "afford", "ever", "f or", "f art", "efforts"
  ],
  "shot": [
    "shut", "shop", "shout", "short"
  ],
  "speed": [
    "speak", "spead", "spade"
  ],
  "passing": [
    "pacing", "parsing", "pasting", "passive"
  ],
  "defense": [
    "defence", "the fence", "defends", "defensive"
  ],
  "awareness": [
    "a wareness", "a weariness", "unawareness"
  ],
  "physicality": [
    "physical ity", "physically", "physical e"
  ],
};

// ── Build reverse alias lookup from DB category names ───────────────────────
// Called once when scoring categories load. Returns a map: alias → canonical name
export function buildAliasLookup(categoryNames) {
  const lookup = {};
  for (const name of categoryNames) {
    const normalized = normalizeForMatch(name);
    // Check if this category matches any key in the alias map
    const aliases = PHONETIC_ALIASES[normalized];
    if (aliases) {
      for (const alias of aliases) {
        lookup[alias.toLowerCase().trim()] = name;
      }
    }
    // Also check individual words (for single-word categories like "Skating")
    const firstWord = normalized.split(" ")[0];
    const wordAliases = PHONETIC_ALIASES[firstWord];
    if (wordAliases) {
      for (const alias of wordAliases) {
        lookup[alias.toLowerCase().trim()] = name;
      }
    }
    // Self-mapping (exact normalized form always matches)
    lookup[normalized] = name;
  }
  return lookup;
}

// ── Main matching function ──────────────────────────────────────────────────
// Returns { match: "Category Name", confidence: 0-1, method: "exact"|"alias"|"fuzzy" } or null
export function findBestCategoryMatch(phrase, categories, aliasLookup) {
  const input = normalizeForMatch(phrase);
  if (!input) return null;

  const catNames = categories.map(c => c.name);

  // 1. Exact match (full name or first word)
  for (const name of catNames) {
    const norm = normalizeForMatch(name);
    if (input === norm) return { match: name, confidence: 1.0, method: "exact" };
    const firstWord = norm.split(" ")[0];
    if (input === firstWord && firstWord.length >= 3) return { match: name, confidence: 1.0, method: "exact" };
  }

  // 2. Alias match
  if (aliasLookup[input]) {
    const matched = aliasLookup[input];
    // Verify the matched name is in our current categories
    if (catNames.some(n => n === matched)) {
      return { match: matched, confidence: 0.95, method: "alias" };
    }
  }

  // 3. Fuzzy match via Levenshtein similarity
  let bestMatch = null;
  let bestScore = 0;
  const THRESHOLD = 0.6;

  for (const name of catNames) {
    const norm = normalizeForMatch(name);

    // Compare full phrase to full category name
    const fullSim = similarity(input, norm);
    if (fullSim > bestScore) {
      bestScore = fullSim;
      bestMatch = name;
    }

    // Compare to first word (for short commands like "skat" for "skating")
    const firstWord = norm.split(" ")[0];
    if (firstWord.length >= 3) {
      // Compare input to first word
      const wordSim = similarity(input, firstWord);
      if (wordSim > bestScore) {
        bestScore = wordSim;
        bestMatch = name;
      }
      // Compare first word of input to first word of category
      const inputFirst = input.split(" ")[0];
      const firstWordSim = similarity(inputFirst, firstWord);
      if (firstWordSim > bestScore && inputFirst.length >= 3) {
        bestScore = firstWordSim;
        bestMatch = name;
      }
    }
  }

  // Skip fuzzy for very short category names to avoid false positives
  if (bestMatch && bestScore >= THRESHOLD) {
    const normBest = normalizeForMatch(bestMatch);
    if (normBest.length < 3 && bestScore < 0.95) return null; // e.g. "IQ" is too short for fuzzy
    return { match: bestMatch, confidence: bestScore, method: "fuzzy" };
  }

  return null;
}

// ── Extract (phrase, number) pairs from an utterance ────────────────────────
// "afford compete 8 skating 6" → [{phrase: "afford compete", value: 8}, {phrase: "skating", value: 6}]
export function extractCandidates(text) {
  const parts = text.trim().split(/\s+/);
  const candidates = [];
  let words = [];

  for (const p of parts) {
    if (/^\d+(\.\d+)?$/.test(p)) {
      if (words.length) {
        candidates.push({ phrase: words.join(" "), value: parseFloat(p) });
      }
      words = [];
    } else {
      words.push(p);
    }
  }
  return candidates;
}
