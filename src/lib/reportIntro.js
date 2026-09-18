// Age-category-specific opening copy for the parent report, shown before the
// AI narrative paragraph. Real incident: a first draft of this wrote
// "entering U9/U7 hockey" as if a single player could be in two age brackets
// at once -- there is no U7 bracket anywhere in the platform, and every
// player is in exactly ONE. This keys off the athlete's real category name
// only, never guesses or combines brackets.
//
// Real age brackets in the platform (confirmed against age_categories):
// U9, U11, U13, U15, U16, U18, U20. The category name can carry a tier
// suffix (AA / Community / House / Hp / Tier 1 / Jr Kings / Goalies) --
// that's the skill TIER, not the age, so only the leading "U<number>" is
// used to select copy.
//
// Each bracket gets its own distinct paragraph, written to the age -- never
// one generic paragraph reused everywhere. Dan's correction on the first
// draft: at U9 these kids are realistically 5-6 years old -- it's about
// building a love of the game and simple entry-level habits, not "habits
// get set here" language, which is far too heavy for that age. From U11 up,
// habits genuinely are the thing that compounds, so that framing holds.
const INTROS = {
  9: (firstName) =>
    `${firstName} just finished their evaluation, and this is where hockey starts. At U9, the goal isn't to lock anything in — it's building a love for the game and simple, entry-level habits: showing up with energy, listening, and having fun while working hard. Skating still matters most at this age, since everything else in hockey builds on top of it, but there's no rush to have it perfected yet.`,
  11: (firstName) =>
    `${firstName} just finished their evaluation. At U11, skating is still the foundation, but now it's skating with a purpose: carrying the puck, making a play, competing for it in a battle. The habits a player brings to the rink — how hard they work, how well they listen, how they respond to a mistake — are becoming part of who they are as a player. What gets reinforced now, good or bad, tends to stick.`,
  13: (firstName) =>
    `${firstName} just finished their evaluation. U13 is a real turning point: the gap between players who compete hard every shift and players who don't starts to show up clearly, and it starts to matter for what team a player makes. Skating and skill are still developing, but habits now do a lot of the work — compete level, effort away from the puck, and how a player handles pressure. This is one of the last stages where a habit is still easy to install rather than something that has to be unlearned, which makes the next year or two especially important.`,
  15: (firstName) =>
    `${firstName} just finished their evaluation. The game at U15 gets bigger, faster, and more physical, and it exposes anything that hasn't been fully built yet: skating edges, compete level, decision-making under pressure. By now, habits are largely set, and they compound — a player who competes hard every night keeps separating from one who doesn't, and that gap grows faster than it used to. The most valuable thing a player can do here isn't add something new; it's sharpen what they already know how to do.`,
  16: (firstName) =>
    `${firstName} just finished their evaluation. At U16, the players separating from the pack are rarely the ones with one flashy tool — they're the ones reliably good at the details, shift after shift: winning small battles, making the simple play, skating with real purpose. Most players at this level already have real skill, so habits are the differentiator now. The work from here is consistency and refinement, not reinvention.`,
  18: (firstName) =>
    `${firstName} just finished their evaluation. U18 is late-stage development — the habits window that's been open since the youngest ages is closing, and what a player has built into their game by now is largely what carries into whatever comes next, whether that's junior, prep, or college-track hockey. The margins that matter most here are small: consistency, competing every shift, and being reliable in a role.`,
  20: (firstName) =>
    `${firstName} just finished their evaluation. At U20, development is mostly about polish and reliability rather than building anything new — the habits and tools a player has are the ones they'll play with. What separates players at this level is consistency under pressure and the small details that show up over a full season, not any one highlight.`,
};

// Fallback for any bracket that isn't one of the seven above (a future
// category, or a name that doesn't parse) -- generic but still honest about
// the habits-first framing, never a guess at a specific age.
function genericIntro(firstName) {
  return `${firstName} just finished their evaluation. At every age, the habits a player builds now — how they work, compete, and respond to a mistake — are far easier to install today than to change later, and they become the foundation everything else builds on.`;
}

// Every bracket closes on the same line, appended once here rather than
// repeated in each paragraph above -- Dan's instruction.
const CLOSING = " This report covers what evaluators saw and measured throughout the evaluation.";

// categoryName e.g. "U13 AA", "U9 House", "U15 Tier 1". Extracts the leading
// age number only -- the suffix is a skill tier, not part of the age.
export function getReportIntro(categoryName, firstName) {
  const name = firstName || "This player";
  const match = /^U(\d+)/i.exec((categoryName || "").trim());
  const age = match ? parseInt(match[1], 10) : null;
  const builder = age != null ? INTROS[age] : null;
  const body = builder ? builder(name) : genericIntro(name);
  return body + CLOSING;
}
