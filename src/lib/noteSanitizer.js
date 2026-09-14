// Hard, ENFORCED report-time content gate for evaluator notes.
//
// noteToneCheck.js is a save-time, client-side NUDGE only -- it never blocks
// or alters what gets saved, and its word list covers profanity/harsh tone
// only (zero sexual-content or slur coverage). This module is the real gate:
// it runs right before a note reaches any parent- or coach-facing surface,
// or gets forwarded to the third-party AI narrative call in
// parentNarrative.js (which otherwise sends raw note text to an external API
// and can echo it back verbatim as a quoted "selected note").
//
// Two tiers, by severity:
// - Mild profanity: the flagged word is surgically removed, the rest of the
//   sentence is preserved -- the same fix applied by hand to a real
//   production note ("...weaker skater fucking around..." ->
//   "...weaker skater around...").
// - Sexual content / slurs: the WHOLE note is dropped, never redacted. A
//   sentence built around one of these words rarely has a salvageable
//   remainder (a likely voice-dictation mishear of "stick" -> "dick" leaves
//   nothing usable), and the risk of a slur or sexual reference reaching a
//   parent report is too high to gamble on a redacted fragment reading fine.

// Deliberately narrower than noteToneCheck.js's FLAG_WORDS: this is the HARD
// gate, so it only catches actual obscenity/vulgarity -- the thing that's a
// real liability if a parent sees it. "Lazy," "stupid," "terrible" etc. are
// blunt but legitimate, defensible coaching assessments (a real evaluator
// calling a kid lazy once is normal feedback, not a PR problem) -- those
// stay covered by the existing save-time tone NUDGE only, where a false
// positive costs nothing. Redacting them here would quietly degrade honest
// coach feedback for no real reduction in risk.
const PROFANITY = [
  "fuck", "fucking", "fucked", "fucker", "shit", "shitty", "bullshit",
  "damn", "goddamn", "hell", "ass", "asshole", "bitch", "crap", "crappy",
  "suck", "sucks", "sucked", "sucking",
];

// Exact word forms only, same discipline as noteToneCheck.js -- no wildcard
// suffix that could clip a real hockey word ("ass" must never match inside
// "assist").
const SEXUAL_AND_SLURS = [
  "dick", "dicks", "cock", "cocks", "penis", "vagina", "pussy",
  "boob", "boobs", "tit", "tits", "titty", "titties",
  "cum", "cumming", "semen", "blowjob", "handjob", "dildo", "porn", "pornographic",
  "masturbate", "masturbates", "masturbating", "masturbation",
  "rape", "raped", "raping", "rapist", "molest", "molested", "molesting", "pedophile",
  "whore", "slut", "cunt", "twat", "bastard",
  "nigger", "nigga", "faggot", "fag", "chink", "spic", "kike", "tranny",
  "retard", "retarded",
];

const profanityTest = new RegExp(`\\b(${PROFANITY.join("|")})\\b`, "i");
const profanityReplace = new RegExp(`\\b(${PROFANITY.join("|")})\\b`, "gi");
const severeTest = new RegExp(`\\b(${SEXUAL_AND_SLURS.join("|")})\\b`, "i");

function cleanupWhitespace(text) {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

// A mangled 1-2 word fragment isn't useful to a parent and reads as broken --
// drop the whole note rather than show it.
const MIN_WORDS_AFTER_REDACTION = 3;

// Returns { text, dropped, flagged, reason }. `text` is null when dropped.
export function sanitizeNoteText(text) {
  if (!text) return { text, dropped: false, flagged: false, reason: null };

  if (severeTest.test(text)) {
    return { text: null, dropped: true, flagged: true, reason: "severe" };
  }

  if (!profanityTest.test(text)) {
    return { text, dropped: false, flagged: false, reason: null };
  }

  const cleaned = cleanupWhitespace(text.replace(profanityReplace, ""));
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_WORDS_AFTER_REDACTION) {
    return { text: null, dropped: true, flagged: true, reason: "profanity-unsalvageable" };
  }
  return { text: cleaned, dropped: false, flagged: true, reason: "profanity" };
}

// Applies the gate to a list of {..., note_text} rows (the shape
// buildAthleteReport / coachesReport pass around). Never mutates in place;
// drops anything unsalvageable, rewrites anything redactable, passes through
// everything else untouched.
export function sanitizeNotes(notes) {
  const kept = [];
  for (const n of notes || []) {
    const result = sanitizeNoteText(n.note_text);
    if (result.dropped) continue;
    kept.push(result.flagged ? { ...n, note_text: result.text } : n);
  }
  return kept;
}
