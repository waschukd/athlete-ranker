// Static sample report data — for the public "see what you're buying" link
// Directors/SPs share BEFORE a real evaluation link goes out. Deliberately
// NOT pulled from the database: it must always be available, never depend on
// a live season's data existing, and never risk showing a real kid's real
// information to someone who hasn't paid. "Davey Donald" is a fictional
// player; any resemblance to a real athlete is coincidental.
//
// Built to show off the report at its most illustrative: a real, common
// pattern (a strong skater who's still developing the mental side of the
// game) with contrasting skill grades, real testing numbers, session-over-
// session progress, and a realistic spread of evaluator notes -- all
// internally consistent (the notes agree with the numbers), matching the
// exact thing reportData.js's sanitization and contradiction-guard pipeline
// enforces for real reports.

export const SAMPLE_REPORT_DATA = {
  athlete: { first_name: "Davey", last_name: "Donald", position: "Forward", external_id: null },
  category: { name: "U15 AA", scoring_scale: 10 },
  org_name: "Sample Hockey Association",
  serviceProvider: null,
  standing: { percentile: 84, tier: "Above Average", band: "Top 25%", total: 44 },
  ranking: null,
  total_athletes: 44,

  skillProfile: [
    { scoring_category_id: "sample-skating", name: "Skating", display_order: 1, player: 9.0, group: 6.8, top: 9.0 },
    { scoring_category_id: "sample-puck", name: "Puck Skills", display_order: 2, player: 7.0, group: 6.5, top: 8.5 },
    { scoring_category_id: "sample-sense", name: "Hockey Sense", display_order: 3, player: 3.5, group: 6.4, top: 8.5 },
    { scoring_category_id: "sample-shooting", name: "Shooting", display_order: 4, player: 6.5, group: 6.0, top: 7.8 },
    { scoring_category_id: "sample-compete", name: "Compete & Effort", display_order: 5, player: 7.5, group: 6.7, top: 8.5 },
  ],
  goalieSkillsProfile: [],

  testingProfile: [
    { test_name: "Forward Sprint", player_best: 4.65, group_avg: 5.10, group_best: 4.65, lower_is_better: true },
    { test_name: "Backward Sprint", player_best: 5.80, group_avg: 6.35, group_best: 5.55, lower_is_better: true },
    { test_name: "Weave Agility w/ Puck", player_best: 10.20, group_avg: 11.40, group_best: 10.20, lower_is_better: true },
    { test_name: "Transition Agility L", player_best: 6.40, group_avg: 6.90, group_best: 6.10, lower_is_better: true },
    { test_name: "Stop & Start", player_best: 4.10, group_avg: 4.45, group_best: 3.95, lower_is_better: true },
  ],

  progress: [
    { session_number: 1, player: 6.6, group: 6.4 },
    { session_number: 2, player: 6.9, group: 6.5 },
    { session_number: 3, player: 7.2, group: 6.6 },
  ],

  // Realistic evaluator voice, deliberately consistent with the numbers above
  // -- every note pairing a skating compliment with a hockey-sense critique is
  // exactly the pattern the contradiction guard (noteContradictionGuard.js)
  // is built to protect, applied here by hand since this bypasses the DB.
  notes: [
    { session_number: 1, note_text: "Excellent skater — one of the fastest in the group. Needs to read the play better before deciding where to go." },
    { session_number: 1, note_text: "Elite feet and edges. Struggles to see the ice — often caught puck-watching instead of supporting the play." },
    { session_number: 1, note_text: "Great first three strides, wins every race to loose pucks. Decision-making with the puck is rushed — needs to slow the game down mentally." },
    { session_number: 2, note_text: "Skating is a real weapon. Positioning away from the puck needs work — gets caught flat-footed on defensive coverage." },
    { session_number: 2, note_text: "Very good speed and balance on his edges. Reads develop late — often a step behind as the play develops." },
    { session_number: 2, note_text: "Strong skater, hard on pucks. Needs to recognize when to pass instead of trying to beat three players himself." },
    { session_number: 3, note_text: "One of the better skaters in the session. Awareness of teammates and support positioning is the clear next step." },
    { session_number: 3, note_text: "Skates like a pro. Hockey IQ needs the most work — struggles to anticipate where the puck is going next." },
  ],
  curatedNotes: null, // falls back to the raw list above, same as any report with no live AI call

  narrativeSummary: "Davey's evaluation tells a clear, consistent story: his skating is a genuine standout — he graded at 9.0, right at the top of the group, and it shows up everywhere on the ice, from his first three strides to his edge work in open space. He backed it up on the clock too, posting the fastest weave-agility time in the group. The next step is entirely between the ears — several evaluators independently flagged the same thing, that Davey is often a step behind the play mentally, especially away from the puck, which is exactly why hockey sense is the clear priority in the plan below. The tools are elite; the reads are catching up.",

  trainingProviders: [],
};

// A second static sample, org-branded and deliberately built around a
// genuinely AVERAGE player -- no standout skill, no glaring weakness -- for
// an association (Millwoods) that wants to show members what a middle-of-
// the-pack report looks like, not just the "hidden gem" story above.
// "Tyler Bennett" is fictional; any resemblance is coincidental. Selected via
// /report/sample?org=millwoods (see page.jsx / pdf/page.jsx) -- the default,
// unparameterized link is untouched and still shows Davey Donald above.
export const SAMPLE_REPORT_DATA_MILLWOODS = {
  athlete: { first_name: "Tyler", last_name: "Bennett", position: "Forward", external_id: null },
  category: { name: "U13", scoring_scale: 10 },
  org_name: "Millwoods Hockey",
  serviceProvider: null,
  standing: { percentile: 51, tier: "Average", band: "Middle Third", total: 40 },
  ranking: null,
  total_athletes: 40,

  // A genuine blend of 4.5s/5s/5.5s -- true middle of a 10-point scale, not
  // the 6-6.5 range the first pass used (that reads as above average, not
  // average). Group values sit close by design, same reasoning.
  skillProfile: [
    { scoring_category_id: "sample-skating", name: "Skating", display_order: 1, player: 5.0, group: 5.2, top: 9.0 },
    { scoring_category_id: "sample-puck", name: "Puck Skills", display_order: 2, player: 4.5, group: 4.6, top: 8.8 },
    { scoring_category_id: "sample-sense", name: "Hockey Sense", display_order: 3, player: 5.5, group: 5.3, top: 8.6 },
    { scoring_category_id: "sample-shooting", name: "Shooting", display_order: 4, player: 4.5, group: 4.8, top: 8.2 },
    { scoring_category_id: "sample-compete", name: "Compete & Effort", display_order: 5, player: 5.0, group: 5.1, top: 9.2 },
  ],
  goalieSkillsProfile: [],

  // Objective testing sits noticeably further off the pace than the skill
  // grades alone would suggest -- per Dan: an average-GRADED skater is
  // usually further from the top on the clock than on the eye test, since
  // the timed drills are a harder, more objective bar than a subjective
  // in-game read. Player times sit toward the back half of the field here,
  // not dead-center on group_avg the first pass used.
  testingProfile: [
    { test_name: "Forward Sprint", player_best: 5.35, group_avg: 5.08, group_best: 4.55, lower_is_better: true },
    { test_name: "Backward Sprint", player_best: 6.65, group_avg: 6.32, group_best: 5.60, lower_is_better: true },
    { test_name: "Weave Agility w/ Puck", player_best: 11.95, group_avg: 11.30, group_best: 10.05, lower_is_better: true },
    { test_name: "Transition Agility L", player_best: 7.20, group_avg: 6.80, group_best: 6.05, lower_is_better: true },
    { test_name: "Stop & Start", player_best: 4.65, group_avg: 4.38, group_best: 3.90, lower_is_better: true },
  ],

  // Genuinely uneven session to session -- real inconsistency, not a smooth
  // climb -- while the group's own average holds steadier. That variance IS
  // what "average" usually looks like in practice: not a flat, dependable
  // 5-out-of-10 every night, but flashes mixed with quiet stretches.
  progress: [
    { session_number: 1, player: 5.5, group: 5.1 },
    { session_number: 2, player: 4.2, group: 5.0 },
    { session_number: 3, player: 5.2, group: 5.1 },
  ],

  // Per Dan: an average player reads as INCONSISTENT, not steady/dependable
  // -- flashes mixed with stretches where they're not a factor, a different
  // player from shift to shift. No note uses words like "solid," "reliable,"
  // "dependable" or "consistent" -- that's the opposite of what average
  // actually looks like on the ice.
  notes: [
    { session_number: 1, note_text: "Up and down all game — a couple of shifts with real jump, then long stretches where he wasn't really a factor." },
    { session_number: 1, note_text: "Flashed some good hands a few times but it didn't carry — hard to get a consistent read on him." },
    { session_number: 1, note_text: "Some good pushes with the puck mixed in, but he disappears for chunks of the game in between." },
    { session_number: 2, note_text: "Different player shift to shift tonight — competed hard a few times, coasted through several others." },
    { session_number: 2, note_text: "Effort came and went. When he's engaged he's fine, but that wasn't every shift." },
    { session_number: 2, note_text: "A rough night overall — a couple flashes of what he can do, but mostly quiet." },
    { session_number: 3, note_text: "Better tonight in stretches, but still up and down — a strong shift here and there surrounded by shifts on the perimeter." },
    { session_number: 3, note_text: "Mixed bag again across the session — needs to find that level every shift, not just some of them." },
  ],
  curatedNotes: null,

  narrativeSummary: "Tyler's evaluation is honest about what it shows: an inconsistent, up-and-down game rather than a steady one. Evaluators kept landing on the same read across all three sessions — flashes of real ability mixed with long stretches where he wasn't a factor — and the session-to-session numbers back that up, bouncing rather than holding a flat line the way the group's own average did. The clock tells a similar story: his testing times sit further off the pace than his in-game skill grades alone would suggest, which is common for a player whose tools haven't caught up to what shows up in game action yet. There's no standout strength to lean on and no single glaring weakness either — the real target is showing up at the level he's already flashed on a more consistent, shift-to-shift basis.",

  trainingProviders: [],
};

// A third static sample, for associations that run NO objective testing --
// VMHA's U11 M shape: one skills skate and two games, four evaluator criteria,
// 26 skaters, nothing on the clock. Worth its own sample because the absence
// changes how the report reads: with no testing section there is no objective
// counterweight to the evaluator grades, so the narrative has to carry more of
// the explanation and the progress line does more of the work.
//
// "Elliot Vance" is fictional; the surname appears nowhere in any roster.
export const SAMPLE_REPORT_DATA_VMHA = {
  athlete: { first_name: "Elliot", last_name: "Vance", position: "Forward", external_id: null },
  category: { name: "U11 M", scoring_scale: 10 },
  org_name: "Vermilion Minor Hockey",
  serviceProvider: null,
  standing: { percentile: 62, tier: "Solid Contributor", band: "Top 40%", total: 26 },
  ranking: null,
  total_athletes: 26,

  // The four criteria VMHA actually scores. A genuinely common U11 profile:
  // the effort is there every shift and the hands are behind the motor.
  skillProfile: [
    { scoring_category_id: "sample-vmha-skating", name: "Skating", display_order: 1, player: 7.0, group: 6.3, top: 8.5 },
    { scoring_category_id: "sample-vmha-puck", name: "Puck Skills", display_order: 2, player: 5.0, group: 6.1, top: 8.0 },
    { scoring_category_id: "sample-vmha-compete", name: "Effort / Compete", display_order: 3, player: 8.0, group: 6.6, top: 8.5 },
    { scoring_category_id: "sample-vmha-sense", name: "Hockey Sense", display_order: 4, player: 6.5, group: 6.2, top: 8.0 },
  ],
  goalieSkillsProfile: [],

  // No testing -- the report drops that whole section rather than showing an
  // empty one, which is exactly what a VMHA parent will see.
  testingProfile: [],

  // One skills skate, then two games. The skills skate grades a touch lower
  // for everyone (drills expose hands), which is why the group line moves too.
  progress: [
    { session_number: 1, player: 6.3, group: 6.1 },
    { session_number: 2, player: 6.8, group: 6.3 },
    { session_number: 3, player: 7.0, group: 6.4 },
  ],

  notes: [
    { session_number: 1, note_text: "Works hard through every drill, first one moving on the whistle. Puck handling breaks down when he has to do it at speed." },
    { session_number: 1, note_text: "Good posture and strong edges for this age. Hands are a step behind his feet -- loses the puck on tight turns." },
    { session_number: 1, note_text: "Compete level stands out. Needs reps stickhandling with his head up rather than watching the puck." },
    { session_number: 2, note_text: "Relentless on the forecheck, forced two turnovers on his own. Rushes the play once he gets it instead of making a simple pass." },
    { session_number: 2, note_text: "Honest two-way shift every time out. Puck skills under pressure are the limiting factor right now." },
    { session_number: 2, note_text: "Reads the play better than most in this group -- supports his defence without being told. Hands need to catch up to his motor." },
    { session_number: 3, note_text: "Best game of the three. Kept his feet moving and made a good read on the backcheck. Still fumbles the first touch on a hard pass." },
    { session_number: 3, note_text: "Coachable and competes. If the puck skills come along he is a real player -- everything else is already there." },
  ],
  curatedNotes: null,

  narrativeSummary: "Elliot's three skates tell a consistent story, and every evaluator landed on the same two things. What stands out first is the compete -- he graded 8.0 there, comfortably the highest of his four marks and well clear of the group, and the notes back it up shift after shift: first to move, forcing turnovers, honest on the backcheck. His skating is a genuine asset too. The gap is his hands. Puck skills came in at 5.0, the one mark below the group average, and it is the same note in all three sessions -- the puck gets away from him when he has to handle it at speed or take a hard first pass. That is the single thing holding the rest of his game back, and it is also the most trainable thing on this list at his age. He got better across the weekend, finishing his strongest in the last game, which is exactly the direction you want to see.",

  trainingProviders: [],
};
