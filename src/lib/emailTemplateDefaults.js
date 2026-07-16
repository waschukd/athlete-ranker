// Client-safe template defaults + merge. No DB import — the cut modal renders a
// live preview in the browser, and lib/emailTemplates.js (server) re-exports
// these so there is exactly one copy of the wording.

// {{player_name}} / {{ org_name }} style merge. Unknown fields become "".
export function renderTemplate(str, vars) {
  return (str || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
}

// Written to be read by the kid, not just the parent — that's the brief, and it
// drives every word choice here:
//  - addressed to the player, not about them
//  - never "cut", "unfortunately", "did not make it", "was not selected"
//  - the placement is stated plainly (no false hope) but framed as where they're
//    going, not what they missed
//  - effort is credited before the outcome, and the door is left open
export const DEFAULT_TEMPLATES = {
  player_cut: {
    label: "Evaluation placement",
    description:
      "Sent to parents when a player is moved out of a division. Written to be read by the player too — keep it warm.",
    fields: ["player_name", "org_name", "from_category", "to_category"],
    subject: "Your {{to_category}} placement — {{org_name}}",
    body: `Hi {{player_name}},

Thank you for coming out to {{from_category}} evaluations. You put in the work on the ice, and our evaluators noticed the effort you brought to every session.

After watching all of the sessions closely, we've placed you in {{to_category}} for this season. It's the group where we think you'll get the most ice time, the most touches on the puck, and the best chance to keep growing your game.

Evaluations are only ever a snapshot of a few days. Lots of players have their best season right where you're headed, and we'll be watching for it.

Keep an eye out for your next scheduled session — details are on the way.

See you at the rink,
{{org_name}}`,
  },

  welcome: {
    label: "Welcome email",
    description: "The first email parents receive when a division opens for evaluations.",
    fields: ["player_name", "org_name", "category_name", "sp_name"],
    subject: "Welcome to {{org_name}} Evaluations",
    // Starting point shown in the editor. Note the send path (notify-parents)
    // uses its own richer built-in layout unless an org saves an override — this
    // is what they start editing from, not what sends by default.
    body: `Hi! Welcome to {{org_name}} evaluations for {{category_name}}.

Here's how the process works: your skater will be evaluated over several sessions. {{player_name}}'s first ice time is below, and all following times are emailed after each session once every group has finished.

We're excited to have {{player_name}} take part. See you at the rink!`,
  },
};

// Sample values for the editor's live preview.
export const SAMPLE_VARS = {
  player_name: "Timmy",
  org_name: "Riverside Minor Hockey",
  category_name: "U13 AA",
  sp_name: "Competitive Thread",
  from_category: "U13 AA",
  to_category: "U13 A",
};

export const TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES);

export function defaultTemplate(key) {
  return DEFAULT_TEMPLATES[key] || null;
}
