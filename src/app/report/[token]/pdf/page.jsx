"use client";

import { useState, useEffect } from "react";

export default function PublicReportPDF({ params }) {
  const { token } = params;
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`/api/report/${token}`)
      .then(r => r.json())
      .then(d => {
        if (!d.purchased) { window.location.href = `/report/${token}`; return; }
        setData(d);
        setTimeout(() => window.print(), 1000);
      });
  }, [token]);

  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "#999" }}>Loading report...</div>;

  const { athlete, category_name, org_name, rank, total_athletes, percentile, overall_avg, scale, sessions, scores, notes, scouting_report } = data;

  // Group scores by session then evaluator
  const scoresBySession = {};
  for (const s of (scores || [])) {
    if (!scoresBySession[s.session_number]) scoresBySession[s.session_number] = {};
    if (!scoresBySession[s.session_number][s.evaluator_name]) scoresBySession[s.session_number][s.evaluator_name] = [];
    scoresBySession[s.session_number][s.evaluator_name].push(s);
  }
  const categories = [...new Map((scores || []).map(s => [s.scoring_category_id, { id: s.scoring_category_id, name: s.category_name, order: s.display_order }])).values()].sort((a, b) => a.order - b.order);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 40px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: 13, color: "#111" }}>
      <style>{`
        @media print { @page { size: A4; margin: 16mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        table { width: 100%; border-collapse: collapse; } th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #eee; } th { font-size: 11px; color: #666; font-weight: 500; text-transform: uppercase; background: #f9fafb; }
      `}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1A6BFF, #4D8FFF)", borderRadius: 12, padding: "24px 32px", color: "white", marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Sideline Star</div>
        <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>Player Evaluation Report</div>
      </div>

      {/* Player Info */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 16, borderBottom: "2px solid #f0f0f0" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{athlete.first_name} {athlete.last_name}</div>
          <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
            {athlete.position && <span style={{ background: "#EFF6FF", color: "#1D4ED8", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, marginRight: 8 }}>{athlete.position}</span>}
            {category_name} · {org_name}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#999", textAlign: "right" }}>
          Generated {new Date().toLocaleDateString()}<br />
          Report ID: {token.slice(0, 8)}
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Overall Rank", value: `#${rank || "—"}`, color: "#1A6BFF" },
          { label: "Percentile", value: percentile !== null ? `${percentile}%` : "—", color: "#16a34a" },
          { label: "Avg Score", value: `${overall_avg || "—"}/${scale}`, color: "#111" },
          { label: "Athletes", value: total_athletes, color: "#111" },
        ].map(s => (
          <div key={s.label} style={{ background: "#f9fafb", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Session Scores */}
      {Object.entries(scoresBySession).map(([sessNum, evaluators]) => {
        const sess = sessions.find(s => s.session_number === parseInt(sessNum));
        return (
          <div key={sessNum} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#333" }}>Session {sessNum}{sess ? ` — ${sess.name}` : ""}</div>
            <table>
              <thead>
                <tr>
                  <th>Evaluator</th>
                  {categories.map(c => <th key={c.id} style={{ textAlign: "center" }}>{c.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.entries(evaluators).map(([evalName, evalScores]) => (
                  <tr key={evalName}>
                    <td style={{ fontWeight: 500, fontSize: 12 }}>{evalName}</td>
                    {categories.map(c => {
                      const s = evalScores.find(sc => sc.scoring_category_id === c.id);
                      return <td key={c.id} style={{ textAlign: "center", fontFamily: "monospace" }}>{s ? parseFloat(s.score) : "—"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Notes */}
      {(notes || []).length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#333" }}>Evaluator Notes</div>
          {notes.map((n, i) => (
            <div key={i} style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 14px", marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "#999" }}>S{n.session_number} · {n.evaluator_name}</div>
              <div style={{ fontSize: 12, color: "#333", marginTop: 2, lineHeight: 1.5 }}>{n.note_text}</div>
            </div>
          ))}
        </div>
      )}

      {/* Scouting Report */}
      {scouting_report && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#333" }}>Scouting Report</div>
          <div style={{ borderLeft: "4px solid #1A6BFF", paddingLeft: 16, fontSize: 12, lineHeight: 1.7, color: "#444", whiteSpace: "pre-wrap" }}>
            {scouting_report}
          </div>
          <div style={{ fontSize: 10, color: "#999", marginTop: 8 }}>Generated from evaluator observations using AI analysis</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 30, fontSize: 10, color: "#999", textAlign: "center" }}>
        Confidential — For player development purposes only · Sideline Star · sidelinestar.com
      </div>
    </div>
  );
}
