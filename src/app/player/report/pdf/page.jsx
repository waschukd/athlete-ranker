"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

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
        setTimeout(() => window.print(), 800);
      });
  }, [athleteId, catId]);

  if (!data) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#6b7280" }}>
      Preparing report...
    </div>
  );

  const { athlete, sessions, scores, notes, ranking, total_athletes } = data;
  const scale = data.category?.scoring_scale || 10;
  const percentile = total_athletes > 1
    ? Math.round(((total_athletes - ranking?.rank) / (total_athletes - 1)) * 100)
    : 100;

  // Agreement calculation
  const sessionAgreement = {};
  for (const session of sessions) {
    const ss = scores.filter(s => s.session_number === session.session_number);
    if (!ss.length) continue;
    const cats = [...new Set(ss.map(s => s.scoring_category_id))];
    const catAgreements = cats.map(catId => {
      const vals = ss.filter(s => s.scoring_category_id === catId).map(s => parseFloat(s.score));
      if (vals.length < 2) return 100;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length);
      return Math.max(0, Math.min(100, Math.round((1 - sd / scale) * 100)));
    });
    sessionAgreement[session.session_number] = catAgreements.length
      ? Math.round(catAgreements.reduce((a, b) => a + b, 0) / catAgreements.length) : null;
  }
  const overallAgreement = Object.values(sessionAgreement).filter(Boolean).length
    ? Math.round(Object.values(sessionAgreement).filter(Boolean).reduce((a, b) => a + b, 0) / Object.values(sessionAgreement).filter(Boolean).length)
    : null;

  // Per session score breakdown
  const sessionBreakdown = sessions.map(s => {
    const ss = scores.filter(sc => sc.session_number === s.session_number);
    const byEval = {};
    for (const sc of ss) {
      if (!byEval[sc.evaluator_name]) byEval[sc.evaluator_name] = {};
      byEval[sc.evaluator_name][sc.category_name] = sc.score;
    }
    const cats = [...new Set(ss.map(sc => sc.category_name))];
    const catAvgs = cats.map(cat => {
      const vals = ss.filter(sc => sc.category_name === cat).map(sc => parseFloat(sc.score));
      return { name: cat, avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 };
    });
    const sd = ranking?.session_scores?.[s.session_number];
    return { session: s, sd, byEval, catAvgs };
  });

  const ORANGE = "#1A6BFF";
  const LIGHT = "#fff7f4";
  const agreementColor = (pct) => pct >= 95 ? "#16a34a" : pct >= 80 ? "#d97706" : "#dc2626";
  const agreementBg = (pct) => pct >= 95 ? "#f0fdf4" : pct >= 80 ? "#fffbeb" : "#fef2f2";

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: 800, margin: "0 auto", padding: "32px 24px", color: "#111827", fontSize: 13 }}>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${ORANGE}, #4D8FFF)`, borderRadius: 16, padding: "24px 28px", marginBottom: 24, color: "white" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>AthleteRanker · Player Report</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}>{athlete.first_name} {athlete.last_name}</div>
            <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
              {athlete.position && <span style={{ background: "rgba(255,255,255,0.2)", padding: "2px 10px", borderRadius: 20, fontSize: 12, textTransform: "capitalize" }}>{athlete.position}</span>}
              {athlete.external_id && <span style={{ background: "rgba(255,255,255,0.2)", padding: "2px 10px", borderRadius: 20, fontSize: 12 }}>{athlete.external_id}</span>}
              <span style={{ background: "rgba(255,255,255,0.2)", padding: "2px 10px", borderRadius: 20, fontSize: 12 }}>{data.category?.name}</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2 }}>Generated</div>
            <div style={{ fontSize: 12 }}>{new Date().toLocaleDateString()}</div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Overall Rank", value: `#${ranking?.rank || "—"}`, sub: `of ${total_athletes}` },
          { label: "Percentile", value: `${percentile}th`, sub: percentile >= 90 ? "Elite" : percentile >= 75 ? "Above Average" : percentile >= 50 ? "Average" : "Developing" },
          { label: "Total Score", value: `${ranking?.weighted_total?.toFixed(1) || "—"}`, sub: "out of 100" },
          ...(overallAgreement !== null ? [{ label: "Eval Agreement", value: `${overallAgreement}%`, sub: overallAgreement >= 95 ? "Strong Consensus" : overallAgreement >= 80 ? "General Agreement" : "Mixed Assessments", color: agreementColor(overallAgreement), bg: agreementBg(overallAgreement) }] : []),
        ].map(({ label, value, sub, color, bg }) => (
          <div key={label} style={{ background: bg || "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: color || ORANGE }}>{value}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{label}</div>
            <div style={{ fontSize: 10, color: "#9ca3af" }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Session Scores */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 12, paddingBottom: 6, borderBottom: `2px solid ${ORANGE}` }}>Session Scores</div>
        {sessionBreakdown.map(({ session, sd, catAvgs, byEval }) => (
          <div key={session.session_number} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: sd ? ORANGE : "#d1d5db", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 13 }}>
                  {session.session_number}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{session.name}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "capitalize" }}>{session.session_type} · {session.weight_percentage}% weight</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {sessionAgreement[session.session_number] != null && sd?.source !== "testing" && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600, color: agreementColor(sessionAgreement[session.session_number]), background: agreementBg(sessionAgreement[session.session_number]) }}>
                    {sessionAgreement[session.session_number]}% agree
                  </span>
                )}
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: sd ? ORANGE : "#d1d5db" }}>{sd ? sd.normalized_score?.toFixed(1) : "—"}</div>
                  <div style={{ fontSize: 10, color: "#9ca3af" }}>/ 100</div>
                </div>
              </div>
            </div>
            {catAvgs.length > 0 && (
              <div style={{ padding: "12px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Category Averages</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                  {catAvgs.map(({ name, avg }) => (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 12, color: "#374151", width: 120, flexShrink: 0 }}>{name}</div>
                      <div style={{ flex: 1, height: 6, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", background: ORANGE, borderRadius: 3, width: `${(avg / scale) * 100}%` }} />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", width: 32, textAlign: "right" }}>{avg}</div>
                    </div>
                  ))}
                </div>
                {Object.keys(byEval).length > 1 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Per Evaluator</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: "#f9fafb" }}>
                          <th style={{ padding: "4px 8px", textAlign: "left", color: "#6b7280", fontWeight: 600 }}>Evaluator</th>
                          {[...new Set(scores.filter(s => s.session_number === session.session_number).map(s => s.category_name))].map(cat => (
                            <th key={cat} style={{ padding: "4px 8px", textAlign: "center", color: "#6b7280", fontWeight: 600 }}>{cat}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(byEval).map(([evalName, cats]) => (
                          <tr key={evalName} style={{ borderTop: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "4px 8px", color: "#374151" }}>{evalName}</td>
                            {[...new Set(scores.filter(s => s.session_number === session.session_number).map(s => s.category_name))].map(cat => (
                              <td key={cat} style={{ padding: "4px 8px", textAlign: "center", fontWeight: 600, color: "#111827" }}>{cats[cat] || "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Notes */}
      {notes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 12, paddingBottom: 6, borderBottom: `2px solid ${ORANGE}` }}>Evaluator Notes</div>
          {sessions.map(s => {
            const sNotes = notes.filter(n => n.session_number === s.session_number);
            if (!sNotes.length) return null;
            return (
              <div key={s.session_number} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Session {s.session_number} — {s.session_type}</div>
                {sNotes.map((n, i) => (
                  <div key={i} style={{ background: "#f9fafb", border: "1px solid #f3f4f6", borderRadius: 8, padding: "10px 14px", marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 4 }}>{n.evaluator_name}</div>
                    <div style={{ color: "#374151", lineHeight: 1.6 }}>{n.note_text}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, display: "flex", justifyContent: "space-between", color: "#9ca3af", fontSize: 11 }}>
        <span>AthleteRanker · Confidential — For internal use only</span>
        <span>{data.category?.name} · {athlete.first_name} {athlete.last_name}</span>
      </div>

      <style>{`
        @media print {
          @page { margin: 16mm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  );
}

export default function PDFReportPage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>Preparing...</div>}>
      <PDFReportInner />
    </Suspense>
  );
}
