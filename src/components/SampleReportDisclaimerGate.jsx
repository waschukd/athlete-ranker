"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

const GOLD = "#cda434";
const BG = "#0b0b0d";
const GOLD_LINE = "rgba(205,164,52,0.3)";
const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const ACK_KEY = "ss_sample_report_disclaimer_ack";

// Gate in front of BOTH sample report pages (the generic one and any
// org-branded variant) -- a viewer must tick the box before seeing any real
// content. Per Dan: a sample report has been mistaken for something that
// speaks to real team/ranking decisions before, so this makes the actual
// purpose unmissable rather than a footnote underneath the report itself.
// Remembered per-browser via localStorage so a returning viewer isn't
// forced to re-tick it every visit -- purely a convenience, never used to
// track or identify anyone.
export default function SampleReportDisclaimerGate({ children }) {
  const [acknowledged, setAcknowledged] = useState(null); // null = not checked yet (avoids a flash)
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let ack = false;
    try { ack = localStorage.getItem(ACK_KEY) === "1"; } catch {}
    setAcknowledged(ack);
  }, []);

  const continueClick = () => {
    try { localStorage.setItem(ACK_KEY, "1"); } catch {}
    setAcknowledged(true);
  };

  if (acknowledged === null) return null; // brief, avoids a flash of the gate before localStorage is read
  if (acknowledged) return children;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#e9eaec", fontFamily: SANS, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" />
      <div style={{ maxWidth: 460, width: "100%", background: "#121214", border: `1px solid ${GOLD_LINE}`, borderRadius: 18, padding: "32px 28px", textAlign: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
          <ShieldAlert size={24} color="#141414" />
        </div>
        <h1 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 900, color: "#fff", margin: "0 0 12px" }}>Before you continue</h1>
        <p style={{ fontSize: 13.5, color: "#b8bcc4", lineHeight: 1.6, margin: "0 0 20px" }}>
          This is a sample report for illustration only. It is <strong style={{ color: "#fff" }}>not</strong> a report for the purposes of disputing a team selection, an evaluator, or an association. It will not tell you anything about rankings or team decisions — it exists <strong style={{ color: "#fff" }}>solely</strong> to show what a Development Report looks like.
        </p>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left", fontSize: 12.5, color: "#dfe1e4", cursor: "pointer", marginBottom: 22 }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: GOLD, flexShrink: 0 }} />
          I understand this is a sample for illustration only, not a real athlete's report, and it does not reflect any real ranking or team decision.
        </label>
        <button
          onClick={continueClick}
          disabled={!checked}
          style={{
            width: "100%", padding: "13px 20px", borderRadius: 12, border: "none",
            background: checked ? GOLD : "rgba(255,255,255,0.08)",
            color: checked ? "#141414" : "#6b7078",
            fontWeight: 700, fontSize: 14, cursor: checked ? "pointer" : "not-allowed",
          }}
        >
          Continue to sample report
        </button>
      </div>
    </div>
  );
}
