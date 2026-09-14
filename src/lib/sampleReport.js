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
