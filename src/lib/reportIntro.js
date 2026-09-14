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
// one generic paragraph reused everywhere. Common thread across all of them
// (Dan's framing): habits are far easier to install now than to change
// later, so what gets emphasized shifts with the age.

const INTROS = {
  9: (firstName) =>
    `${firstName} just finished their evaluation, and this is where hockey really begins. At U9, the single most important thing to build is skating -- every other skill in the game sits on top of it, and a player who skates well can be taught almost anything else later. This is also the age where habits form for good: how a player works, listens, and carries themselves on the ice gets set here, and habits installed now are dramatically easier to build than to change once they're a few years older. There's no need to rush anything else -- skating and good habits are the whole job at this age, and everything after this report is in service of that.`,
  11: (firstName) =>
    `${firstName} just finished their evaluation. U9 was about laying the skating foundation -- U11 is where that foundation starts to get tested and built on. Skating is still the priority, but now it's skating WITH a purpose: carrying the puck, making a play, competing for it in a battle. The habits a player brought into this age -- how hard they work, how well they listen, how they respond to a mistake -- are becoming part of who they are as a player, which is exactly why this stage matters so much. What gets reinforced now, good or bad, tends to stick.`,
  13: (firstName) =>
    `${firstName} just finished their evaluation. U13 is a real turning point -- the gap between players who compete hard every shift and players who don't starts to show up clearly, and it starts to matter for what team a player makes. Skating and skill are still being built, but habits are now doing a lot of the work: compete level, effort away from the puck, and how a player handles pressure are becoming the difference-makers. This is close to the last stretch where a habit is still easy to install rather than something that has to be unlearned -- which makes what happens over the next year or two especially important.`,
  15: (firstName) =>
    `${firstName} just finished their evaluation. The game at U15 gets bigger, faster, and more physical, and it exposes anything that hasn't been fully built yet -- skating edges, compete level, decision-making under pressure. By now, habits are largely set, for better or worse, and they compound: a player who competes hard every night keeps separating from one who doesn't, and that gap grows faster at this age than it did before. The most valuable thing a player can do here isn't add something new -- it's sharpen and consistently apply what they already know how to do.`,
  16: (firstName) =>
    `${firstName} just finished their evaluation. At U16, the players separating from the pack are rarely the ones with one flashy tool -- they're the ones who are reliably good at the details, shift after shift: winning small battles, making the simple play, skating with real purpose. Habits are the differentiator now more than raw skill is, because most players at this level have real skill. The work from here is about consistency and refinement, not reinvention.`,
  18: (firstName) =>
    `${firstName} just finished their evaluation. U18 is late-stage development -- the habits window that's been open since the youngest ages is closing, and what a player has built into their game by now is largely what they'll take into whatever comes next, whether that's junior, prep, or college-track hockey. The margins that matter most here are small and detail-driven: consistency, competing every shift, and being reliable in a role. This report is about identifying exactly where those margins can still move.`,
  20: (firstName) =>
    `${firstName} just finished their evaluation. At U20, development is mostly about polish and reliability rather than building anything new from scratch -- the habits and tools a player has are the ones they'll play with. What separates players at this level is consistency under pressure and the small details that show up over a full season, not any one highlight. This report is meant to point at exactly which of those details are worth the remaining time and attention.`,
};

// Fallback for any bracket that isn't one of the seven above (a future
// category, or a name that doesn't parse) -- generic but still honest about
// the habits-first framing, never a guess at a specific age.
function genericIntro(firstName) {
  return `${firstName} just finished their evaluation. At every age, the habits a player builds now -- how they work, compete, and respond to a mistake -- are far easier to install today than to change later, and they're the foundation everything else gets built on. This report is meant to give a clear, honest picture of where things stand right now.`;
}

// categoryName e.g. "U13 AA", "U9 House", "U15 Tier 1". Extracts the leading
// age number only -- the suffix is a skill tier, not part of the age.
export function getReportIntro(categoryName, firstName) {
  const name = firstName || "This player";
  const match = /^U(\d+)/i.exec((categoryName || "").trim());
  if (!match) return genericIntro(name);
  const age = parseInt(match[1], 10);
  const builder = INTROS[age];
  return builder ? builder(name) : genericIntro(name);
}
