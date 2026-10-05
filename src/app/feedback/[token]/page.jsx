"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const GOLD = "#cda434";
const BG = "#0b0b0d";
const LINE = "rgba(255,255,255,0.08)";
const GOLD_LINE = "rgba(205,164,52,0.3)";
const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const fieldStyle = {
  width: "100%", background: "#141416", color: "#e9eaec", border: `1px solid ${LINE}`,
  borderRadius: 10, padding: "10px 12px", fontSize: 13.5, fontFamily: SANS, lineHeight: 1.5,
};

export default function FeedbackSurveyPage() {
  const params = useParams();
  const token = params?.token;
  const [survey, setSurvey] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [answers, setAnswers] = useState({});
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/feedback/${token}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) return setLoadState("missing");
        setSurvey(d);
        setLoadState(d.submitted ? "submitted" : "ready");
      })
      .catch(() => setLoadState("missing"));
  }, [token]);

  const setAnswer = (key, value) => setAnswers(prev => ({ ...prev, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/feedback/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, comments }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Something went wrong. Please try again."); setSubmitting(false); return; }
      setDone(true);
    } catch {
      setError("Network problem. Please try again.");
    }
    setSubmitting(false);
  };

  const shell = { minHeight: "100vh", background: BG, color: "#e9eaec", fontFamily: SANS };
  const card = { maxWidth: 620, margin: "0 auto", padding: "32px 20px 48px" };

  const Message = ({ title, body }) => (
    <div style={shell}>
      <div style={{ ...card, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 900, color: "#fff", marginBottom: 10 }}>{title}</div>
        <p style={{ fontSize: 14, color: "#b8bcc4", lineHeight: 1.6 }}>{body}</p>
      </div>
    </div>
  );

  if (loadState === "loading") return <div style={shell} />;
  if (loadState === "missing") return <Message title="This link isn't valid" body="If you think this is a mistake, reply to the email you received and we'll send a new one." />;
  if (loadState === "submitted" || done) return <Message title="Thank you" body="Your feedback is in. It goes straight to Competitive Thread, and it genuinely helps us get next season right." />;

  return (
    <div style={shell}>
      <div style={card}>
        <div style={{ fontSize: 9.5, letterSpacing: "0.3em", textTransform: "uppercase", color: GOLD, fontWeight: 700 }}>Sideline Star · Season feedback</div>
        <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 900, color: "#fff", margin: "8px 0 8px" }}>{survey.title}</h1>
        <p style={{ fontSize: 13.5, color: "#b8bcc4", lineHeight: 1.6, margin: "0 0 26px" }}>{survey.intro} Every question is optional.</p>

        <form onSubmit={submit}>
          {survey.questions.map((q, i) => (
            <div key={q.key} style={{ borderTop: `1px solid ${LINE}`, padding: "18px 0" }}>
              <label style={{ display: "block", fontSize: 14, color: "#e9eaec", lineHeight: 1.5, marginBottom: 10 }}>
                <span style={{ color: GOLD, fontWeight: 700, marginRight: 8 }}>{i + 1}.</span>{q.text}
              </label>
              {q.type === "choice" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 4 }}>
                  {q.options.map(opt => (
                    <label key={opt} style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 13.5, color: "#dfe1e4", cursor: "pointer" }}>
                      <input type="radio" name={q.key} checked={answers[q.key] === opt} onChange={() => setAnswer(q.key, opt)} style={{ accentColor: GOLD }} />
                      {opt}
                    </label>
                  ))}
                </div>
              ) : (
                <textarea rows={3} value={answers[q.key] || ""} onChange={e => setAnswer(q.key, e.target.value)} style={fieldStyle} />
              )}
            </div>
          ))}

          <div style={{ borderTop: `1px solid ${GOLD_LINE}`, padding: "22px 0 0" }}>
            <label style={{ display: "block", fontSize: 14, color: "#e9eaec", lineHeight: 1.5, marginBottom: 8 }}>
              Anything we didn't ask that we should know?
            </label>
            <textarea rows={5} value={comments} onChange={e => setComments(e.target.value)} placeholder="Open comments — anything at all." style={fieldStyle} />
          </div>

          {error && <p style={{ color: "#e08a8a", fontSize: 13, marginTop: 14 }}>{error}</p>}
          <button type="submit" disabled={submitting} style={{ marginTop: 24, width: "100%", padding: "14px 20px", borderRadius: 12, border: "none", background: GOLD, color: "#141414", fontWeight: 700, fontSize: 15, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1 }}>
            {submitting ? "Sending…" : "Send feedback"}
          </button>
        </form>
      </div>
    </div>
  );
}
