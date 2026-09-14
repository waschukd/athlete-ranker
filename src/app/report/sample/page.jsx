"use client";

import { Sparkles, ArrowRight } from "lucide-react";
import { SAMPLE_REPORT_DATA } from "@/lib/sampleReport";

const GOLD = "#cda434";
const BG = "#0b0b0d";
const LINE = "rgba(255,255,255,0.08)";
const GOLD_LINE = "rgba(205,164,52,0.3)";
const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// Public, no token, no purchase — the link Directors/SPs share alongside a
// category's real report links so a parent can see exactly what they'd be
// buying before the season's own reports are even ready. Mirrors the real
// paywall page's marketing framing, minus the paywall itself.
export default function SampleReportLanding() {
  const { athlete, category, org_name, skillProfile } = SAMPLE_REPORT_DATA;
  const scale = category?.scoring_scale || 10;
  const firstName = athlete?.first_name;

  const Fonts = () => <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" />;
  const shell = { minHeight: "100vh", background: BG, color: "#e9eaec", fontFamily: SANS };

  return (
    <div style={shell}>
      <Fonts />
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 20px" }}>

        <div style={{ textAlign: "center", background: GOLD, color: "#141414", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "8px 12px", margin: "0 -20px" }}>
          Sample report — for illustration only, not a real athlete
        </div>

        {/* Cover */}
        <div style={{ background: "radial-gradient(120% 140% at 80% 0%, #23211a 0%, #121214 40%, #0a0a0c 100%)", borderBottom: `1px solid ${GOLD_LINE}`, borderRadius: "0 0 18px 18px", padding: "28px 28px 24px", position: "relative", overflow: "hidden", marginBottom: 24, marginTop: 16 }}>
          <div style={{ position: "absolute", top: -80, right: -50, width: 260, height: 260, borderRadius: "50%", border: "1px solid rgba(205,164,52,0.14)" }} />
          <div style={{ fontSize: 9.5, letterSpacing: "0.3em", textTransform: "uppercase", color: GOLD, fontWeight: 700 }}>Sideline Star · Development Report</div>
          <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 900, lineHeight: 1.05, marginTop: 8, color: "#fff" }}>{athlete?.first_name} {athlete?.last_name}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", fontSize: 11, color: "#cfd2d7" }}>
            {athlete?.position && <span style={{ border: `1px solid ${GOLD}`, color: GOLD, padding: "3px 12px", borderRadius: 99, textTransform: "capitalize" }}>{athlete.position}</span>}
            {category?.name && <span style={{ border: "1px solid rgba(255,255,255,0.18)", padding: "3px 12px", borderRadius: 99 }}>{category.name}</span>}
            {org_name && <span style={{ border: "1px solid rgba(255,255,255,0.18)", padding: "3px 12px", borderRadius: 99 }}>{org_name}</span>}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20, background: "linear-gradient(120deg,#1a1812,#121216)", border: `1px solid ${GOLD_LINE}`, borderRadius: 16, padding: "18px 22px", marginBottom: 16 }}>
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 28, color: GOLD, lineHeight: 1 }}>{firstName}'s</div>
            <div style={{ fontSize: 10, color: GOLD, marginTop: 4, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Development Report</div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: GOLD_LINE }} />
          <div>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 20, color: "#fff" }}>What to work on next</div>
            <div style={{ color: "#b8bcc4", fontSize: 12.5, lineHeight: 1.5, marginTop: 3 }}>Objective testing, evaluator skill scores and session-by-session progress — with what a top mark looks like and the exact plan to get there. This is a full, real example of what your athlete's report will look like.</div>
          </div>
        </div>

        {skillProfile.length > 0 && (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: "14px 18px", marginBottom: 16, background: "#101014" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD, fontWeight: 700, marginBottom: 10 }}>Skill snapshot</div>
            {skillProfile.slice(0, 3).map(s => (
              <div key={s.scoring_category_id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                <span style={{ width: 110, flexShrink: 0, fontSize: 12, color: "#dfe1e4" }}>{s.name}</span>
                <div style={{ flex: 1, height: 7, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${s.player != null ? Math.max(2, (s.player / scale) * 100) : 0}%`, background: `linear-gradient(90deg,#e3c560,${GOLD})`, borderRadius: 99 }} /></div>
                <span style={{ width: 30, textAlign: "right", fontSize: 12, fontWeight: 700, color: GOLD }}>{s.player != null ? s.player.toFixed(1) : "—"}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ border: `1px solid ${GOLD_LINE}`, borderRadius: 18, padding: "26px 24px", textAlign: "center", background: "linear-gradient(180deg,#16140e,#0d0d10)", marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Sparkles size={22} color="#141414" /></div>
          <h3 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 900, color: "#fff", margin: "0 0 6px" }}>This is a real, full sample</h3>
          <p style={{ fontSize: 13, color: "#b8bcc4", maxWidth: 420, margin: "0 auto 18px", lineHeight: 1.55 }}>Every section your athlete's real report includes — objective testing, full skill profile, session-by-session progress, evaluator notes, and a personalized development plan — built with realistic sample data so you know exactly what you'd be getting.</p>
          <a href="/report/sample/pdf" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 30px", background: GOLD, color: "#141414", borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
            View the full sample report <ArrowRight size={16} />
          </a>
          <p style={{ fontSize: 11, color: "#6b7078", marginTop: 14 }}>No account or purchase needed.</p>
        </div>

        <div style={{ borderTop: `1px solid ${LINE}`, padding: "18px 0 28px", textAlign: "center", fontSize: 11, color: "#6b7078" }}>Powered by Sideline Star · sidelinestar.com</div>
      </div>
    </div>
  );
}
