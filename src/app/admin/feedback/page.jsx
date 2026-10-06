"use client";

import { useEffect, useState } from "react";

const GOLD = "#cda434";
const BG = "#0b0b0d";
const LINE = "rgba(255,255,255,0.08)";
const GOLD_LINE = "rgba(205,164,52,0.3)";
const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const AUDIENCE_LABEL = { association_admin: "Association admins", evaluator: "Evaluators" };

export default function FeedbackResultsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/api/feedback/admin")
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load results");
        setData(d);
      })
      .catch(e => setError(e.message));
  }, []);

  const shell = { minHeight: "100vh", background: BG, color: "#e9eaec", fontFamily: SANS };
  const wrap = { maxWidth: 820, margin: "0 auto", padding: "32px 20px 60px" };

  if (error) return <div style={shell}><div style={{ ...wrap, paddingTop: 80, textAlign: "center" }}><p style={{ color: "#e08a8a" }}>{error}</p></div></div>;
  if (!data) return <div style={shell} />;

  const shown = data.responses.filter(r => filter === "all" || r.audience === filter);

  return (
    <div style={shell}>
      <div style={wrap}>
        <div style={{ fontSize: 9.5, letterSpacing: "0.3em", textTransform: "uppercase", color: GOLD, fontWeight: 700 }}>Sideline Star · Internal</div>
        <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 900, color: "#fff", margin: "8px 0 20px" }}>Evaluation feedback results</h1>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
          {Object.entries(AUDIENCE_LABEL).map(([aud, label]) => {
            const s = data.summary[aud] || { invited: 0, submitted: 0 };
            return (
              <div key={aud} style={{ flex: "1 1 220px", border: `1px solid ${GOLD_LINE}`, borderRadius: 14, padding: "14px 18px", background: "#121214" }}>
                <div style={{ fontSize: 11, color: GOLD, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{s.submitted} <span style={{ fontSize: 13, color: "#8b8f99", fontWeight: 500 }}>of {s.invited} answered</span></div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {[["all", "All"], ["association_admin", "Admins"], ["evaluator", "Evaluators"]].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{ padding: "7px 14px", borderRadius: 99, border: `1px solid ${filter === val ? GOLD : LINE}`, background: filter === val ? "rgba(205,164,52,0.12)" : "transparent", color: filter === val ? GOLD : "#b8bcc4", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{label}</button>
          ))}
        </div>

        {shown.length === 0 && <p style={{ color: "#8b8f99", fontSize: 13.5 }}>No responses yet.</p>}

        {shown.map(r => {
          const survey = data.surveys[r.audience];
          const answered = r.submitted_at;
          return (
            <div key={r.id} style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 20px", marginBottom: 14, background: "#101014" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{r.respondent_name || r.email}</div>
                  <div style={{ fontSize: 12, color: "#8b8f99" }}>{r.email}{r.org_name ? ` · ${r.org_name}` : ""}</div>
                </div>
                <div style={{ fontSize: 12, color: answered ? "#5fd08a" : "#8b8f99", fontWeight: 600 }}>
                  {answered ? `Answered ${new Date(r.submitted_at).toLocaleString()}` : "Not answered yet"}
                </div>
              </div>
              {answered && survey && survey.questions.map((q, i) => {
                const a = r.answers?.[q.key];
                if (!a) return null;
                return (
                  <div key={q.key} style={{ borderTop: `1px solid ${LINE}`, padding: "10px 0" }}>
                    <div style={{ fontSize: 12.5, color: GOLD, marginBottom: 4 }}>{i + 1}. {q.text}</div>
                    <div style={{ fontSize: 13.5, color: "#dfe1e4", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{a}</div>
                  </div>
                );
              })}
              {answered && r.comments && (
                <div style={{ borderTop: `1px solid ${GOLD_LINE}`, padding: "10px 0 0" }}>
                  <div style={{ fontSize: 12.5, color: GOLD, marginBottom: 4 }}>Open comments</div>
                  <div style={{ fontSize: 13.5, color: "#dfe1e4", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{r.comments}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
