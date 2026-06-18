"use client";

// Shared premium-dark Development Report render. Pure presentational — give it a
// `data` object from lib/reportData.buildAthleteReport and it renders the full
// report. Used by both the authed director PDF (/player/report/pdf) and the
// token-gated paid-parent PDF (/report/[token]/pdf) so there is ONE report.

const GOLD = "#cda434";
const GOLD_SOFT = "rgba(205,164,52,0.14)";
const GOLD_LINE = "rgba(205,164,52,0.3)";
const BG = "#0b0b0d";
const TXT = "#e9eaec";
const GRAY = "#8b8f99";
const MUTED = "#6b7078";
const LINE = "rgba(255,255,255,0.08)";
const SERIF = "'Playfair Display', Georgia, serif";
const NUM = "'Archivo', -apple-system, sans-serif";
const SANS = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function testInfo(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("backward")) return "Straight-line backward speed — edge control, posture and defensive footspeed.";
  if (n.includes("puck")) return "Speed while controlling the puck — how much pace holds up with the puck on the stick.";
  if (n.includes("forward") || (n.includes("30m") && !n.includes("backward"))) return "Flat-out straight-line speed — pure acceleration and stride power.";
  if (n.includes("transition") || n.includes("pivot")) {
    if (n.includes("left")) return "Pivots and direction changes turning to the left — footwork and clean transitions.";
    if (n.includes("right")) return "Pivots and direction changes turning to the right — footwork and clean transitions.";
    return "Pivots, footwork and how cleanly direction changes.";
  }
  if (n.includes("weave") || n.includes("agility") || n.includes("cone")) return "Tight turns and cuts through obstacles — balance, edge control and quickness in close.";
  if (n.includes("stop") || n.includes("caps") || n.includes("start")) return "Explosive stop-and-start — how fast they stop hard and get moving again the other way.";
  if (n.includes("reaction") || n.includes("start")) return "First-step quickness off the whistle — explosiveness and reaction time.";
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
// Hockey IQ, Effort & Compete; goalie four above) — keyword-matched so custom
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
  return <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Archivo:wght@600;700;800;900&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" />;
}

export default function DevelopmentReport({ data }) {
  const { athlete, category, notes = [], standing, skillProfile = [], goalieSkillsProfile = [], testingProfile = [], progress = [], serviceProvider = null, org_name } = data;
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

  const skillPill = (p, g, top) => {
    if (p == null) return { bg: "rgba(255,255,255,.06)", c: GRAY, t: "—" };
    if (top != null && p >= top - 0.2) return { bg: "rgba(80,200,120,.16)", c: "#5fd08a", t: "Strength" };
    if (g != null && p >= g) return { bg: "rgba(80,200,120,.12)", c: "#67c98c", t: "Above average" };
    if (g != null && p >= g - 0.6) return { bg: GOLD_SOFT, c: GOLD, t: "Around average" };
    return { bg: "rgba(224,138,42,.16)", c: "#e0944a", t: "Focus area" };
  };

  const Shead = ({ kicker, title }) => (
    <div style={{ breakInside: "avoid", breakAfter: "avoid" }}>
      <div style={{ fontFamily: SANS, fontSize: 9.5, letterSpacing: "0.24em", textTransform: "uppercase", color: GOLD, fontWeight: 700, marginBottom: 5 }}>{kicker}</div>
      <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 21, color: "#fff", margin: "0 0 12px", paddingBottom: 9, borderBottom: `1px solid ${GOLD_LINE}` }}>{title}</div>
    </div>
  );
  const leadStyle = { fontSize: 11.5, color: GRAY, lineHeight: 1.5, marginBottom: 11 };
  // Each major section gets its own page (break-before) AND is kept whole
  // (break-inside:avoid) so a section never splits and orphans a near-blank
  // page. paddingTop gives the top gap under the full-bleed dark (@page
  // margin:0). Testing rides page 1 with the cover (no break-before).
  const section = { breakBefore: "page", pageBreakBefore: "always", breakInside: "avoid", pageBreakInside: "avoid", paddingTop: 38 };

  // ── Progress maths (for the dedicated progress page) ──
  const prog = progress.filter(p => p.player != null);
  const firstP = prog[0]?.player, lastP = prog[prog.length - 1]?.player;
  const totalDelta = (firstP != null && lastP != null) ? Math.round((lastP - firstP) * 10) / 10 : null;
  const trendWord = totalDelta == null ? "" : totalDelta >= 0.3 ? "Trending up" : totalDelta <= -0.3 ? "Trending down" : "Holding steady";

  return (
    <div className="ssrpt" style={{ fontFamily: SANS, maxWidth: 720, margin: "0 auto", color: TXT, fontSize: 13, lineHeight: 1.55, background: BG }}>
      <ReportFonts />

      {/* Cover */}
      <div style={{ background: "radial-gradient(120% 140% at 80% 0%, #23211a 0%, #121214 40%, #0a0a0c 100%)", padding: "32px 34px", borderBottom: `1px solid ${GOLD_LINE}`, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -90, right: -60, width: 320, height: 320, borderRadius: "50%", border: "1px solid rgba(205,164,52,0.16)" }} />
        <div style={{ position: "absolute", top: -40, right: -10, width: 230, height: 230, borderRadius: "50%", border: "1px solid rgba(205,164,52,0.1)" }} />
        {serviceProvider?.logo_url && (
          <img src={serviceProvider.logo_url} alt={serviceProvider.name || "Service provider"}
            style={{ position: "absolute", top: 28, right: 30, maxWidth: 116, maxHeight: 54, objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.95 }} />
        )}
        <div style={{ fontSize: 9.5, letterSpacing: "0.3em", textTransform: "uppercase", color: GOLD, fontWeight: 700 }}>Sideline Star · Development Report</div>
        <div style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 900, lineHeight: 1.05, marginTop: 10, color: "#fff" }}>{fullName}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {athlete?.position && <span style={{ border: `1px solid ${GOLD}`, color: GOLD, padding: "3px 12px", borderRadius: 99, fontSize: 11, textTransform: "capitalize" }}>{athlete.position}</span>}
          {athlete?.external_id && <span style={{ border: "1px solid rgba(255,255,255,0.18)", color: "#cfd2d7", padding: "3px 12px", borderRadius: 99, fontSize: 11 }}>{athlete.external_id}</span>}
          <span style={{ border: "1px solid rgba(255,255,255,0.18)", color: "#cfd2d7", padding: "3px 12px", borderRadius: 99, fontSize: 11 }}>{category?.name}</span>
          <span style={{ border: "1px solid rgba(255,255,255,0.18)", color: "#cfd2d7", padding: "3px 12px", borderRadius: 99, fontSize: 11 }}>{new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        </div>
      </div>

      <div style={{ padding: "24px 34px 0" }}>

        {/* Goalie skills session — the goalie equivalent of testing (four drills, higher is better) */}
        {isGoalie && goalieSkillsProfile.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <Shead kicker="The skills session" title="Goalie skills" />
            <div style={leadStyle}>Goalies run their own skills session — four drills, scored by eye, where <b style={{ color: "#cfd2d7" }}>a higher mark is better</b> (out of {scale}). Each card shows where {firstName} landed against the group average and the top of the group, with what evaluators were watching for.</div>
            {goalieSkillsProfile.map(s => {
              const p = skillPill(s.player, s.group, s.top);
              const blurb = drillBlurb(s.name);
              const brow = (k, val, color, strong) => (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ width: 96, flexShrink: 0, fontSize: 10.5, color: strong ? "#fff" : GRAY, fontWeight: strong ? 700 : 500 }}>{k}</span>
                  <div style={{ flex: 1, height: 10, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${val != null ? Math.max(2, (val / scale) * 100) : 0}%`, background: color, borderRadius: 99 }} /></div>
                  <span style={{ width: 36, textAlign: "right", fontFamily: NUM, fontSize: 13, fontWeight: 700, color: strong ? GOLD : "#aeb2bb" }}>{val != null ? val.toFixed(1) : "—"}</span>
                </div>
              );
              return (
                <div key={s.scoring_category_id} style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: "14px 18px", marginBottom: 10, background: "#101014", breakInside: "avoid" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{s.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 11px", borderRadius: 99, background: p.bg, color: p.c }}>{p.t}</span>
                  </div>
                  {blurb && <div style={{ fontSize: 10.5, color: MUTED, margin: "3px 0 11px" }}>{blurb}</div>}
                  {!blurb && <div style={{ height: 8 }} />}
                  {brow(firstName, s.player, `linear-gradient(90deg,#e3c560,${GOLD})`, true)}
                  {brow("Group avg", s.group, "#5f636c", false)}
                  {brow("Top of group", s.top, "#d8dade", false)}
                </div>
              );
            })}
          </div>
        )}

        {/* Objective testing */}
        {testingProfile.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <Shead kicker="The numbers don't lie" title="Objective testing" />
            <div style={leadStyle}>These come first — measured results from the testing session, same drills and same clock for everyone. <b style={{ color: "#cfd2d7" }}>Lower is better — the fastest time wins.</b> Each card shows where {firstName} landed against the day's best and the group average.</div>
            {testingProfile.map((t, i) => {
              const you = t.player_best, best = t.group_best, avg = t.group_avg;
              const youBest = best != null && you <= best + 0.0005;
              const gap = best != null ? (you - best).toFixed(2) : null;
              const havePos = avg != null && best != null && avg !== best;
              const pos = (v) => havePos ? Math.max(7, Math.min(97, 12 + ((avg - v) / (avg - best)) * 76)) : 50;
              const info = testInfo(t.test_name);
              const dot = (left, pip, labCol, lab, val, ring) => (
                <div style={{ position: "absolute", left: `${left}%`, top: 0, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ width: 13, height: 13, borderRadius: "50%", background: pip, boxShadow: ring ? `0 0 0 4px ${ring}` : "none" }} />
                  <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4, lineHeight: 1.25, textAlign: "center", whiteSpace: "nowrap", color: labCol }}>{lab}<b style={{ display: "block", fontFamily: NUM, fontSize: 9.5, letterSpacing: 0 }}>{fmt(val)}</b></span>
                </div>
              );
              return (
                <div key={`${t.test_name}-${i}`} style={{ position: "relative", overflow: "hidden", borderRadius: 11, border: `1px solid ${LINE}`, background: "radial-gradient(130% 110% at 88% 0%, #1c1c22 0%, #121216 48%, #0d0d10 100%)", padding: "8px 16px 7px", marginBottom: 7, breakInside: "avoid" }}>
                  <div style={{ position: "absolute", top: -50, right: -50, width: 150, height: 150, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#aeb2bb" }}>{t.test_name}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.04em", color: GOLD, background: GOLD_SOFT, border: `1px solid ${GOLD_LINE}`, padding: "2px 9px", borderRadius: 99, whiteSpace: "nowrap" }}>{youBest ? "🏆 Group best" : gap != null ? `${gap}s off best` : ""}</span>
                  </div>
                  {info && <div style={{ fontSize: 9.5, color: MUTED, lineHeight: 1.4, margin: "2px 0 4px", maxWidth: "92%" }}>{info}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                      <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 30, lineHeight: 0.85, color: "#f6f7f8", letterSpacing: "-0.02em" }}>{fmt(you)}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD, marginBottom: 3 }}>sec</span>
                    </div>
                    <div style={{ position: "relative", flex: 1, height: 34 }}>
                      <div style={{ position: "absolute", left: "2%", right: "2%", top: 6, height: 3, background: "rgba(255,255,255,0.13)", borderRadius: 99 }} />
                      {havePos && <div style={{ position: "absolute", top: 6, left: `${pos(avg)}%`, width: `${Math.max(0, pos(best) - pos(avg))}%`, height: 3, background: `linear-gradient(90deg, rgba(205,164,52,.2), ${GOLD})`, borderRadius: 99 }} />}
                      {avg != null && dot(pos(avg), "#5f636c", GRAY, "Avg", avg)}
                      {dot(pos(you), "#ffffff", "#ffffff", "You", you, "rgba(255,255,255,.1)")}
                      {best != null && dot(pos(best), GOLD, GOLD, "Best", best, "rgba(205,164,52,0.13)")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Skill profile + progress trend */}
        {skillProfile.length > 0 && (
          <div style={{ marginBottom: 10, ...section }}>
            <Shead kicker={isGoalie ? "Evaluator scores from the scrimmages" : "Evaluator scores vs the group"} title={isGoalie ? "Scrimmage evaluation" : "Skill profile"} />
            <div style={leadStyle}>{isGoalie ? "In the scrimmages, evaluators graded each area by eye watching live game play." : "Beyond the clock, evaluators graded each skill by eye over the sessions."} Here's how {firstName} stacks up against the group average and the top of the group, out of {scale}. Higher is better.</div>
            {skillProfile.map(s => {
              const p = skillPill(s.player, s.group, s.top);
              // Data-driven interpretation, scaled to where the player sits.
              let interp = "";
              if (s.player != null) {
                const f = (v) => (v != null ? v.toFixed(1) : "—");
                if (s.top != null && s.player >= s.top - 0.2) interp = `A genuine strength — at ${f(s.player)}, ${firstName} is right with the top of the group (${f(s.top)}). Keep it sharp and lean on it.`;
                else if (s.group != null && s.player >= s.group) interp = `Above the group average (${f(s.group)}) at ${f(s.player)}; the next target is closing the gap to the top of the group (${f(s.top)}).`;
                else if (s.group != null && s.player >= s.group - 0.6) interp = `Right around the group average (${f(s.group)}). This is the kind of gap that closes fast with a focused block of reps.`;
                else interp = `The clearest area to attack — ${f(s.player)} against a group average of ${f(s.group)} and a top of ${f(s.top)}. The single biggest opportunity to climb.`;
              }
              const sub = skillInfo(s.name, isGoalie);
              const brow = (k, val, color, strong) => (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ width: 96, flexShrink: 0, fontSize: 10.5, color: strong ? "#fff" : GRAY, fontWeight: strong ? 700 : 500 }}>{k}</span>
                  <div style={{ flex: 1, height: 10, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${val != null ? Math.max(2, (val / scale) * 100) : 0}%`, background: color, borderRadius: 99 }} /></div>
                  <span style={{ width: 36, textAlign: "right", fontFamily: NUM, fontSize: 13, fontWeight: 700, color: strong ? GOLD : "#aeb2bb" }}>{val != null ? val.toFixed(1) : "—"}</span>
                </div>
              );
              return (
                <div key={s.scoring_category_id} style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: "14px 18px", marginBottom: 12, background: "#101014", breakInside: "avoid" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{s.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 11px", borderRadius: 99, background: p.bg, color: p.c }}>{p.t}</span>
                  </div>
                  {sub && <div style={{ fontSize: 10.5, color: MUTED, margin: "3px 0 11px" }}>{sub}</div>}
                  {!sub && <div style={{ height: 8 }} />}
                  {brow(firstName, s.player, `linear-gradient(90deg,#e3c560,${GOLD})`, true)}
                  {brow("Group avg", s.group, "#5f636c", false)}
                  {brow("Top of group", s.top, "#d8dade", false)}
                  {interp && <div style={{ marginTop: 10, paddingTop: 11, borderTop: `1px solid ${LINE}`, fontSize: 11.5, color: "#c7cbd2", lineHeight: 1.5 }}>{interp}</div>}
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
                <div style={{ display: "flex", alignItems: "center", gap: 18, background: "linear-gradient(120deg,#1a1812,#121216)", border: `1px solid ${GOLD_LINE}`, borderRadius: 16, padding: "16px 22px", marginBottom: 16 }}>
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontFamily: NUM, fontWeight: 800, fontSize: 34, color: totalDelta >= 0 ? "#5fd08a" : "#e0944a", lineHeight: 1 }}>{totalDelta >= 0 ? "+" : ""}{totalDelta.toFixed(1)}</div>
                    <div style={{ fontSize: 10, color: GOLD, marginTop: 4, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>pts · {n} sessions</div>
                  </div>
                  <div style={{ width: 1, alignSelf: "stretch", background: GOLD_LINE }} />
                  <div style={{ color: "#c7cbd2", fontSize: 12.5, lineHeight: 1.55 }}>
                    {firstName} {totalDelta >= 0.3 ? "improved" : totalDelta <= -0.3 ? "slipped" : "held steady"} from <b style={{ color: "#fff" }}>{firstP.toFixed(1)}</b> in session 1 to <b style={{ color: "#fff" }}>{lastP.toFixed(1)}</b> by session {n}{totalDelta >= 0.3 ? " — a clear upward trajectory across the evaluation." : "."} The line below tracks every session against the group.
                  </div>
                </div>
              )}

              {/* Line chart */}
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, background: "#0e0e12", padding: "8px 6px 4px" }}>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
                  <defs>
                    <linearGradient id="progFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GOLD} stopOpacity="0.28" />
                      <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {gridVals.map((g, i) => (
                    <g key={i}>
                      <line x1={padX} y1={y(g)} x2={W - padX} y2={y(g)} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
                      <text x={padX - 8} y={y(g) + 3} textAnchor="end" fontSize="11" fill="#6b7078" fontFamily={NUM}>{g}</text>
                    </g>
                  ))}
                  <path d={area} fill="url(#progFill)" />
                  <path d={line("group")} fill="none" stroke="#4a4f57" strokeWidth="2" strokeDasharray="5 5" />
                  <path d={line("player")} fill="none" stroke={GOLD} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                  {prog.map((p, i) => (
                    <g key={i}>
                      <circle cx={x(i)} cy={y(p.group)} r="3.5" fill="#4a4f57" />
                      <circle cx={x(i)} cy={y(p.player)} r="5.5" fill={GOLD} stroke="#0e0e12" strokeWidth="2" />
                      <text x={x(i)} y={y(p.player) - 12} textAnchor="middle" fontSize="14" fontWeight="700" fill="#f6f7f8" fontFamily={NUM}>{p.player.toFixed(1)}</text>
                      <text x={x(i)} y={H - 22} textAnchor="middle" fontSize="12" fontWeight="700" fill="#aeb2bb" fontFamily={SANS}>SESSION {p.session_number}</text>
                    </g>
                  ))}
                </svg>
                <div style={{ display: "flex", gap: 18, justifyContent: "center", padding: "4px 0 10px", fontSize: 11, color: MUTED, fontWeight: 600 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 3, background: GOLD, borderRadius: 2 }} />{firstName}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 0, borderTop: "2px dashed #4a4f57" }} />Group average</span>
                </div>
              </div>

              {/* Per-session deltas */}
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                {prog.map((p, i) => {
                  const d = i === 0 ? null : Math.round((p.player - prog[i - 1].player) * 10) / 10;
                  return (
                    <div key={i} style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 12, background: "#101014", padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 9.5, color: GRAY, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Session {p.session_number}</div>
                      <div style={{ fontFamily: NUM, fontSize: 24, fontWeight: 800, color: "#fff", margin: "3px 0 2px" }}>{p.player.toFixed(1)}</div>
                      {d == null ? (
                        <div style={{ fontSize: 10.5, color: MUTED }}>starting point</div>
                      ) : (
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: d > 0 ? "#5fd08a" : d < 0 ? "#e0944a" : MUTED }}>{d > 0 ? "▲ +" : d < 0 ? "▼ " : "– "}{Math.abs(d).toFixed(1)} vs S{prog[i - 1].session_number}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Evaluator notes */}
        {notes.length > 0 && (
          <div style={{ marginBottom: 10, ...section }}>
            <Shead kicker="Selected observations" title="What the evaluators saw" />
            <div style={leadStyle}>In their own words — the notes evaluators wrote while watching {firstName} play.</div>
            {notes.slice(0, 12).map((n, i) => (
              <div key={i} style={{ borderLeft: `2px solid ${GOLD}`, padding: "1px 0 1px 14px", marginBottom: 9, breakInside: "avoid" }}>
                <div style={{ color: "#dfe1e4", lineHeight: 1.55, fontStyle: "italic", fontSize: 12.5 }}>&ldquo;{n.note_text}&rdquo;</div>
                <div style={{ fontSize: 9.5, color: MUTED, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>Session {n.session_number}</div>
              </div>
            ))}
            {(strengthSkill || focusSkill || standing) && (
              <div style={{ marginTop: 16, background: GOLD_SOFT, border: `1px solid ${GOLD_LINE}`, borderRadius: 14, padding: "14px 18px", breakInside: "avoid" }}>
                <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD, fontWeight: 800, marginBottom: 7 }}>What it adds up to</div>
                <div style={{ fontSize: 12.5, color: "#dfe1e4", lineHeight: 1.6 }}>
                  Read together, the scores tell a consistent story.{strengthSkill && weaknessSkill && strengthSkill.scoring_category_id !== weaknessSkill.scoring_category_id ? <> {firstName}'s <b style={{ color: "#fff" }}>{strengthSkill.name.toLowerCase()}</b> ({strengthSkill.player.toFixed(1)}) grades out as the relative strength, while <b style={{ color: "#fff" }}>{weaknessSkill.name.toLowerCase()}</b> ({weaknessSkill.player.toFixed(1)}) is the area to attack first</> : strengthSkill ? <> {firstName}'s scores sit close together, with <b style={{ color: "#fff" }}>{strengthSkill.name.toLowerCase()}</b> grading highest</> : ""}.{standing ? <> Overall {firstName} graded out <b style={{ color: "#fff" }}>{standing.tier.toLowerCase()}</b> — {standing.band.toLowerCase()} of {standing.total} {cohortWord}. The development plan on the next page lays out the order to climb.</> : ""}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Summary & recommendations */}
        {(standing || skillFocus.length > 0 || testFocus.length > 0) && (
          <div style={{ marginBottom: 10, ...section }}>
            <Shead kicker="The bottom line" title="Summary & recommendations" />
            {standing && (
              <div style={{ display: "flex", alignItems: "center", gap: 22, background: "linear-gradient(120deg,#1a1812,#121216)", border: `1px solid ${GOLD_LINE}`, borderRadius: 16, padding: "12px 20px", breakInside: "avoid" }}>
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 30, color: GOLD, lineHeight: 1 }}>{standing.band}</div>
                  <div style={{ fontSize: 10.5, color: GOLD, marginTop: 4, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>of the group</div>
                </div>
                <div style={{ width: 1, alignSelf: "stretch", background: GOLD_LINE }} />
                <div>
                  <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 21, color: "#fff" }}>{standing.tier}</div>
                  <div style={{ color: "#b8bcc4", lineHeight: 1.55, marginTop: 4, fontSize: 12 }}>Across {isGoalie ? "the evaluators' scores" : "testing and evaluator scores"}, {firstName} graded out in the <b style={{ color: "#fff" }}>{standing.band.toLowerCase()}</b> of {standing.total} {cohortWord} evaluated. Here's exactly what to chase to climb.</div>
                </div>
              </div>
            )}
            <div style={{ marginTop: 10, borderLeft: `2px solid ${GOLD}`, background: "rgba(205,164,52,0.06)", borderRadius: "0 10px 10px 0", padding: "9px 14px", color: "#b8bcc4", fontSize: 11, lineHeight: 1.5, breakInside: "avoid" }}>
              <b style={{ color: "#fff" }}>A note on the numbers.</b> Every evaluation is a snapshot of one moment in a long journey. In a group this size, some athletes have skated for years, some are just getting started — so a score is never a verdict on a player. Read each number here as a map of what to work on next, not a grade. With the right focus, these bars move quickly.
            </div>
            <div style={{ lineHeight: 1.55, marginTop: 11, fontSize: 12.5, color: "#c7cbd2" }}>
              {standing && <p style={{ marginTop: 0 }}>If {firstName} invests in development, the order matters. Build the foundation first and the rest compounds. Here's the path we'd recommend:</p>}
              {skillFocus.length > 0 && (
                <>
                  <div style={{ background: GOLD_SOFT, border: `1px solid ${GOLD_LINE}`, borderRadius: 12, padding: "11px 15px", margin: "9px 0", breakInside: "avoid" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD, fontWeight: 800, marginBottom: 6 }}>{isGoalie ? "Start here — the priority" : "Start here — the foundation"}</div>
                    <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 18, color: "#fff", marginBottom: 4 }}>1. {skillFocus[0].name}</div>
                    <div style={{ color: "#c7cbd2" }}>{skillFocus[0].name} is {cascadeFor(skillFocus[0].name)}. It's a {skillFocus[0].gap.toFixed(1)}-point gap to the top of the group — the single best place to start.</div>
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${GOLD_LINE}`, color: "#c7cbd2" }}><b style={{ color: GOLD }}>At the top of the group, this looks like</b> {skillElite(skillFocus[0].name, isGoalie)}.</div>
                  </div>
                  {skillFocus.length > 1 && (
                    <>
                      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD, fontWeight: 800, margin: "11px 0 6px" }}>Then, in order</div>
                      <ol start={2} style={{ margin: 0, paddingLeft: 18 }}>
                        {skillFocus.slice(1).map(s => (<li key={s.scoring_category_id} style={{ marginBottom: 4, color: "#c7cbd2" }}><b style={{ color: "#fff" }}>{s.name}</b> — about {s.gap.toFixed(1)} behind the top of the group; gets easier once the foundation above is in place.</li>))}
                      </ol>
                    </>
                  )}
                </>
              )}
              {testFocus.length > 0 ? (
                <p style={{ margin: "11px 0 0", color: "#c7cbd2" }}>The objective targets to chase first — {testFocus.map((t, i) => <b key={t.test_name} style={{ color: "#fff" }}>{t.test_name}{i < testFocus.length - 1 ? " and " : ""}</b>)} — tie straight back to the foundation above. Attack it through the off-season, then come back and beat these numbers. The work shows up on the sheet.</p>
              ) : (
                <p style={{ margin: "11px 0 0", color: "#c7cbd2" }}>Attack the foundation through the off-season, then come back and beat these numbers at the next evaluation. The work shows up on the sheet.</p>
              )}
            </div>


            <div style={{ borderTop: `1px solid ${LINE}`, padding: "11px 0 40px", marginTop: 16, display: "flex", justifyContent: "space-between", color: MUTED, fontSize: 10 }}>
              <span style={{ fontFamily: SERIF, fontStyle: "italic", color: GOLD, fontWeight: 700 }}>Sideline Star</span>
              <span>{category?.name} · {fullName} · {isGoalie ? "Goaltending" : "Player"} Development Report</span>
            </div>
          </div>
        )}
      </div>

      <style>{`
        html, body { background: ${BG}; }
        @page { size: A4; margin: 0; }
        @media print {
          html, body { background: ${BG}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .ssrpt { max-width: none !important; width: 100% !important; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  );
}
