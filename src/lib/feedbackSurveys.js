// End-of-season feedback questions. Wording matches the retro doc; the open
// comments box at the bottom catches anything the questions missed.
export const FEEDBACK_SURVEYS = {
  association_admin: {
    title: "How the evaluations went, for association admins",
    intro: "Please answer as specifically as you can. A real example beats a general rating.",
    questions: [
      { key: "onboarding", type: "text", text: "Before the season started, how did you learn your schedule, check-in codes, and evaluator assignments? What was clear, and what caused confusion?" },
      { key: "frustration", type: "text", text: "During tryouts, what was the single most frustrating moment for you or your registrar? What would have prevented it?" },
      { key: "trust_rankings", type: "choice", text: "When you finalized teams, did you trust the rankings enough to act on them?", options: ["Yes, fully", "Mostly", "Partly", "No"] },
      { key: "parent_questions", type: "text", text: "When a parent asked about a score or a report, what did you tell them, and what did you wish you had?" },
      { key: "team_builder", type: "text", text: "Did the team builder (tiers and snake drafts) match how you actually split a pool? What would you change?" },
      { key: "avoided", type: "text", text: "Which part of the app did you avoid, and what did you do instead?" },
      { key: "switch", type: "text", text: "What would make you move your registration and evaluation fully onto this platform next season? What would make you keep a parallel system?" },
      { key: "hours", type: "text", text: "Roughly how many hours a week did admin take during the season, and where did most of the time go?" },
      { key: "report_distribution", type: "choice", text: "Do you want reports sent through us, or would you rather control the distribution yourself?", options: ["Send through Sideline Star", "I'd rather control it", "Not sure yet"] },
      { key: "report_feedback", type: "text", text: "After the development reports went out, did any parents come back to your association about them? What did they ask or say, and how was it handled?" },
      { key: "never_change", type: "text", text: "What is one thing we should never change?" },
    ],
  },
  evaluator: {
    title: "How the evaluations went, for evaluators",
    intro: "These are about your experience on the floor. Short answers are fine.",
    questions: [
      { key: "time_to_first_score", type: "text", text: "How long did it take to get from your dashboard to scoring the first player? What slowed you down?" },
      { key: "checkin_match", type: "text", text: "Did check-in (player groups, jersey numbers, team colors) match what you saw on the floor? Where did it differ?" },
      { key: "scoring_screen", type: "text", text: "Which scoring screen was hardest to use, or easiest to mistype? What would make it safer?" },
      { key: "consensus_feedback", type: "text", text: "Did the consensus and bias feedback help you, or did it feel like a judgment? What would make it useful?" },
      { key: "signups", type: "text", text: "Were session signups and openings easy to find? Did notifications help, or were they noise?" },
      { key: "fairness", type: "text", text: "You are measured on things like lateness, scoring speed, and cancellations. What would make that feel fair?" },
      { key: "return_next_season", type: "choice", text: "Would you evaluate for us again next year?", options: ["Yes", "Maybe", "No"] },
      { key: "notes_use", type: "text", text: "What did you use the evaluator notes for? What would make them more useful to you?" },
      { key: "profile", type: "text", text: "What would you want to see in your own profile, including hours and pay?" },
    ],
  },
};

export function surveyFor(audience) {
  return FEEDBACK_SURVEYS[audience] || null;
}
