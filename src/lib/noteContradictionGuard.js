// Cross-references a note's plain-language skill claim against the
// athlete's own measured performance in that same skill area, and drops the
// note when the two could not both be true right now (Dan's example: a
// bottom-ranked skater must never get a "good skater" comment quoted next to
// their actual grade).
//
// Distinct from the note-vs-note consistency check already in
// parentNarrative.js (that one only checks that the AI's SELECTED notes
// agree with EACH OTHER across sessions -- it never looks at the skill/
// testing numbers). This is the missing piece: note vs. the data itself.
//
// Deliberately narrow, on purpose: only claims about SKATING are checked,
// since that's the one area evaluators consistently write a plain-language
// verdict about ("good skater" / "weak skater") rather than a technical
// note. A claim this doesn't recognize just passes through unchecked --
// never a false drop of an unrelated note.

const SKATE_TOPIC = /\b(skat(e|es|er|ers|ing)|edges?|edgework|crossovers?|stride|footwork)\b/i;

const POSITIVE_NEAR_SKATE = new RegExp(
  `\\b(good|great|excellent|elite|strong|solid|smooth|fast|quick|explosive|advanced|top[- ]?tier)\\b[\\s\\w,'-]{0,25}${SKATE_TOPIC.source}` +
  `|${SKATE_TOPIC.source}[\\s\\w,'-]{0,25}\\b(good|great|excellent|elite|strong|solid|smooth|fast|quick|explosive|advanced|top[- ]?tier)\\b`,
  "i"
);

const NEGATIVE_NEAR_SKATE = new RegExp(
  `\\b(weak|weaker|weakest|slow|struggl\\w*|poor|behind|lacking?)\\b[\\s\\w,'-]{0,25}${SKATE_TOPIC.source}` +
  `|${SKATE_TOPIC.source}[\\s\\w,'-]{0,25}\\b(weak|weaker|weakest|slow|struggl\\w*|poor|behind|lacking?)\\b` +
  `|\\bneeds? (to )?work on\\b[\\s\\w,'-]{0,15}${SKATE_TOPIC.source}`,
  "i"
);

// Real incident (2nd round): even with average-based standing, a scan of
// 1045 real skating-related notes still flagged 97 as "contradictions" --
// manual review showed the overwhelming majority were ordinary, nuanced
// coaching notes ("Good skater who likes to drive wide, needs to work on
// controlling the puck") that mix a real strength with an unrelated, real
// area to improve. That's normal coaching, not a contradiction. Requiring
// the claim to be BARE -- no hedge/qualifier anywhere in the note -- cut the
// real-data false-positive rate from 97 down to 8 (residual misses are
// proximity-regex limits, e.g. failing to see "difficult to get a strong
// stride" as a negative just because "strong" sits near "stride" -- a
// natural-language judgment call this module deliberately doesn't attempt;
// see the DATA-CONSISTENCY rule in parentNarrative.js for the AI-driven
// second pass that catches what this coarse net misses).
const HEDGE = /\b(need|needs|needed|could|should|can|but|however|decent|pretty|okay|ok|room to|still|continue|continuing|though|except|aside from|otherwise|work on|working on)\b/i;

function skatingClaim(text) {
  if (!text || !SKATE_TOPIC.test(text)) return null;
  if (HEDGE.test(text)) return null;
  if (POSITIVE_NEAR_SKATE.test(text)) return "positive";
  if (NEGATIVE_NEAR_SKATE.test(text)) return "negative";
  return null;
}

// Reads the athlete's own standing in whatever scoring category actually
// names skating, from the same skillProfile buildAthleteReport() already
// computes -- against the GROUP AVERAGE, not the group's single best skater.
// Real incident: an early version compared against the group's top score,
// which classified most of a tier as "bottom" simply for not being the one
// best skater in their own group -- a real-data scan against 1045 live notes
// flagged ~14% of them, and manual review showed almost all were ordinary
// skaters getting fair "good skater" praise, not actual contradictions.
// Comparing to the group's own average is the fair bar for "genuinely
// below/above the pack." Null (no opinion) when there's no matching category
// or no player score yet -- nothing to contradict, so any claim passes
// through.
function skatingStanding(skillProfile) {
  const row = (skillProfile || []).find(r => /skat/i.test(r.name || ""));
  if (!row || row.player == null || row.group == null || row.group === 0) return null;
  const ratio = row.player / row.group;
  if (ratio <= 0.6) return "bottom";
  if (ratio >= 1.6) return "top";
  return "middle";
}

export function violatesSkatingContradiction(noteText, skillProfile) {
  const claim = skatingClaim(noteText);
  if (!claim) return false;
  const standing = skatingStanding(skillProfile);
  if (!standing) return false;
  return (claim === "positive" && standing === "bottom") || (claim === "negative" && standing === "top");
}

// Applies the guard to a list of {..., note_text} rows.
export function applyContradictionGuard(notes, skillProfile) {
  return (notes || []).filter(n => !violatesSkatingContradiction(n.note_text, skillProfile));
}
