// Voice → structured scores parser (pure, unit-tested).
//
// Turns a raw speech transcript ("skating four point five, puck skills three")
// into validated { category, score } pairs. This is the reliability layer that
// sits on top of ANY transcription engine (on-device WASM Whisper offline, or a
// server model online) — Whisper gives text, this turns text into scores.
//
// Handles: digit and spelled numbers, decimals ("four point five" / "4.5"),
// half-points ("two and a half"), fuzzy category matching (incl. common mishears),
// multiple commands in one utterance, corrections (last mention of a category
// wins), scale range validation, and snapping to the scoring increment.

const WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

// Default 4-skill skater set (Skating, Puck Skills, Hockey IQ, Effort & Compete)
// with aliases covering how evaluators say them and how Whisper commonly mishears.
export const DEFAULT_CATEGORIES = [
  { id: "skating", name: "Skating", aliases: ["skating", "skate", "skater"] },
  { id: "puck", name: "Puck Skills", aliases: ["puck skills", "puck skill", "puckskills", "puck", "stick skills", "stickhandling", "stick handling"] },
  { id: "iq", name: "Hockey IQ", aliases: ["hockey iq", "hockey i q", "hockey sense", "game sense", "iq"] },
  { id: "compete", name: "Effort & Compete", aliases: ["effort and compete", "effort & compete", "compete level", "compete", "effort", "battle", "compete level"] },
];

// Lowercase, drop sentence punctuation, but KEEP decimal points inside digits (4.5).
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/(?<!\d)\.(?!\d)/g, " ") // periods that aren't decimals → space
    .replace(/[,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// First number in a text chunk — digit form (4, 4.5) or spelled ("four point five",
// "two and a half"), whichever appears first.
export function firstNumber(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  const dm = t.match(/\d+(?:\.\d+)?/);
  const digitIdx = dm ? dm.index : Infinity;

  let spelled = null, spelledIdx = Infinity;
  const words = t.split(" ");
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === "half" && spelled === null && i === 0) { spelled = 0.5; spelledIdx = t.indexOf("half"); break; }
    if (w in WORDS) {
      let val = WORDS[w];
      const n1 = words[i + 1], n2 = words[i + 2], n3 = words[i + 3];
      if (n1 === "point" && n2 && n2 in WORDS) val = parseFloat(`${val}.${WORDS[n2]}`);
      else if (n1 === "and" && n2 === "a" && n3 === "half") val += 0.5;
      else if (n1 === "a" && n2 === "half") val += 0.5;
      else if (n1 === "half") val += 0.5;
      spelled = val;
      spelledIdx = words.slice(0, i).join(" ").length + (i ? 1 : 0);
      break;
    }
  }
  if (digitIdx === Infinity && spelled === null) return null;
  return digitIdx <= spelledIdx ? parseFloat(dm[0]) : spelled;
}

// transcript → [{ categoryId, category, raw, score, valid, reason }]
// opts: { categories, scale=10, min=1, increment=0.5 }
export function parseScoreCommands(transcript, opts = {}) {
  const categories = opts.categories || DEFAULT_CATEGORIES;
  const scale = opts.scale ?? 10;
  const min = opts.min ?? 1;
  const increment = opts.increment ?? 0.5;
  const text = normalize(transcript);
  if (!text) return [];

  // Collect every alias hit with its position; longest alias wins on overlap.
  const hits = [];
  for (const cat of categories) {
    for (const alias of cat.aliases || [cat.name]) {
      const a = normalize(alias);
      let idx = text.indexOf(a);
      while (idx !== -1) { hits.push({ cat, start: idx, end: idx + a.length }); idx = text.indexOf(a, idx + 1); }
    }
  }
  hits.sort((x, y) => x.start - y.start || (y.end - y.start) - (x.end - x.start));
  const chosen = [];
  let lastEnd = -1;
  for (const h of hits) if (h.start >= lastEnd) { chosen.push(h); lastEnd = h.end; }

  const byCat = {};
  for (let i = 0; i < chosen.length; i++) {
    const seg = text.slice(chosen[i].end, i + 1 < chosen.length ? chosen[i + 1].start : text.length);
    const num = firstNumber(seg);
    const cat = chosen[i].cat;
    if (num === null) { if (!byCat[cat.id]) byCat[cat.id] = { categoryId: cat.id, category: cat.name, raw: null, score: null, valid: false, reason: "no_number" }; continue; }
    const snapped = Math.round(num / increment) * increment;
    const within = snapped >= min && snapped <= scale;
    byCat[cat.id] = { categoryId: cat.id, category: cat.name, raw: num, score: within ? snapped : num, valid: within, reason: within ? null : "out_of_range" };
  }

  // Return in category-definition order, only the ones mentioned.
  return categories.filter(c => byCat[c.id]).map(c => byCat[c.id]);
}
