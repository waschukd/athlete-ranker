// Client-safe, non-blocking heads-up for the evaluator scoring notes field.
// Evaluator notes go out VERBATIM to the family -- quoted on the free player
// report, quoted again in the paid Development Report, and fed as source
// material into the AI parent narrative prompt. Nothing sanitizes or reviews
// them before that happens, so this is a save-time nudge, not a filter: it
// never blocks or alters what gets saved, it just flags wording worth a
// second look before it reaches a parent.
//
// Deliberately conservative (word-boundary, common profanity/harsh-tone words
// only) to avoid false positives on ordinary hockey vocabulary ("shot",
// "stick", "class"). A platform-wide scan of 985 real notes flagged zero, so
// this is a rare-case safety net, not something evaluators should expect to
// see often.
// Exact word forms only -- no wildcard suffix. A trailing \w* would make
// "ass" match inside "assist" (core hockey vocabulary) and "hell" match
// inside "hello", so common inflections are spelled out explicitly instead.
const FLAG_WORDS = [
  "fuck", "fucking", "shit", "shitty", "damn", "hell", "ass", "asshole", "bitch", "crap", "crappy",
  "suck", "sucks", "sucked", "sucking",
  "stupid", "dumb", "idiot", "idiotic", "retard", "retarded",
  "lazy", "laziest", "terrible", "worst", "hate", "hates", "hated", "hating",
  "garbage", "pathetic",
];
const PATTERN = new RegExp(`\\b(${FLAG_WORDS.join("|")})\\b`, "i");

export function checkNoteTone(text) {
  const match = PATTERN.exec(text || "");
  return { flagged: !!match, match: match?.[0] || null };
}
