"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

// ── Premium dark theme tokens ──
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

// Map a test name to a short parent-friendly explanation of what it measures.
function testInfo(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("backward")) return "Straight-line backward speed — edge control, posture and defensive footspeed.";
  if (n.includes("puck")) return "Speed while controlling the puck — how much pace holds up with the puck on the stick.";
  if (n.includes("forward") || (n.includes("30m") && !n.includes("backward"))) return "Flat-out straight-line speed — pure acceleration and stride power.";
  if (n.includes("weave") || n.includes("agility") || n.includes("cone")) return "Tight turns and cuts through obstacles — balance, edge control and quickness in close.";
  if (n.includes("transition") || n.includes("pivot")) return "Switching between forward and backward skating — pivots, footwork and clean direction changes.";
  if (n.includes("stop") || n.includes("caps")) return "Explosive stop-and-start — how fast they stop hard and get moving again the other way.";
  if (n.includes("reaction") || n.includes("start")) return "First-step quickness off the whistle — explosiveness and reaction time.";
  return "";
}

const fmt = (v) => (v == null ? "—" : v.toFixed(2));

function PDFReportInner() {
  const searchParams = useSearchParams();
  const athleteId = searchParams.get("athlete");
  const catId = searchParams.get("cat");
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!athleteId || !catId) return;
    fetch(`/api/athletes/${athleteId}/report?cat=${catId}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setTimeout(() => window.print(), 1100);
      });
  }, [athleteId, catId]);

  const Fonts = () => (
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Archivo:wght@600;700;800;900&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" />
  );

  if (!data) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: SANS, color: GRAY, background: BG }}>
      <Fonts />Preparing report…
    </div>
  );

  const { athlete, category, notes = [], standing, skillProfile = [], testingProfile = [] } = data;
  const scale = category?.scoring_scale || 10;
  const fullName = `${athlete?.first_name || ""} ${athlete?.last_name || ""}`.trim();
  const firstName = athlete?.first_name || "This athlete";

  // ── Foundation-first recommendation logic (data-driven, unchanged) ──
  const FOUNDATION = ["power skat", "skat", "edge", "balance", "puck", "stick", "hand", "iq", "sense", "position", "compete", "battle", "shot", "shoot", "pass"];
  const foundationRank = (name) => {
    const n = (name || "").toLowerCase();
    const i = FOUNDATION.findIndex(f => n.includes(f));
    return i < 0 ? 999 : i;
  };
  const cascadeFor = (name) => {
    const n = (name || "").toLowerCase();
    if (n.includes("skat") || n.includes("edge") || n.includes("balance"))
      return "the foundation everything else is built on — stronger edges, balance and top speed make puck control, shooting and compete battles all easier, so improving it first tends to lift the other scores with it";
    if (n.includes("puck") || n.includes("stick") || n.includes("hand"))
      return "a high-leverage base skill — once the hands are reliable at speed, hockey sense and shooting under pressure improve on their own";
    if (n.includes("iq") || n.includes("sense") || n.includes("position"))
      return "where reads make every physical tool more effective — being in the right place beats raw speed";
    return "the highest-leverage gap to close first; the areas below get easier once it's in place";
  };
  const skillFocus = skillProfile
    .filter(s => s.player != null && s.top != null)
    .map(s => ({ ...s, gap: Math.round((s.top - s.player) * 10) / 10 }))
    .filter(s => s.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 4)
    .sort((a, b) => foundationRank(a.name) - foundationRank(b.name) || b.gap - a.gap);
  const testFocus = testingProfile
    .filter(t => t.player_best != null && t.group_best != null)
    .map(t => ({ ...t, gap: Math.round((t.player_best - t.group_best) * 1000) / 1000 }))
    .filter(t => t.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 2);

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
  // a section that opens its own page with a top gap (no jammed tops, no splits)
  const newPage = { breakBefore: "page", paddingTop: 42 };

  return (
    <div className="ssrpt" style={{ fontFamily: SANS, maxWidth: 720, margin: "0 auto", color: TXT, fontSize: 13, lineHeight: 1.55, background: BG }}>
      <Fonts />

      {/* ── Cover ── */}
      <div style={{ background: "radial-gradient(120% 140% at 80% 0%, #23211a 0%, #121214 40%, #0a0a0c 100%)", padding: "32px 34px", borderBottom: `1px solid ${GOLD_LINE}`, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -90, right: -60, width: 320, height: 320, borderRadius: "50%", border: "1px solid rgba(205,164,52,0.16)" }} />
        <div style={{ position: "absolute", top: -40, right: -10, width: 230, height: 230, borderRadius: "50%", border: "1px solid rgba(205,164,52,0.1)" }} />
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

        {/* ── Objective testing (first) ── */}
        {testingProfile.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <Shead kicker="The numbers don't lie" title="Objective testing" />
            <div style={leadStyle}>These come first — measured results from the testing session, same drills and same clock for everyone. <b style={{ color: "#cfd2d7" }}>Lower is better — the fastest time wins.</b> Each card shows where {firstName} landed against the day's best and the group average.</div>
            {testingProfile.filter(t => t.player_best != null).map((t, i) => {
              const you = t.player_best, best = t.group_best, avg = t.group_avg;
              const youBest = best != null && you <= best + 0.0005;
              const gap = best != null ? (you - best).toFixed(2) : null;
              const havePos = avg != null && best != null && avg !== best;
              const pos = (v) => havePos ? Math.max(7, Math.min(97, 12 + ((avg - v) / (avg - best)) * 76)) : 50;
              const info = testInfo(t.test_name);
              const dot = (left, pip, labCol, lab, val, ring) => (
                <div style={{ position: "absolute", left: `${left}%`, top: 0, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ width: 13, height: 13, borderRadius: "50%", background: pip, boxShadow: ring ? `0 0 0 4px ${ring}` : "none" }} />
                  <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4, lineHeight: 1.25, textAlign: "center", whiteSpace: "nowrap", color: labCol }}>
                    {lab}<b style={{ display: "block", fontFamily: NUM, fontSize: 9.5, letterSpacing: 0 }}>{fmt(val)}</b>
                  </span>
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

        {/* ── Skill profile ── */}
        {skillProfile.length > 0 && (
          <div style={{ marginBottom: 10, ...newPage }}>
            <Shead kicker="Evaluator scores vs the group" title="Skill profile" />
            <div style={leadStyle}>Beyond the clock, evaluators graded each skill by eye over the sessions. Here's how {firstName} stacks up against the group average and the top of the group, out of {scale}. Higher is better.</div>
            {skillProfile.map(s => {
              const p = skillPill(s.player, s.group, s.top);
              const brow = (k, val, color, strong) => (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                  <span style={{ width: 92, flexShrink: 0, fontSize: 10, color: strong ? "#fff" : GRAY, fontWeight: strong ? 700 : 500 }}>{k}</span>
                  <div style={{ flex: 1, height: 7, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${val != null ? Math.max(2, (val / scale) * 100) : 0}%`, background: color, borderRadius: 99 }} />
                  </div>
                  <span style={{ width: 34, textAlign: "right", fontFamily: NUM, fontSize: 12, fontWeight: 700, color: strong ? GOLD : "#aeb2bb" }}>{val != null ? val.toFixed(1) : "—"}</span>
                </div>
              );
              return (
                <div key={s.scoring_category_id} style={{ border: `1px solid ${LINE}`, borderRadius: 13, padding: "9px 16px", marginBottom: 8, background: "#101014", breakInside: "avoid" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{s.name}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 800, padding: "3px 10px", borderRadius: 99, background: p.bg, color: p.c }}>{p.t}</span>
                  </div>
                  {brow(firstName, s.player, `linear-gradient(90deg,#e3c560,${GOLD})`, true)}
                  {brow("Group avg", s.group, "#5f636c", false)}
                  {brow("Top of group", s.top, "#d8dade", false)}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Evaluator notes ── */}
        {notes.length > 0 && (
          <div style={{ marginBottom: 10, ...newPage }}>
            <Shead kicker="Selected observations" title="What the evaluators saw" />
            <div style={leadStyle}>In their own words — the notes evaluators wrote while watching {firstName} play.</div>
            {notes.slice(0, 10).map((n, i) => (
              <div key={i} style={{ borderLeft: `2px solid ${GOLD}`, padding: "1px 0 1px 14px", marginBottom: 9, breakInside: "avoid" }}>
                <div style={{ color: "#dfe1e4", lineHeight: 1.55, fontStyle: "italic", fontSize: 12.5 }}>&ldquo;{n.note_text}&rdquo;</div>
                <div style={{ fontSize: 9.5, color: MUTED, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>Session {n.session_number}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Summary & recommendations ── */}
        {(standing || skillFocus.length > 0 || testFocus.length > 0) && (
          <div style={{ marginBottom: 10, ...newPage }}>
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
                  <div style={{ color: "#b8bcc4", lineHeight: 1.55, marginTop: 4, fontSize: 12 }}>Across testing and evaluator scores, {firstName} graded out in the <b style={{ color: "#fff" }}>{standing.band.toLowerCase()}</b> of {standing.total} skaters evaluated. Here's exactly what to chase to climb.</div>
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
                    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD, fontWeight: 800, marginBottom: 6 }}>Start here — the foundation</div>
                    <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 18, color: "#fff", marginBottom: 4 }}>1. {skillFocus[0].name}</div>
                    <div style={{ color: "#c7cbd2" }}>{skillFocus[0].name} is {cascadeFor(skillFocus[0].name)}. It's a {skillFocus[0].gap.toFixed(1)}-point gap to the top of the group — the single best place to start.</div>
                  </div>
                  {skillFocus.length > 1 && (
                    <>
                      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD, fontWeight: 800, margin: "11px 0 6px" }}>Then, in order</div>
                      <ol start={2} style={{ margin: 0, paddingLeft: 18 }}>
                        {skillFocus.slice(1).map(s => (
                          <li key={s.scoring_category_id} style={{ marginBottom: 4, color: "#c7cbd2" }}><b style={{ color: "#fff" }}>{s.name}</b> — about {s.gap.toFixed(1)} behind the top of the group; gets easier once the foundation above is in place.</li>
                        ))}
                      </ol>
                    </>
                  )}
                </>
              )}
              {testFocus.length > 0 && (
                <p style={{ margin: "11px 0 0", color: "#c7cbd2" }}>
                  The objective targets to chase first — {testFocus.map((t, i) => <b key={t.test_name} style={{ color: "#fff" }}>{t.test_name}{i < testFocus.length - 1 ? " and " : ""}</b>)} — tie straight back to the foundation above. Attack it through the off-season, then come back and beat these numbers. The work shows up on the sheet.
                </p>
              )}
              {testFocus.length === 0 && <p style={{ margin: "11px 0 0", color: "#c7cbd2" }}>Attack the foundation through the off-season, then come back and beat these numbers at the next evaluation. The work shows up on the sheet.</p>}
            </div>

            <div style={{ borderTop: `1px solid ${LINE}`, padding: "11px 0 40px", marginTop: 16, display: "flex", justifyContent: "space-between", color: MUTED, fontSize: 10 }}>
              <span style={{ fontFamily: SERIF, fontStyle: "italic", color: GOLD, fontWeight: 700 }}>Sideline Star</span>
              <span>{category?.name} · {fullName} · Player Development Report</span>
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

export default function PDFReportPage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: BG, color: GRAY }}>Preparing…</div>}>
      <PDFReportInner />
    </Suspense>
  );
}
