"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const GOLD = "#c79a2c";
const GOLD_SOFT = "#f6edd2";
const INK = "#1a1a1a";
const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function Bar({ pct, color = GOLD, h = 8, track = "#eee7d6" }) {
  return (
    <div style={{ flex: 1, height: h, background: track, borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.max(2, Math.min(100, pct))}%`, background: color, borderRadius: 99 }} />
    </div>
  );
}

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
        setTimeout(() => window.print(), 900);
      });
  }, [athleteId, catId]);

  if (!data) return (
    <div data-theme="premium-light" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: SANS, color: "#6b7280" }}>
      Preparing report…
    </div>
  );

  const { athlete, category, notes = [], standing, skillProfile = [], testingProfile = [] } = data;
  const scale = category?.scoring_scale || 10;
  const fullName = `${athlete?.first_name || ""} ${athlete?.last_name || ""}`.trim();
  const firstName = athlete?.first_name || "This athlete";

  // Foundational priority — skating is the base everything builds on, then
  // hands, then sense, etc. We attack the biggest gaps, but order them so the
  // most foundational one is recommended FIRST (it lifts the others).
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
  // biggest gaps to the top, re-ordered foundation-first
  const skillFocus = skillProfile
    .filter(s => s.player != null && s.top != null)
    .map(s => ({ ...s, gap: Math.round((s.top - s.player) * 10) / 10 }))
    .filter(s => s.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 4)
    .sort((a, b) => foundationRank(a.name) - foundationRank(b.name) || b.gap - a.gap);

  // Testing focus: biggest gaps to the group best (lower = better, so positive gap = behind)
  const testFocus = testingProfile
    .filter(t => t.player_best != null && t.group_best != null)
    .map(t => ({ ...t, gap: Math.round((t.player_best - t.group_best) * 1000) / 1000 }))
    .filter(t => t.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 2);

  const Section = ({ title, kicker, children }) => (
    <div style={{ marginBottom: 26 }}>
      {kicker && <div style={{ fontFamily: SANS, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: GOLD, fontWeight: 700, marginBottom: 4 }}>{kicker}</div>}
      <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 20, color: INK, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid ${GOLD_SOFT}` }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div data-theme="premium-light" style={{ fontFamily: SANS, maxWidth: 820, margin: "0 auto", padding: "0 0 40px", color: "#1f2430", fontSize: 13, background: "#fff" }}>

      {/* ── Cover band ── */}
      <div style={{ background: `linear-gradient(135deg, #2a2a2a, #111)`, padding: "34px 36px", color: "#f4f1ea", position: "relative", overflow: "hidden" }}>
        <div style={{ fontFamily: SANS, fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", color: GOLD, fontWeight: 700 }}>Sideline Star · Development Report</div>
        <div style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 900, lineHeight: 1.05, marginTop: 10 }}>{fullName}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {athlete?.position && <span style={{ border: `1px solid ${GOLD}`, color: GOLD, padding: "3px 12px", borderRadius: 99, fontSize: 11, textTransform: "capitalize", letterSpacing: "0.04em" }}>{athlete.position}</span>}
          {athlete?.external_id && <span style={{ border: "1px solid rgba(244,241,234,0.3)", padding: "3px 12px", borderRadius: 99, fontSize: 11 }}>{athlete.external_id}</span>}
          <span style={{ border: "1px solid rgba(244,241,234,0.3)", padding: "3px 12px", borderRadius: 99, fontSize: 11 }}>{category?.name}</span>
          <span style={{ border: "1px solid rgba(244,241,234,0.3)", padding: "3px 12px", borderRadius: 99, fontSize: 11 }}>{new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        </div>
      </div>

      <div style={{ padding: "30px 36px 0" }}>

        {/* ── Where they stood ── */}
        <Section title="Where they stood" kicker="Overall standing">
          {standing ? (
            <div style={{ display: "flex", alignItems: "center", gap: 20, background: GOLD_SOFT, borderRadius: 14, padding: "20px 24px" }}>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 30, color: GOLD, lineHeight: 1 }}>{standing.band}</div>
                <div style={{ fontSize: 11, color: "#7a6a3a", marginTop: 4, fontWeight: 600 }}>of the group</div>
              </div>
              <div style={{ width: 1, alignSelf: "stretch", background: "rgba(168,127,28,0.25)" }} />
              <div>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: INK }}>{standing.tier}</div>
                <div style={{ color: "#4a4434", lineHeight: 1.55, marginTop: 4 }}>
                  {firstName} graded out in the <b>{standing.band.toLowerCase()}</b> of {standing.total} skaters evaluated. Below is where the strengths are — and exactly what to chase to climb.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: "#6b7280" }}>Not enough scores yet to place an overall standing.</div>
          )}
        </Section>

        {/* ── Skill profile ── */}
        {skillProfile.length > 0 && (
          <Section title="Skill profile" kicker="Evaluator scores vs the group">
            <div style={{ fontSize: 11.5, color: "#6b7280", marginBottom: 14, display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: GOLD, display: "inline-block" }} /> {firstName}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 2, background: "#9aa0aa", display: "inline-block" }} /> Group average</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 2, background: INK, display: "inline-block" }} /> Top of group</span>
            </div>
            {skillProfile.map(s => {
              const pPct = s.player != null ? (s.player / scale) * 100 : 0;
              const gPct = s.group != null ? (s.group / scale) * 100 : null;
              const tPct = s.top != null ? (s.top / scale) * 100 : null;
              return (
                <div key={s.scoring_category_id} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{s.name}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: GOLD }}>{s.player != null ? s.player.toFixed(1) : "—"}<span style={{ color: "#9aa0aa", fontWeight: 400 }}> / {scale}</span></span>
                  </div>
                  <div style={{ position: "relative", height: 10 }}>
                    <Bar pct={pPct} h={10} />
                    {gPct != null && <div title="Group average" style={{ position: "absolute", top: -3, bottom: -3, left: `calc(${Math.min(100, gPct)}% - 1px)`, width: 2, background: "#9aa0aa" }} />}
                    {tPct != null && <div title="Top of group" style={{ position: "absolute", top: -3, bottom: -3, left: `calc(${Math.min(100, tPct)}% - 1px)`, width: 2, background: INK }} />}
                  </div>
                </div>
              );
            })}
          </Section>
        )}

        {/* ── Objective testing ── */}
        {testingProfile.length > 0 && (
          <Section title="Objective testing" kicker="The numbers don't lie">
            <div style={{ fontSize: 12, color: "#4a4434", lineHeight: 1.6, marginBottom: 16, background: GOLD_SOFT, borderRadius: 12, padding: "12px 16px" }}>
              These are measured results — same drills, same clock for everyone. Lower is better. The goal is simple:
              <b> beat these numbers next time you test.</b> Put in the work and the bars move.
            </div>
            {testingProfile.filter(t => t.player_best != null).map(t => {
              const maxV = Math.max(t.player_best, t.group_avg ?? 0, t.group_best ?? 0) * 1.12 || 1;
              const isBest = t.group_best != null && t.player_best <= t.group_best + 0.0005;
              const gap = t.group_best != null ? Math.round((t.player_best - t.group_best) * 1000) / 1000 : null;
              const rows = [
                { label: firstName, v: t.player_best, color: GOLD, strong: true },
                { label: "Group average", v: t.group_avg, color: "#9aa0aa" },
                { label: "Group best", v: t.group_best, color: INK },
              ].filter(r => r.v != null);
              return (
                <div key={t.test_name} style={{ marginBottom: 16, border: "1px solid #eee7d6", borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{t.test_name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isBest ? "#2f8f2f" : GOLD }}>
                      {isBest ? "Group best — outstanding" : `${gap}s off the group best`}
                    </span>
                  </div>
                  {rows.map(r => (
                    <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                      <span style={{ width: 92, fontSize: 11, color: r.strong ? INK : "#6b7280", fontWeight: r.strong ? 700 : 400, flexShrink: 0 }}>{r.label}</span>
                      <Bar pct={(r.v / maxV) * 100} color={r.color} h={r.strong ? 9 : 6} />
                      <span style={{ width: 44, textAlign: "right", fontSize: 11.5, fontWeight: r.strong ? 700 : 500, color: r.strong ? GOLD : "#4a4434" }}>{r.v.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </Section>
        )}

        {/* ── Plan of action ── */}
        {(skillFocus.length > 0 || testFocus.length > 0 || standing) && (
          <Section title="Plan of action" kicker="Where to put the work">
            <div style={{ color: "#1f2430", lineHeight: 1.7 }}>
              {standing && <p style={{ marginTop: 0 }}>{firstName} graded out <b>{standing.tier}</b> ({standing.band.toLowerCase()} of the group). If they invest in development, the order matters — build the foundation first and the rest compounds. Here's the path we'd recommend:</p>}
              {skillFocus.length > 0 && (() => {
                const primary = skillFocus[0];
                const rest = skillFocus.slice(1);
                return (
                  <>
                    <div style={{ background: GOLD_SOFT, borderRadius: 12, padding: "14px 18px", margin: "14px 0" }}>
                      <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD, fontWeight: 700, marginBottom: 6 }}>Start here — the foundation</div>
                      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 18, color: INK, marginBottom: 4 }}>1. {primary.name}</div>
                      <div style={{ color: "#4a4434" }}>{primary.name} is {cascadeFor(primary.name)}. It's a {primary.gap.toFixed(1)}-point gap to the top of the group — the single best place to start.</div>
                    </div>
                    {rest.length > 0 && (
                      <>
                        <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD, fontWeight: 700, marginTop: 14, marginBottom: 8 }}>Then, in order</div>
                        <ol start={2} style={{ margin: 0, paddingLeft: 18 }}>
                          {rest.map(s => (
                            <li key={s.scoring_category_id} style={{ marginBottom: 6 }}>
                              <b>{s.name}</b> — about {s.gap.toFixed(1)} behind the top of the group; gets easier once the foundation above is in place.
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                  </>
                );
              })()}
              {testFocus.length > 0 && (
                <>
                  <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD, fontWeight: 700, marginTop: 14, marginBottom: 8 }}>Objective targets to chase</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {testFocus.map(t => (
                      <li key={t.test_name} style={{ marginBottom: 6 }}>
                        <b>{t.test_name}</b> — best of {t.player_best.toFixed(3)}, ~{t.gap.toFixed(3)}s behind the group's best ({t.group_best.toFixed(3)}). Trainable with focused reps.
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p style={{ marginBottom: 0, marginTop: 14, color: "#4a4434" }}>
                Attack the foundation now and through the off-season, then come back and beat these numbers at the next evaluation. The work shows up on the sheet.
              </p>
            </div>
          </Section>
        )}

        {/* ── Evaluator observations ── */}
        {notes.length > 0 && (
          <Section title="What the evaluators saw" kicker="Selected observations">
            {notes.slice(0, 8).map((n, i) => (
              <div key={i} style={{ borderLeft: `3px solid ${GOLD}`, paddingLeft: 14, marginBottom: 12 }}>
                <div style={{ color: "#1f2430", lineHeight: 1.6, fontStyle: "italic" }}>&ldquo;{n.note_text}&rdquo;</div>
                <div style={{ fontSize: 10.5, color: "#9aa0aa", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>Session {n.session_number}</div>
              </div>
            ))}
          </Section>
        )}

        {/* ── Footer ── */}
        <div style={{ borderTop: `1px solid #eee7d6`, paddingTop: 16, marginTop: 8, display: "flex", justifyContent: "space-between", color: "#9aa0aa", fontSize: 10.5 }}>
          <span style={{ fontFamily: SERIF, fontStyle: "italic", color: GOLD, fontWeight: 700 }}>Sideline Star</span>
          <span>{category?.name} · {fullName} · Player Development Report</span>
        </div>
      </div>

      <style>{`
        @media print {
          @page { margin: 12mm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  );
}

export default function PDFReportPage() {
  return (
    <Suspense fallback={<div data-theme="premium-light" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>Preparing…</div>}>
      <PDFReportInner />
    </Suspense>
  );
}
