"use client";

import { useState, createContext, useContext } from "react";
import { getReportIntro } from "@/lib/reportIntro";

// Shared premium-dark-by-default Development Report render. Pure
// presentational — give it a `data` object from lib/reportData.buildAthleteReport
// and it renders the full report. Used by both the authed director PDF
// (/player/report/pdf) and the token-gated paid-parent PDF (/report/[token]/pdf)
// so there is ONE report.
//
// Real feedback: the report is dense and reads long, and the original
// dark-only design is hard on the eyes for that. A light/dark toggle covers
// everything BELOW the cover (the actual content parents read); the cover
// stays permanently dark — that's the brand moment, not a reading surface,
// and it's a small enough section that the theme doesn't matter there. The
// toggle button is a plain <button>, which the print stylesheet already
// hides (`button { display: none !important }` under @media print), so
// whichever theme is on screen when someone prints/saves is what's captured.
const DARK = {
  bg: "#060B18", surface: "#0d141d",
  cardBg: "rgba(21,28,37,0.55)", cardBorder: "rgba(153,144,125,0.16)",
  panelBg: "rgba(230,193,91,0.06)", panelBorder: "rgba(230,193,91,0.25)",
  hair: "rgba(77,70,55,0.4)",
  accent: "#e6c15b", accentSoft: "rgba(230,193,91,0.12)", accentLine: "rgba(230,193,91,0.28)",
  text: "#dce3f0", textDim: "#c8bfab", gray: "#9b9280", muted: "#726a58", track: "#232a34",
  heading: "#ffffff", bodyStrong: "#e9ecf2", bodyText: "#e5e7ec", subtleText: "#aeb2bb",
  success: "#5fd08a", warning: "#e0944a",
  gridLine: "rgba(220,227,240,0.08)", seriesMuted: "#4d4637", barTarget: "#4a5468",
};

const LIGHT = {
  bg: "#faf7f0", surface: "#ffffff",
  cardBg: "#ffffff", cardBorder: "#e6e0d2",
  panelBg: "rgba(165,114,15,0.07)", panelBorder: "rgba(165,114,15,0.28)",
  hair: "rgba(30,26,15,0.12)",
  accent: "#a5720f", accentSoft: "rgba(165,114,15,0.10)", accentLine: "rgba(165,114,15,0.30)",
  text: "#241f14", textDim: "#5b5142", gray: "#786c56", muted: "#948a72", track: "#e7e1d2",
  heading: "#1c1710", bodyStrong: "#221c10", bodyText: "#2c2617", subtleText: "#59503e",
  success: "#1f7a45", warning: "#a85a1d",
  gridLine: "rgba(28,23,16,0.10)", seriesMuted: "#b7ab8f", barTarget: "#c9c0a8",
};

const ThemeContext = createContext(DARK);

const SANS = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace";

// "Then, in order" trailing clauses, rotated by list position -- real
// feedback: every item in this list used to end with the identical "gets
// easier once the foundation above is in place," which read as a template
// dump once there were 3+ items. Cycled rather than repeated so a longer
// list still reads like it was written, not generated.
const THEN_IN_ORDER_CLAUSE = [
  "; gets easier once the foundation above is in place.",
  "; builds naturally on that same foundation.",
  "; the next domino once the priority above starts to move.",
  "; rounds out the picture once the earlier work sticks.",
];

// Skill-card interpretation, by tier. Real feedback: every skill card in the
// same tier ("A genuine strength — at 8.6, Elliot is right at the top of the
// group (8.6). Keep it sharp and lean on it.") used the identical sentence,
// just with different numbers swapped in — reads like a template once a
// report has 3+ skills in the same tier. Rotated by the skill's position in
// the list (same pattern as THEN_IN_ORDER_CLAUSE above) so it varies without
// being random -- a report looks the same every time it's viewed or reprinted.
const STRENGTH_PHRASING = [
  (n, p, t) => `A genuine strength — at ${p}, ${n} is right at the top of the group (${t}). Keep it sharp and lean on it.`,
  (n, p, t) => `${n} is elite here — ${p} matches the very top of the group (${t}). A skill to build the rest of the game around.`,
  (n, p, t) => `Right at the group's ceiling — ${p} against a top of ${t}. This is already a weapon, not a work in progress.`,
  (n, p, t) => `A real strength to lean on — ${p}, matching the group's best (${t}). Keep reinforcing what's already working here.`,
];
const CLOSE_PHRASING = [
  (n, p, t, g) => `Close to the top — ${p} against a group top of ${t}, about ${g} away. A focused block of reps closes this fast.`,
  (n, p, t, g) => `Nearly there — only ${g} separates ${n}'s ${p} from the group's best (${t}). Worth a dedicated push.`,
  (n, p, t, g) => `${n} is within striking distance: ${p} vs. a top of ${t}, a gap of just ${g}. Small, focused reps get this the rest of the way.`,
  (n, p, t, g) => `A short climb left — ${g} shy of the group top (${t}) at ${p} right now. An efficient place to invest practice time.`,
];
const DEVELOPING_PHRASING = [
  (n, p, t, g) => `Coming along — ${p} with room to the top of the group (${t}), about ${g} to close. A clear place to put in work.`,
  (n, p, t, g) => `Developing steadily — ${p} today, ${g} behind the group's top mark of ${t}. A good, realistic target for the next block of training.`,
  (n, p, t, g) => `${n} sits at ${p}, ${g} off the group top (${t}). Real progress is available here with consistent reps.`,
  (n, p, t, g) => `Solid groundwork, more to build — ${p} against a group top of ${t} (${g} to go). A development priority, not a concern.`,
];
const FOCUS_PHRASING = [
  (n, p, t) => `The clearest area to attack — ${p} against a group top of ${t}. The single biggest opportunity to climb.`,
  (n, p, t) => `This is where the biggest gains are waiting — ${p} vs. a group top of ${t}. Prioritizing this skill moves the needle the most.`,
  (n, p, t) => `${n}'s furthest skill from the group's ceiling right now — ${p} against ${t}. The highest-leverage place to focus training.`,
  (n, p, t) => `The single biggest opportunity in this report — ${p} today, group top sits at ${t}. Focused work here pays off the most.`,
];
function skillInterpretation(idx, firstName, s) {
  if (s.player == null) return "";
  const f = (v) => (v != null ? v.toFixed(1) : "—");
  const p = f(s.player), t = f(s.top);
  const gap = s.top != null ? Math.round((s.top - s.player) * 10) / 10 : null;
  const g = gap != null ? gap.toFixed(1) : null;
  if (s.top != null && s.player >= s.top - 0.2) return STRENGTH_PHRASING[idx % STRENGTH_PHRASING.length](firstName, p, t);
  if (gap != null && gap <= 1.0) return CLOSE_PHRASING[idx % CLOSE_PHRASING.length](firstName, p, t, g);
  if (gap != null && gap <= 2.0) return DEVELOPING_PHRASING[idx % DEVELOPING_PHRASING.length](firstName, p, t, g);
  return FOCUS_PHRASING[idx % FOCUS_PHRASING.length](firstName, p, t);
}

function testInfo(name) {
  const n = (name || "").toLowerCase();
  // Weave/transition/stop checked BEFORE the bare "puck" fallback -- a drill
  // like "Weave With Puck" must get the agility description, not the generic
  // puck-carry-speed one, just because its name also contains "puck". Puck
  // still wins over a bare "forward" check below (a "Forward Sprint w/ Puck"
  // test is correctly described as puck-carry speed).
  if (n.includes("backward")) return "Straight-line backward speed — edge control, posture and defensive footspeed.";
  if (n.includes("transition") || n.includes("pivot")) {
    if (n.includes("left")) return "Pivots and direction changes turning to the left — footwork and clean transitions.";
    if (n.includes("right")) return "Pivots and direction changes turning to the right — footwork and clean transitions.";
    return "Pivots, footwork and how cleanly direction changes.";
  }
  if (n.includes("weave") || n.includes("agility") || n.includes("cone")) return "Tight turns and cuts through obstacles — balance, edge control and quickness in close.";
  if (n.includes("stop") || n.includes("caps") || n.includes("start")) return "Explosive stop-and-start — how fast they stop hard and get moving again the other way.";
  if (n.includes("puck")) return "Speed while controlling the puck — how much pace holds up with the puck on the stick.";
  if (n.includes("forward") || (n.includes("30m") && !n.includes("backward"))) return "Flat-out straight-line speed — pure acceleration and stride power.";
  if (n.includes("reaction")) return "First-step quickness off the whistle — explosiveness and reaction time.";
  return "";
}
const fmt = (v) => (v == null ? "—" : v.toFixed(2));

// Goalie skill keyword groups — the standard four goalie categories
// (Skating/Balance/Agility, Positioning/Angles/Net Coverage,
// Feet/Hands/Stick/Rebounds, Anticipation/Reading the Play). Checked first so a
// goalie's "Positioning" resolves to net coverage, not skater hockey-sense copy.
const G_MOVE = (n) => n.includes("mobil") || n.includes("skat") || n.includes("move") || n.includes("crease") || n.includes("balance") || n.includes("agil") || n.includes("edge") || n.includes("push") || n.includes("recover");
const G_POS = (n) => n.includes("position") || n.includes("angle") || n.includes("net") || n.includes("depth") || n.includes("cover") || n.includes("square");
const G_SAVE = (n) => n.includes("save") || n.includes("rebound") || n.includes("glove") || n.includes("blocker") || n.includes("hand") || n.includes("stick") || n.includes("feet") || n.includes("foot");
const G_READ = (n) => n.includes("anticip") || n.includes("read") || n.includes("track") || n.includes("iq") || n.includes("sense") || n.includes("compete");

// What each graded skill actually measures (skater four: Skating, Puck Skills,
// Hockey Sense, Effort & Compete; goalie four above) — keyword-matched so custom
// category names still resolve.
function skillInfo(name, isGoalie) {
  const n = (name || "").toLowerCase();
  if (isGoalie) {
    if (G_MOVE(n)) return "Crease movement, push power, edges and recovery — how efficiently he gets across the net and resets square for the next shot.";
    if (G_POS(n)) return "Angles, depth and net coverage — taking away shooting lanes by being square and set before the puck is released.";
    if (G_SAVE(n)) return "Save execution — glove, blocker, feet and stick, plus how cleanly he controls or steers rebounds away from danger.";
    if (G_READ(n)) return "Reading the play — tracking the puck through traffic and anticipating passes a beat before they happen.";
    return "";
  }
  if (n.includes("skat") || n.includes("edge") || n.includes("balance")) return "Edges, speed, balance and explosiveness on the ice.";
  if (n.includes("puck") || n.includes("stick") || n.includes("hand")) return "Control, protection and hands at game speed.";
  if (n.includes("iq") || n.includes("sense") || n.includes("position") || n.includes("hockey")) return "Reads, positioning and decisions with and without the puck.";
  if (n.includes("compete") || n.includes("effort") || n.includes("battle") || n.includes("work")) return "Work rate, battle level and consistency shift to shift.";
  if (n.includes("shot") || n.includes("shoot")) return "Release, accuracy and how the shot threatens off the rush.";
  if (n.includes("pass")) return "Vision and accuracy moving the puck.";
  return "";
}

// What the SKILL looks like operating at the top of the group — the target state
// behind each recommendation.
function skillElite(name, isGoalie) {
  const n = (name || "").toLowerCase();
  if (isGoalie) {
    if (G_MOVE(n)) return "quick, controlled pushes that arrive square and set, with the edges to hold the post and the recovery to be ready for the second shot";
    if (G_POS(n)) return "always square and at the right depth — taking away the net before the shot so saves look routine instead of desperate";
    if (G_SAVE(n)) return "quiet, controlled hands and feet that swallow pucks clean and steer rebounds to the corners, never back into the slot";
    if (G_READ(n)) return "reading plays a beat early — tracking the puck through screens and traffic and set before the shot ever arrives";
    return "calm, repeatable execution when the game speeds up and traffic builds in front";
  }
  if (n.includes("skat") || n.includes("edge") || n.includes("balance")) return "explosive first three steps, edges that hold through hard turns, and the speed to separate with the puck on the stick";
  if (n.includes("puck") || n.includes("stick") || n.includes("hand")) return "clean hands at full speed, pucks protected through contact, and the right play made under pressure instead of forced";
  if (n.includes("iq") || n.includes("sense") || n.includes("position") || n.includes("hockey")) return "a step ahead of the play — reading it before it develops, supporting the puck, and in the right spot away from it";
  if (n.includes("compete") || n.includes("effort") || n.includes("battle") || n.includes("work")) return "winning more than his share of battles, first on every loose puck, with the same motor in the third period as the first";
  if (n.includes("shot") || n.includes("shoot")) return "a quick, deceptive release he can get off in traffic and off the rush";
  if (n.includes("pass")) return "crisp, accurate puck movement that hits teammates in stride";
  return "consistent, high-level execution when the game speeds up";
}

// Position-specific habits that consistently show up well to evaluators —
// separate from the skill/testing plan above (which is about closing this
// athlete's specific gaps), this is general, position-appropriate advice for
// how to show well at the NEXT evaluation regardless of what gets worked on
// between now and then. "forward_defense" (a real position value in the
// data) gets a shorter combined list rather than the full 5 of each.
const FORWARD_TIPS = [
  "Be around the puck. Evaluators can't grade what they don't see — get to loose pucks and support the puck carrier.",
  "Forecheck hard and pressure the other team. Relentless pressure on the puck is one of the most visible things an evaluator watches for.",
  "Move the puck when it's warranted. Don't hold onto it out of habit — recognize the play that's actually there.",
  "Don't overhandle the puck. Making one extra move after the play is already there just gives it back.",
  "Follow your shot. Engage in the battles and rebounds in front of the net instead of watching it go in or wide.",
  "Backcheck hard. A forward who works hard on the defensive side stands out immediately in a group of players only thinking offense.",
  "Communicate. Calling for the puck and talking to teammates is an easy, visible signal of hockey sense.",
  "Make simple plays. The low-risk, right play beats the flashy one almost every time — that's what gets you noticed.",
  "Avoid risky plays in your own zone. A turnover in front of your own net costs far more than a missed opportunity anywhere else on the ice.",
  "Be aggressive on pucks and compete hard. It's always a race — the player who treats every puck like a race is the one who wins most of them.",
];
const DEFENSE_TIPS = [
  "Keep your head on a swivel. Constant awareness of where the play and your options are is one of the clearest signs of a defenseman evaluators trust.",
  "Play good angles. Taking away the right lane before contact beats reacting to the puck carrier after the fact.",
  "Keep a good stick on the puck. An active, well-placed stick disrupts plays without needing to commit your whole body.",
  "Communicate. Calling out coverage and options is an easy, visible signal of hockey sense on the back end.",
  "Make simple plays. The safe, right play out of your own zone beats the low-percentage one almost every time.",
  "Make a good first pass. A crisp, no-hesitation outlet pass is one of the most valued things a defenseman can show.",
  "Keep your feet moving with the puck. Standing still with it invites pressure — moving feet keep your options open.",
  "Box out in front of your own net. Clear the stick and body before the puck arrives, not after.",
  "Don't get beat to the middle. Force players wide, where they have fewer options and less time to make a play.",
  "Protect the puck under pressure at the blue lines. A turnover there — not just your own — can turn into a direct scoring chance against.",
];
const GOALIE_TIPS = [
  "Be square before the shot. Positioning ahead of the release matters more to evaluators than a spectacular reactive save.",
  "Control your rebounds. Steering pucks to the corners instead of back into the slot is one of the most heavily weighted things a goalie does.",
  "Communicate with your defense. Directing coverage and calling out threats in front of the net shows game awareness beyond just stopping pucks.",
  "Track the puck through traffic. Never lose sight of it behind a screen — evaluators notice a goalie who stays locked on through bodies.",
  "Recover fast after the first save. Being reset and ready for a second or third shot is weighted just as heavily as the first save itself.",
];
function positionTips(position, isGoalie) {
  if (isGoalie) return GOALIE_TIPS;
  const p = (position || "").toLowerCase();
  const isForward = p.includes("forward");
  const isDefense = p.includes("defense") || p.includes("defence");
  if (isForward && isDefense) return [...FORWARD_TIPS.slice(0, 3), ...DEFENSE_TIPS.slice(0, 3)];
  if (isDefense) return DEFENSE_TIPS;
  if (isForward) return FORWARD_TIPS;
  return null;
}

// What evaluators watch for in each goalie skills-session drill.
function drillBlurb(name) {
  const n = (name || "").toLowerCase();
  if (G_MOVE(n)) return "Lateral pushes and shuffles post-to-post — explosive, controlled movement, balance through scrambles, and a fast recovery back to square.";
  if (G_SAVE(n)) return "Shots to the body, glove and blocker — clean hands and feet that swallow pucks, with rebounds steered to the corners, not back into the slot.";
  if (G_POS(n)) return "Tracking the puck around the zone — squaring up early, the right depth in the crease, and taking away the net before the shot.";
  if (G_READ(n)) return "Scrambles, second and third saves and traffic — second-effort, tracking pucks through screens, and never giving up on a broken play.";
  return "";
}

export function ReportFonts() {
  return <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" />;
}

// Section kicker: mono uppercase label + trailing hairline, then a bold
// uppercase headline underneath — the report's one recurring header pattern.
function Shead({ kicker, title }) {
  const T = useContext(ThemeContext);
  return (
    <div style={{ breakInside: "avoid", breakAfter: "avoid", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: T.accent, fontWeight: 700, whiteSpace: "nowrap" }}>{kicker}</span>
        <span style={{ flex: 1, height: 1, background: T.hair }} />
      </div>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 23, letterSpacing: "-0.01em", textTransform: "uppercase", color: T.heading }}>{title}</div>
    </div>
  );
}

// Bordered pill badge — transparent-tinted background, mono uppercase label.
function Badge({ color, children }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color, background: `${color}1c`, border: `1px solid ${color}55`, padding: "4px 10px", borderRadius: 99, whiteSpace: "nowrap" }}>{children}</span>
  );
}

// Light/dark toggle — a plain <button>, which the print stylesheet already
// hides, so it never appears on a printed/saved page either way.
function ThemeToggle({ theme, onToggle }) {
  const T = useContext(ThemeContext);
  return (
    <button
      onClick={onToggle}
      style={{
        fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
        color: T.accent, background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 99,
        padding: "7px 14px", cursor: "pointer", marginBottom: 18,
      }}
    >
      {theme === "dark" ? "☀ Switch to light mode" : "● Switch to dark mode"}
    </button>
  );
}

export default function DevelopmentReport({ data }) {
  const [theme, setTheme] = useState("dark");
  const T = theme === "light" ? LIGHT : DARK;

  const { athlete, category, notes = [], curatedNotes = null, standing, skillProfile = [], goalieSkillsProfile = [], testingProfile = [], progress = [], serviceProvider = null, org_name, narrativeSummary = null } = data;
  // curatedNotes (AI-selected, non-contradictory subset -- see parentNarrative.js)
  // is preferred; falls back to the raw chronological list only when the AI
  // selection isn't available (e.g. ANTHROPIC_API_KEY unset).
  const displayNotes = curatedNotes !== null ? curatedNotes : notes.slice(0, 12);
  const reportIntro = getReportIntro(category?.name, athlete?.first_name);
  const scale = category?.scoring_scale || 10;
  const fullName = `${athlete?.first_name || ""} ${athlete?.last_name || ""}`.trim();
  const firstName = athlete?.first_name || "This athlete";
  // Goalies are graded on goalie categories and ranked against goalies only;
  // the copy below adapts so the report reads as a goaltending report, not a skater one.
  const isGoalie = (athlete?.position || "").toLowerCase().includes("goal");
  const cohortWord = isGoalie ? "goalies" : "skaters";

  // Foundation ordering = the sequence a development plan should attack skills in.
  // Goalies: movement → positioning → save execution → reading. Skaters: skating
  // → hands → sense → compete.
  const FOUNDATION = isGoalie
    ? ["skat", "move", "crease", "balance", "agil", "edge", "push", "recover", "position", "angle", "net", "depth", "cover", "save", "rebound", "glove", "blocker", "feet", "foot", "hand", "stick", "anticip", "read", "track"]
    : ["power skat", "skat", "edge", "balance", "puck", "stick", "hand", "iq", "sense", "position", "compete", "battle", "shot", "shoot", "pass"];
  const foundationRank = (name) => {
    const n = (name || "").toLowerCase();
    const i = FOUNDATION.findIndex(f => n.includes(f));
    return i < 0 ? 999 : i;
  };
  const cascadeFor = (name) => {
    const n = (name || "").toLowerCase();
    if (isGoalie) {
      if (G_MOVE(n)) return "the foundation of goaltending — efficient crease movement gets him square and set for every shot, which makes positioning, clean saves and rebound control all easier; improving it first tends to lift the other scores with it";
      if (G_POS(n)) return "where being square and at the right depth makes every save simpler — good position takes away the net before the shot, so the hands have less to do";
      if (G_SAVE(n)) return "the difference between a save and a second chance — settling pucks into the body and steering rebounds to the corners keeps the slot clean and loose pucks from becoming goals";
      return "the highest-leverage gap to close first; the areas below get easier once it's in place";
    }
    if (n.includes("skat") || n.includes("edge") || n.includes("balance"))
      return "the foundation everything else is built on — stronger edges, balance and top speed make puck control, shooting and compete battles all easier, so improving it first tends to lift the other scores with it";
    if (n.includes("puck") || n.includes("stick") || n.includes("hand"))
      return "a high-leverage base skill — once the hands are reliable at speed, hockey sense and shooting under pressure improve on their own";
    if (n.includes("iq") || n.includes("sense") || n.includes("position"))
      return "where reads make every physical tool more effective — being in the right place beats raw speed";
    return "the highest-leverage gap to close first; the areas below get easier once it's in place";
  };
  // Development order = biggest gap to the top first ("attack first"), with the
  // foundation order as a tiebreak only — so a skill that's already a strength is
  // never put at the top of the plan just because it's foundational.
  const skillFocus = skillProfile
    .filter(s => s.player != null && s.top != null).map(s => ({ ...s, gap: Math.round((s.top - s.player) * 10) / 10 }))
    .filter(s => s.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 4)
    .sort((a, b) => (b.gap - a.gap) || (foundationRank(a.name) - foundationRank(b.name)));
  const testFocus = testingProfile
    .filter(t => t.player_best != null && t.group_best != null).map(t => ({ ...t, gap: Math.round((t.player_best - t.group_best) * 1000) / 1000 }))
    .filter(t => t.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 2);
  // Highest- and lowest-graded skills, for the synthesis. Kept distinct so the
  // same skill can never be named as both the strength and the area to attack.
  const gradedSkills = skillProfile.filter(s => s.player != null);
  const strengthSkill = gradedSkills.slice().sort((a, b) => b.player - a.player)[0];
  const weaknessSkill = gradedSkills.slice().sort((a, b) => a.player - b.player)[0];
  const focusSkill = skillFocus[0];
  const tips = positionTips(athlete?.position, isGoalie);

  // Pills are keyed to the TOP of the group (the target), never the average — a
  // parent should read every skill as distance-to-aim-for, not a placement grade.
  const skillPill = (p, top) => {
    if (p == null) return { color: T.gray, t: "—" };
    if (top != null && p >= top - 0.2) return { color: T.success, t: "Strength" };
    const gap = top != null ? top - p : null;
    if (gap != null && gap <= 1.0) return { color: T.success, t: "Close to the top" };
    if (gap != null && gap <= 2.0) return { color: T.accent, t: "Developing" };
    return { color: T.warning, t: "Focus area" };
  };
  const topMark = Math.round(scale); // "what a 10 looks like" — the top of the scale

  const leadStyle = { fontFamily: SANS, fontSize: 14, color: T.textDim, lineHeight: 1.6, marginBottom: 12 };
  const cardStyle = { border: `1px solid ${T.cardBorder}`, borderRadius: 10, background: T.cardBg, padding: "16px 18px" };
  // Each major section gets its own page (break-before) AND is kept whole
  // (break-inside:avoid) so a section never splits and orphans a near-blank
  // page. paddingTop gives the top gap under the full-bleed dark (@page
  // margin:0). Testing rides page 1 with the cover (no break-before).
  const section = { breakBefore: "page", pageBreakBefore: "always", breakInside: "avoid", pageBreakInside: "avoid", paddingTop: 38 };

  // Skill/goalie bar row — label, track, value. Shared by both bar sections.
  const Bar = ({ k, val, color, strong }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <span style={{ width: 96, flexShrink: 0, fontFamily: SANS, fontSize: 11, color: strong ? T.heading : T.gray, fontWeight: strong ? 700 : 500 }}>{k}</span>
      <div style={{ flex: 1, height: 7, background: T.track, borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${val != null ? Math.max(2, (val / scale) * 100) : 0}%`, background: color, borderRadius: 99 }} /></div>
      <span style={{ width: 38, textAlign: "right", fontFamily: MONO, fontSize: 13, fontWeight: 700, color: strong ? T.accent : T.subtleText }}>{val != null ? val.toFixed(1) : "—"}</span>
    </div>
  );

  // ── Progress maths (for the dedicated progress page) ──
  const prog = progress.filter(p => p.player != null);
  const firstP = prog[0]?.player, lastP = prog[prog.length - 1]?.player;
  const totalDelta = (firstP != null && lastP != null) ? Math.round((lastP - firstP) * 10) / 10 : null;
  const trendWord = totalDelta == null ? "" : totalDelta >= 0.3 ? "Trending up" : totalDelta <= -0.3 ? "Trending down" : "Holding steady";

  return (
    <ThemeContext.Provider value={T}>
    <div className="ssrpt" style={{ fontFamily: SANS, maxWidth: 720, margin: "0 auto", color: T.text, fontSize: 14, lineHeight: 1.6, background: T.bg }}>
      <ReportFonts />

      {/* Cover — deliberately stays dark always. This is the brand moment,
          not a reading surface, so the light/dark toggle below doesn't touch it. */}
      <div style={{ background: "radial-gradient(120% 140% at 80% 0%, #16233a 0%, #0c121f 40%, #060b14 100%)", padding: "32px 34px", borderBottom: "1px solid rgba(230,193,91,0.28)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -90, right: -60, width: 320, height: 320, borderRadius: "50%", border: "1px solid rgba(230,193,91,0.14)" }} />
        <div style={{ position: "absolute", top: -40, right: -10, width: 230, height: 230, borderRadius: "50%", border: "1px solid rgba(230,193,91,0.09)" }} />
        {serviceProvider?.logo_url && (
          <div style={{ position: "absolute", top: 24, right: 26, background: "#fff", borderRadius: 8, padding: "8px 12px", boxShadow: "0 2px 10px rgba(0,0,0,0.28)" }}>
            <img src={serviceProvider.logo_url} alt={serviceProvider.name || "Service provider"}
              style={{ maxWidth: 100, maxHeight: 48, objectFit: "contain", display: "block" }} />
          </div>
        )}
        <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.3em", textTransform: "uppercase", color: "#e6c15b", fontWeight: 700 }}>Sideline Star · Development Report</div>
        <div style={{ fontFamily: SANS, fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.08, marginTop: 12, color: "#fff" }}>{fullName}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          {athlete?.position && <span style={{ fontFamily: MONO, border: "1px solid #e6c15b", color: "#e6c15b", background: "rgba(230,193,91,0.1)", padding: "4px 12px", borderRadius: 99, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{athlete.position}</span>}
          {athlete?.external_id && <span style={{ fontFamily: MONO, border: "1px solid rgba(220,227,240,0.2)", color: "#cfd2d7", padding: "4px 12px", borderRadius: 99, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{athlete.external_id}</span>}
          <span style={{ fontFamily: MONO, border: "1px solid rgba(220,227,240,0.2)", color: "#cfd2d7", padding: "4px 12px", borderRadius: 99, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{category?.name}</span>
          <span style={{ fontFamily: MONO, border: "1px solid rgba(220,227,240,0.2)", color: "#cfd2d7", padding: "4px 12px", borderRadius: 99, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        </div>
      </div>

      <div style={{ padding: "24px 34px 0" }}>

        <ThemeToggle theme={theme} onToggle={() => setTheme(t => (t === "dark" ? "light" : "dark"))} />

        {/* Congratulations + age-category development framing — static, per
            real age bracket (see reportIntro.js), keyed off the athlete's own
            category name only. Always renders; never guesses or combines
            brackets. */}
        <div style={{ marginBottom: 22, breakInside: "avoid" }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: T.accent, fontWeight: 700, marginBottom: 9 }}>Congratulations on completing the evaluation</div>
          <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 500, color: T.bodyText, lineHeight: 1.65 }}>{reportIntro}</div>
        </div>

        {/* Opening narrative — AI-synthesized from the notes + numbers below, set
            the scene before any chart. Cached per (athlete, category); see
            src/lib/parentNarrative.js. Absent (older/uncached reports, or if the
            AI call ever fails) means this card just doesn't render — every other
            section stands on its own without it. */}
        {narrativeSummary && (
          <div style={{ marginBottom: 22, breakInside: "avoid" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: T.accent, fontWeight: 700, marginBottom: 9 }}>The read</div>
            <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: 500, color: T.bodyStrong, lineHeight: 1.65 }}>{narrativeSummary}</div>
          </div>
        )}

        {/* Goalie skills session — the goalie equivalent of testing (four drills, higher is better) */}
        {isGoalie && goalieSkillsProfile.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <Shead kicker="The skills session" title="Goalie skills" />
            <div style={leadStyle}>Goalies run their own skills session — four drills, scored by eye, where <b style={{ color: T.bodyStrong }}>a higher mark is better</b> (out of {scale}). Each card shows where {firstName} landed against the group average and the top of the group, with what evaluators were watching for.</div>
            {goalieSkillsProfile.map(s => {
              const p = skillPill(s.player, s.top);
              const blurb = drillBlurb(s.name);
              return (
                <div key={s.scoring_category_id} style={{ ...cardStyle, marginBottom: 10, breakInside: "avoid" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: T.heading }}>{s.name}</span>
                    <Badge color={p.color}>{p.t}</Badge>
                  </div>
                  {blurb && <div style={{ fontFamily: SANS, fontSize: 11.5, color: T.muted, margin: "5px 0 12px" }}>{blurb}</div>}
                  {!blurb && <div style={{ height: 8 }} />}
                  <Bar k={firstName} val={s.player} color={`linear-gradient(90deg,#f0d27e,${T.accent})`} strong />
                  <Bar k="Aim for (top)" val={s.top} color={T.barTarget} />
                </div>
              );
            })}
          </div>
        )}

        {/* Objective testing */}
        {testingProfile.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <Shead kicker="The numbers don't lie" title="Objective testing" />
            <div style={leadStyle}>This is the one part of the evaluation with no opinion in it. Every skater ran the <b style={{ color: T.bodyStrong }}>same drills, the same clock and the same setup</b> — so these numbers measure raw on-ice athleticism: straight-line speed, acceleration, agility, edge control and how quickly {firstName} changes direction. <b style={{ color: T.bodyStrong }}>Lower is better — the fastest time wins.</b> Each card shows {firstName}'s best result next to the fastest in the group, so there's a clear number to chase.</div>
            {testingProfile.map((t, i) => {
              const you = t.player_best, best = t.group_best;
              const youBest = best != null && you <= best + 0.0005;
              const gap = best != null ? (you - best).toFixed(2) : null;
              const info = testInfo(t.test_name);
              return (
                <div key={`${t.test_name}-${i}`} style={{ ...cardStyle, marginBottom: 8, breakInside: "avoid" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.subtleText }}>{t.test_name}</span>
                    <Badge color={T.accent}>{youBest ? "Group best" : gap != null ? `${gap}s off the best` : ""}</Badge>
                  </div>
                  {info && <div style={{ fontFamily: SANS, fontSize: 10.5, color: T.muted, lineHeight: 1.45, margin: "6px 0 10px", maxWidth: "92%" }}>{info}</div>}
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: 14 }}>
                    <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 30, lineHeight: 1, color: T.heading, letterSpacing: "-0.02em" }}>{fmt(you)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.accent, marginBottom: 4 }}>sec</span>
                  </div>
                  {/* Two-point aim track: You → the fastest in the group (the target). No
                      group average — the target is what gives them something to chase. */}
                  <div style={{ position: "relative", height: 26 }}>
                    <div style={{ position: "absolute", left: "2%", right: "2%", top: 5, height: 3, background: T.track, borderRadius: 99 }} />
                    {youBest ? (
                      <div style={{ position: "absolute", left: "50%", top: 0, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <span style={{ width: 12, height: 12, borderRadius: "50%", background: T.accent, boxShadow: `0 0 0 4px ${T.accentSoft}` }} />
                        <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 5, textAlign: "center", whiteSpace: "nowrap", color: T.accent }}>You · Best</span>
                      </div>
                    ) : (
                      <>
                        <div style={{ position: "absolute", top: 5, left: "22%", width: "56%", height: 3, background: `linear-gradient(90deg, ${T.accentSoft}, ${T.accent})`, borderRadius: 99 }} />
                        <div style={{ position: "absolute", left: "22%", top: 0, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <span style={{ width: 12, height: 12, borderRadius: "50%", background: T.subtleText, boxShadow: `0 0 0 4px ${T.hair}` }} />
                          <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 5, textAlign: "center", whiteSpace: "nowrap", color: T.subtleText }}>You <b style={{ fontWeight: 700, color: T.bodyText }}>{fmt(you)}</b></span>
                        </div>
                        <div style={{ position: "absolute", left: "78%", top: 0, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <span style={{ width: 12, height: 12, borderRadius: "50%", background: T.accent, boxShadow: `0 0 0 4px ${T.accentSoft}` }} />
                          <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 5, textAlign: "center", whiteSpace: "nowrap", color: T.accent }}>Best <b style={{ fontWeight: 700 }}>{fmt(best)}</b></span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bridges Objective Testing and Skill Profile -- these two sections can point in
            different directions for the same athlete (e.g. above group average on every
            timed test but below-average skill grades), and without this line that reads as
            a contradiction ("the stopwatch says he's better, so the evaluators must be
            wrong") instead of what it actually is: two different things being measured. */}
        {testingProfile.length > 0 && skillProfile.length > 0 && (
          <div style={{ margin: "2px 0 16px", padding: "10px 14px", borderLeft: `2px solid ${T.hair}`, breakInside: "avoid" }}>
            <div style={{ fontFamily: SANS, fontSize: 12, color: T.textDim, lineHeight: 1.55, fontStyle: "italic" }}>Timed testing measures raw physical tools; the skill grades below reflect how those tools show up in live game play — two different things, so it's normal for them to tell different stories.</div>
          </div>
        )}

        {/* Skill profile + progress trend */}
        {skillProfile.length > 0 && (
          <div style={{ marginBottom: 10, ...section }}>
            <Shead kicker={isGoalie ? "Evaluator scores from the scrimmages" : "What the evaluators graded"} title={isGoalie ? "Scrimmage evaluation" : "Skill profile"} />
            <div style={leadStyle}>{isGoalie ? "In the scrimmages, evaluators graded each area by eye watching live game play" : "Beyond the clock, evaluators graded each skill by eye across the sessions"}, on a <b style={{ color: T.bodyStrong }}>{scale}-point scale in half-point steps</b> — so a 7.5 is a real, deliberate mark. The number shown is {firstName}'s <b style={{ color: T.bodyStrong }}>average across every evaluator</b> who watched them. Higher is better. For each skill, here's what evaluators are looking for, <b style={{ color: T.bodyStrong }}>what a {topMark} looks like</b>, and where {firstName}'s score sits against the top of the group to aim at.</div>
            {skillProfile.map((s, idx) => {
              const p = skillPill(s.player, s.top);
              // Interpretation is framed against the TOP of the group (the target),
              // never the average — the parent reads distance-to-aim-for, not a
              // grade. Phrasing rotates by position (skillInterpretation above) so
              // several skills in the same tier don't all read as the same
              // template sentence with different numbers swapped in.
              const interp = skillInterpretation(idx, firstName, s);
              const sub = skillInfo(s.name, isGoalie);
              const elite = skillElite(s.name, isGoalie);
              return (
                <div key={s.scoring_category_id} style={{ ...cardStyle, marginBottom: 12, breakInside: "avoid" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: T.heading }}>{s.name}</span>
                    <Badge color={p.color}>{p.t}</Badge>
                  </div>
                  {sub && <div style={{ fontFamily: SANS, fontSize: 11.5, color: T.muted, margin: "5px 0 10px" }}>{sub}</div>}
                  {!sub && <div style={{ height: 6 }} />}
                  {elite && <div style={{ fontFamily: SANS, fontSize: 12, color: T.textDim, lineHeight: 1.55, background: T.panelBg, border: `1px solid ${T.panelBorder}`, borderRadius: 8, padding: "8px 12px", margin: "0 0 12px" }}><b style={{ color: T.accent }}>What a {topMark} looks like:</b> {elite}.</div>}
                  <Bar k={firstName} val={s.player} color={`linear-gradient(90deg,#f0d27e,${T.accent})`} strong />
                  <Bar k="Aim for (top)" val={s.top} color={T.barTarget} />
                  {interp && <div style={{ marginTop: 11, paddingTop: 12, borderTop: `1px solid ${T.hair}`, fontFamily: SANS, fontSize: 12.5, color: T.textDim, lineHeight: 1.55 }}>{interp}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* Progress across sessions — its own page */}
        {prog.length > 1 && (() => {
          const W = 660, H = 300, padX = 44, padTop = 28, padBot = 46;
          const n = prog.length;
          const x = (i) => padX + (n === 1 ? (W - padX * 2) / 2 : (i * (W - padX * 2)) / (n - 1));
          const y = (v) => padTop + (1 - (v / scale)) * (H - padTop - padBot);
          const line = (key) => prog.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");
          const area = `${line("player")} L ${x(n - 1).toFixed(1)} ${(H - padBot).toFixed(1)} L ${x(0).toFixed(1)} ${(H - padBot).toFixed(1)} Z`;
          const gridVals = [0, scale / 2, scale];
          return (
            <div style={{ marginBottom: 10, ...section }}>
              <Shead kicker={trendWord || "Session by session"} title="Progress across sessions" />
              <div style={leadStyle}>How {firstName}'s evaluator scores moved from one session to the next, against the group average. Improvement across sessions is the strongest signal there is — it shows the work is landing.</div>

              {/* Big takeaway */}
              {totalDelta != null && (
                <div style={{ display: "flex", alignItems: "center", gap: 18, ...cardStyle, borderLeft: `3px solid ${T.accent}`, borderRadius: 10, padding: "16px 20px", marginBottom: 16 }}>
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 32, color: totalDelta >= 0 ? T.success : T.warning, lineHeight: 1 }}>{totalDelta >= 0 ? "+" : ""}{totalDelta.toFixed(1)}</div>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: T.accent, marginTop: 5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>pts · {n} sessions</div>
                  </div>
                  <div style={{ width: 1, alignSelf: "stretch", background: T.hair }} />
                  <div style={{ fontFamily: SANS, color: T.textDim, fontSize: 13.5, lineHeight: 1.6 }}>
                    {firstName} {totalDelta >= 0.3 ? "improved" : totalDelta <= -0.3 ? "slipped" : "held steady"} from <b style={{ color: T.heading }}>{firstP.toFixed(1)}</b> in session 1 to <b style={{ color: T.heading }}>{lastP.toFixed(1)}</b> by session {n}{totalDelta >= 0.3 ? " — a clear upward trajectory across the evaluation." : "."} The line below tracks every session against the group.
                  </div>
                </div>
              )}

              {/* Line chart */}
              <div style={{ ...cardStyle, padding: "10px 8px 4px" }}>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
                  <defs>
                    <linearGradient id="progFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.accent} stopOpacity="0.26" />
                      <stop offset="100%" stopColor={T.accent} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {gridVals.map((g, i) => (
                    <g key={i}>
                      <line x1={padX} y1={y(g)} x2={W - padX} y2={y(g)} stroke={T.gridLine} strokeWidth="1" />
                      <text x={padX - 8} y={y(g) + 3} textAnchor="end" fontSize="11" fill={T.muted} fontFamily={MONO}>{g}</text>
                    </g>
                  ))}
                  <path d={area} fill="url(#progFill)" />
                  <path d={line("group")} fill="none" stroke={T.seriesMuted} strokeWidth="2" strokeDasharray="5 5" />
                  <path d={line("player")} fill="none" stroke={T.accent} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                  {prog.map((p, i) => (
                    <g key={i}>
                      <circle cx={x(i)} cy={y(p.group)} r="3.5" fill={T.seriesMuted} />
                      <circle cx={x(i)} cy={y(p.player)} r="5.5" fill={T.accent} stroke={T.surface} strokeWidth="2" />
                      <text x={x(i)} y={y(p.player) - 12} textAnchor="middle" fontSize="14" fontWeight="700" fill={T.heading} fontFamily={MONO}>{p.player.toFixed(1)}</text>
                      <text x={x(i)} y={H - 22} textAnchor="middle" fontSize="11" fontWeight="700" letterSpacing="0.08em" fill={T.subtleText} fontFamily={MONO}>SESSION {p.session_number}</text>
                    </g>
                  ))}
                </svg>
                <div style={{ display: "flex", gap: 18, justifyContent: "center", padding: "6px 0 12px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: T.muted, fontWeight: 600 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 3, background: T.accent, borderRadius: 2 }} />{firstName}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 0, borderTop: `2px dashed ${T.seriesMuted}` }} />Group average</span>
                </div>
              </div>

              {/* Per-session deltas */}
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                {prog.map((p, i) => {
                  const d = i === 0 ? null : Math.round((p.player - prog[i - 1].player) * 10) / 10;
                  return (
                    <div key={i} style={{ flex: 1, ...cardStyle, padding: "12px 10px", textAlign: "center" }}>
                      <div style={{ fontFamily: MONO, fontSize: 9.5, color: T.gray, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Session {p.session_number}</div>
                      <div style={{ fontFamily: SANS, fontSize: 24, fontWeight: 800, color: T.heading, margin: "5px 0 3px" }}>{p.player.toFixed(1)}</div>
                      {d == null ? (
                        <div style={{ fontFamily: MONO, fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>Starting point</div>
                      ) : (
                        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: d > 0 ? T.success : d < 0 ? T.warning : T.muted }}>{d > 0 ? "▲ +" : d < 0 ? "▼ " : "– "}{Math.abs(d).toFixed(1)} vs S{prog[i - 1].session_number}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Evaluator notes */}
        {displayNotes.length > 0 && (
          <div style={{ marginBottom: 10, ...section }}>
            <Shead kicker="Selected observations" title="What the evaluators saw" />
            <div style={leadStyle}>In their own words — the notes evaluators wrote while watching {firstName} play.</div>
            {displayNotes.map((n, i) => (
              <div key={i} style={{ ...cardStyle, borderLeft: `2px solid ${T.accent}`, padding: "12px 16px", marginBottom: 9, breakInside: "avoid" }}>
                <div style={{ fontFamily: SANS, color: T.bodyText, lineHeight: 1.6, fontSize: 14 }}>&ldquo;{n.note_text}&rdquo;</div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, color: T.muted, marginTop: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>Session {n.session_number}</div>
              </div>
            ))}
            {(strengthSkill || focusSkill || standing) && (
              <div style={{ marginTop: 16, background: T.panelBg, border: `1px solid ${T.panelBorder}`, borderLeft: `3px solid ${T.accent}`, borderRadius: 10, padding: "15px 18px", breakInside: "avoid" }}>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: T.accent, fontWeight: 700, marginBottom: 8 }}>What it adds up to</div>
                <div style={{ fontFamily: SANS, fontSize: 14, color: T.bodyText, lineHeight: 1.65 }}>
                  Read together, the scores tell a consistent story.{strengthSkill && weaknessSkill && strengthSkill.scoring_category_id !== weaknessSkill.scoring_category_id ? <> {firstName}'s <b style={{ color: T.heading }}>{strengthSkill.name.toLowerCase()}</b> ({strengthSkill.player.toFixed(1)}) grades out as the relative strength, while <b style={{ color: T.heading }}>{weaknessSkill.name.toLowerCase()}</b> ({weaknessSkill.player.toFixed(1)}) is the area to attack first</> : strengthSkill ? <> {firstName}'s scores sit close together, with <b style={{ color: T.heading }}>{strengthSkill.name.toLowerCase()}</b> grading highest</> : ""}. The development plan on the next page lays out the order to climb.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Summary & recommendations */}
        {(standing || skillFocus.length > 0 || testFocus.length > 0) && (
          <div style={{ marginBottom: 10, ...section }}>
            <Shead kicker="The bottom line" title="Summary & recommendations" />
            <div style={{ ...cardStyle, padding: "16px 20px" }}>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 18, color: T.heading, marginBottom: 5, textTransform: "uppercase", letterSpacing: "-0.005em" }}>What to chase next</div>
              <div style={{ fontFamily: SANS, color: T.textDim, lineHeight: 1.6, fontSize: 13 }}>{firstName} was measured across {isGoalie ? "the evaluators' scores" : "objective testing and evaluator scores"} over the evaluation. The point of this report isn't a ranking — it's a clear picture of what to work on and, just as important, the order to work on it in.</div>
              <div style={{ marginTop: 12, border: `1px solid ${T.hair}`, borderRadius: 8, background: T.panelBg, padding: "10px 14px", color: T.textDim, fontFamily: SANS, fontSize: 12, lineHeight: 1.55, breakInside: "avoid" }}>
                <b style={{ color: T.heading }}>A note on the numbers.</b> Every evaluation is a snapshot of one moment in a long journey. In a group this size, some athletes have skated for years, some are just getting started — so a score is never a verdict on a player, and it isn't how groups or teams get set. Read each number here as a map of what to work on next, not a grade. With the right focus, these bars move quickly.
                <br /><br />
                Evaluator (subjective) grades are also a <b style={{ color: T.heading }}>relative scale, not a fixed one</b> — a score reflects how {firstName} compared to the specific peers on the ice with them that session, not a universal standard applied the same way to every group at every level. That's by design: it's the only fair way to grade a fast-moving scrimmage in real time, and it's exactly why this report frames every score against this group's own top mark instead of a fixed benchmark.
              </div>
            </div>

            {/* Real ask: parents need to understand the scale a small-looking
                gap sits inside of, AND what this report is (and isn't) for --
                stated plainly enough that it holds up if someone tries to
                use it to relitigate a roster decision. */}
            <div style={{ marginTop: 16, border: `1px solid ${T.panelBorder}`, borderLeft: `3px solid ${T.accent}`, borderRadius: 8, background: T.panelBg, padding: "14px 16px", breakInside: "avoid" }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.accent, fontWeight: 700, marginBottom: 8 }}>How to read this report</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: T.textDim, lineHeight: 1.6 }}>
                Some age categories evaluate well over 100 athletes at once. At that scale, a gap that looks small in these numbers can reflect a real, meaningful difference in where a player actually sits in the group — these scores aren't precise to a tenth of a point the way they might look.
                <br /><br />
                This report exists for one purpose: an honest, realistic picture of where {firstName} fits right now and a clear plan to keep developing. It is not evidence for disputing a team selection, an evaluator, or the association, and it will not be treated as one — rosters are set through the full evaluation process, not any single report, and those decisions are final.
              </div>
            </div>

            <div style={{ lineHeight: 1.6, marginTop: 20, fontFamily: SANS, fontSize: 13.5, color: T.textDim }}>
              <p style={{ marginTop: 0, marginBottom: 18 }}>If {firstName} invests in development, the order matters. Build the foundation first and the rest compounds. Here's the path we'd recommend:</p>

              {/* Vertical timeline — numbered node, then the priority card and the
                  "then, in order" list beneath it. */}
              {skillFocus.length > 0 && (
                <div style={{ position: "relative", paddingLeft: 30, borderLeft: `2px solid ${T.hair}` }}>
                  <div style={{ position: "relative", breakInside: "avoid" }}>
                    <div style={{ position: "absolute", left: -44, top: -2, width: 28, height: 28, borderRadius: "50%", background: T.bg, border: `2px solid ${T.accent}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 13, color: T.accent }}>1</span>
                    </div>
                    <div style={{ ...cardStyle, borderLeft: `3px solid ${T.accent}`, padding: "16px 18px" }}>
                      <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: T.accent, fontWeight: 700, marginBottom: 7 }}>{isGoalie ? "Start here — the priority" : "Start here — the foundation"}</div>
                      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 18, color: T.heading, marginBottom: 5, textTransform: "uppercase" }}>{skillFocus[0].name}</div>
                      <div style={{ color: T.textDim }}>{skillFocus[0].name} is {cascadeFor(skillFocus[0].name)}. It's a {skillFocus[0].gap.toFixed(1)}-point gap to the top of the group — the single best place to start.</div>
                      <div style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${T.hair}`, color: T.textDim }}><b style={{ color: T.accent }}>At the top of the group, this looks like</b> {skillElite(skillFocus[0].name, isGoalie)}.</div>
                    </div>
                  </div>

                  {skillFocus.length > 1 && (
                    <div style={{ position: "relative", marginTop: 22 }}>
                      <div style={{ position: "absolute", left: -42, top: -1, width: 24, height: 24, borderRadius: "50%", background: T.bg, border: `2px solid ${T.hair}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 11, color: T.gray }}>2</span>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: T.gray, fontWeight: 700, marginBottom: 9 }}>Then, in order</div>
                      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                        {skillFocus.slice(1).map((s, i) => (
                          <li key={s.scoring_category_id} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent, marginTop: 6, flexShrink: 0 }} />
                            <span style={{ color: T.textDim }}><b style={{ color: T.heading }}>{s.name}</b> — about {s.gap.toFixed(1)} behind the top of the group{THEN_IN_ORDER_CLAUSE[i % THEN_IN_ORDER_CLAUSE.length]}</span>
                          </li>
                        ))}
                      </ul>
                      {testFocus.length > 0 ? (
                        <p style={{ margin: "12px 0 0", paddingTop: 12, borderTop: `1px solid ${T.hair}`, color: T.textDim }}>The objective targets to chase first — {testFocus.map((t, i) => <b key={t.test_name} style={{ color: T.heading }}>{t.test_name}{i < testFocus.length - 1 ? " and " : ""}</b>)} — reflect the same {skillFocus[0].name.toLowerCase()} gap driving the plan above. This is the work to build this season — attack it now, and come back to beat these numbers as the year goes on. The work shows up on the sheet.</p>
                      ) : (
                        <p style={{ margin: "12px 0 0", paddingTop: 12, borderTop: `1px solid ${T.hair}`, color: T.textDim }}>This is the foundation to build this season — attack it now, and come back to beat these numbers as the year goes on. The work shows up on the sheet.</p>
                      )}
                    </div>
                  )}
                  {skillFocus.length <= 1 && (
                    testFocus.length > 0 ? (
                      <p style={{ margin: "16px 0 0", color: T.textDim }}>The objective targets to chase first — {testFocus.map((t, i) => <b key={t.test_name} style={{ color: T.heading }}>{t.test_name}{i < testFocus.length - 1 ? " and " : ""}</b>)} — reflect the same {skillFocus[0].name.toLowerCase()} gap driving the plan above. This is the work to build this season — attack it now, and come back to beat these numbers as the year goes on. The work shows up on the sheet.</p>
                    ) : (
                      <p style={{ margin: "16px 0 0", color: T.textDim }}>This is the foundation to build this season — attack it now, and come back to beat these numbers as the year goes on. The work shows up on the sheet.</p>
                    )
                  )}
                </div>
              )}
              {skillFocus.length === 0 && (
                testFocus.length > 0 ? (
                  <p style={{ margin: 0, color: T.textDim }}>The objective targets to chase first — {testFocus.map((t, i) => <b key={t.test_name} style={{ color: T.heading }}>{t.test_name}{i < testFocus.length - 1 ? " and " : ""}</b>)} are the clearest places to invest right now, early in the season — attack them, and come back to beat these numbers as the year goes on. The work shows up on the sheet.</p>
                ) : (
                  <p style={{ margin: 0, color: T.textDim }}>This is the foundation to build this season — attack it now, and come back to beat these numbers as the year goes on. The work shows up on the sheet.</p>
                )
              )}
            </div>

            {!isGoalie && (
              <div style={{ marginTop: 26, breakInside: "avoid" }}>
                <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: T.accent, fontWeight: 700, marginBottom: 7 }}>Off-ice next steps</div>
                <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 18, color: T.heading, marginBottom: 9, textTransform: "uppercase" }}>Finding the right development partner</div>
                <p style={{ margin: "0 0 14px", fontFamily: SANS, color: T.textDim }}>The plan above tells you what to work on. This is how to find someone good to help — we don't broker or endorse specific coaches or programs, so the research is on you, but here's what to look for.</p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ ...cardStyle, padding: "14px 16px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.heading, fontWeight: 700, marginBottom: 6 }}>Skills training vs. power skating</div>
                    <div style={{ fontFamily: SANS, color: T.textDim, fontSize: 12.5, lineHeight: 1.6 }}>
                      "Power skating" is pure skating mechanics — edges, stride, balance, tight turns, stopping and starting. "Skills" training covers puck handling, shooting and stickhandling under pressure. They're different disciplines and not every provider does both well.
                      {focusSkill && (focusSkill.name || "").toLowerCase().match(/skat|edge|balance/)
                        ? ` Based on the numbers above, ${firstName} would get the most out of a power-skating provider first — the puck skills sharpen faster once the skating underneath them is solid.`
                        : focusSkill && (focusSkill.name || "").toLowerCase().match(/puck|stick|hand/)
                        ? ` Based on the numbers above, ${firstName} would get the most out of a skills/puck-handling provider first.`
                        : ""}
                    </div>
                  </div>

                  <div style={{ ...cardStyle, padding: "14px 16px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.heading, fontWeight: 700, marginBottom: 6 }}>Private lessons vs. group sessions</div>
                    <div style={{ fontFamily: SANS, color: T.textDim, fontSize: 12.5, lineHeight: 1.6 }}>Private, one-on-one time with a good coach is the fastest way to fix a specific flaw — but it can run into real money fast, especially weekly. Group sessions and camps cost less per hour and still work well for general skill-building; save privates for a specific problem (a stride flaw, a weak backward crossover) once you know what it is.</div>
                  </div>

                  <div style={{ ...cardStyle, padding: "14px 16px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.heading, fontWeight: 700, marginBottom: 6 }}>Reading reviews and feedback</div>
                    <div style={{ fontFamily: SANS, color: T.textDim, fontSize: 12.5, lineHeight: 1.6 }}>Generic praise ("great program," "my kid loved it") doesn't tell you much. Look for reviews that describe actual coaching — a parent saying a coach "takes the time to stop, correct and fix players," or a coach who explains why a drill matters, not just runs it. That's the signal that real, individualized correction is happening on the ice, not just repetition.</div>
                  </div>

                  <div style={{ ...cardStyle, background: T.panelBg, borderColor: T.panelBorder, padding: "14px 16px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.accent, fontWeight: 700, marginBottom: 6 }}>Questions worth asking before you book</div>
                    <div style={{ fontFamily: SANS, color: T.textDim, fontSize: 12.5, lineHeight: 1.6 }}>How many players per coach on the ice? Can you sit in on or trial a session first? Does the coach have a playing or coaching background at a level worth trusting? And do they track progress session-to-session, or is every session the same drills with no read on what's actually improving?</div>
                  </div>
                </div>
              </div>
            )}

            {/* Position-general habits — distinct from the skill/testing plan
                above (which targets THIS athlete's specific gaps), this is
                what consistently gets noticed all season, not tied to any
                one evaluation. Sits last, after the development plan and
                off-ice guidance. Real feedback: report copy shouldn't assume
                a tryout-to-tryout gap year -- a report going out at the
                START of a season should point at building through THIS
                season, not "wait for the off-season, come back next time." */}
            {tips && (
              <div style={{ marginTop: 26, breakInside: "avoid" }}>
                <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: T.accent, fontWeight: 700, marginBottom: 7 }}>Things to get you noticed</div>
                <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 18, color: T.heading, marginBottom: 9, textTransform: "uppercase" }}>Tips for the season ahead</div>
                <p style={{ margin: "0 0 14px", fontFamily: SANS, color: T.textDim, fontSize: 13 }}>General habits evaluators consistently notice at {isGoalie ? "the goalie position" : `${athlete?.position === "forward_defense" ? "forward and defense" : (athlete?.position || "this position")}`} — separate from {firstName}'s specific plan above, these are worth building all season long, not just something to remember for the next evaluation.</p>
                <div style={{ ...cardStyle, padding: "6px 18px" }}>
                  {tips.map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderTop: i > 0 ? `1px solid ${T.hair}` : "none" }}>
                      <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: 12, color: T.accent, marginTop: 1, flexShrink: 0, width: 16 }}>{i + 1}</span>
                      <span style={{ fontFamily: SANS, fontSize: 13, color: T.bodyText, lineHeight: 1.55 }}>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ borderTop: `1px solid ${T.hair}`, padding: "12px 0 40px", marginTop: 20, display: "flex", justifyContent: "space-between", color: T.muted, fontSize: 10 }}>
              <span style={{ fontFamily: MONO, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.accent }}>Sideline Star</span>
              <span style={{ fontFamily: SANS }}>{category?.name} · {fullName} · {isGoalie ? "Goaltending" : "Player"} Development Report</span>
            </div>
          </div>
        )}
      </div>

      <style>{`
        html, body { background: ${T.bg}; }
        @page { size: A4; margin: 0; }
        @media print {
          html, body { background: ${T.bg}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .ssrpt { max-width: none !important; width: 100% !important; }
          button { display: none !important; }
        }
      `}</style>
    </div>
    </ThemeContext.Provider>
  );
}
