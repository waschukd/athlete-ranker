"use client";

import { useState, useEffect } from "react";
import { Lock, Download, Check } from "lucide-react";

const GOLD = "#cda434";
const BG = "#0b0b0d";
const LINE = "rgba(255,255,255,0.08)";
const GOLD_LINE = "rgba(205,164,52,0.3)";
const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export default function PublicReportPage({ params }) {
  const { token } = params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("payment") === "success") setPaymentStatus("success");
    if (urlParams.get("payment") === "cancelled") setPaymentStatus("cancelled");
    fetchData();
  }, [token]);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch(`/api/report/${token}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  };

  // Poll briefly after payment success for the webhook to flip the purchase.
  useEffect(() => {
    if (paymentStatus === "success" && data && !data.purchased) {
      const interval = setInterval(fetchData, 2000);
      const timeout = setTimeout(() => clearInterval(interval), 15000);
      return () => { clearInterval(interval); clearTimeout(timeout); };
    }
  }, [paymentStatus, data?.purchased]);

  const handleUnlock = async () => {
    setUnlocking(true);
    const res = await fetch("/api/payments/create-checkout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
    });
    const result = await res.json();
    if (result.already_purchased) { fetchData(); setUnlocking(false); return; }
    if (result.checkout_url) window.location.href = result.checkout_url;
    else setUnlocking(false);
  };

  const Fonts = () => <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" />;
  const shell = { minHeight: "100vh", background: BG, color: "#e9eaec", fontFamily: SANS };

  if (loading) return <div style={{ ...shell, display: "flex", alignItems: "center", justifyContent: "center" }}><Fonts /><span style={{ color: "#8b8f99" }}>Loading…</span></div>;
  if (!data || data.error) return (
    <div style={{ ...shell, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Fonts />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
        <h2 style={{ fontFamily: SERIF, fontSize: 22, color: "#fff", margin: 0 }}>Report Not Found</h2>
        <p style={{ color: "#8b8f99", fontSize: 14 }}>This link is invalid or has expired.</p>
      </div>
    </div>
  );

  const { athlete, category, org_name, standing, purchased, price } = data;
  const scale = category?.scoring_scale || 10;
  const skillProfile = data.skillProfile || [];
  const priceStr = `$${((price || 2499) / 100).toFixed(2)}`;
  const firstName = athlete?.first_name || "your athlete";

  return (
    <div style={shell}>
      <Fonts />
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 20px" }}>

        {/* Cover */}
        <div style={{ background: "radial-gradient(120% 140% at 80% 0%, #23211a 0%, #121214 40%, #0a0a0c 100%)", borderBottom: `1px solid ${GOLD_LINE}`, borderRadius: "0 0 18px 18px", padding: "28px 28px 24px", position: "relative", overflow: "hidden", marginBottom: 24 }}>
          <div style={{ position: "absolute", top: -80, right: -50, width: 260, height: 260, borderRadius: "50%", border: "1px solid rgba(205,164,52,0.14)" }} />
          <div style={{ fontSize: 9.5, letterSpacing: "0.3em", textTransform: "uppercase", color: GOLD, fontWeight: 700 }}>Sideline Star · Development Report</div>
          <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 900, lineHeight: 1.05, marginTop: 8, color: "#fff" }}>{athlete?.first_name} {athlete?.last_name}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", fontSize: 11, color: "#cfd2d7" }}>
            {athlete?.position && <span style={{ border: `1px solid ${GOLD}`, color: GOLD, padding: "3px 12px", borderRadius: 99, textTransform: "capitalize" }}>{athlete.position}</span>}
            {category?.name && <span style={{ border: "1px solid rgba(255,255,255,0.18)", padding: "3px 12px", borderRadius: 99 }}>{category.name}</span>}
            {org_name && <span style={{ border: "1px solid rgba(255,255,255,0.18)", padding: "3px 12px", borderRadius: 99 }}>{org_name}</span>}
          </div>
        </div>

        {/* Payment banners */}
        {paymentStatus === "success" && !purchased && (
          <div style={{ background: "rgba(205,164,52,0.1)", border: `1px solid ${GOLD_LINE}`, borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: GOLD }}>Processing your payment… this usually takes a few seconds.</div>
        )}
        {purchased && (
          <div style={{ background: "rgba(80,200,120,.12)", border: "1px solid rgba(80,200,120,.3)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#5fd08a" }}>Unlocked — your full report is ready.</div>
        )}

        {/* Standing (free preview) */}
        {standing && (
          <div style={{ display: "flex", alignItems: "center", gap: 20, background: "linear-gradient(120deg,#1a1812,#121216)", border: `1px solid ${GOLD_LINE}`, borderRadius: 16, padding: "18px 22px", marginBottom: 16 }}>
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 28, color: GOLD, lineHeight: 1 }}>{standing.band}</div>
              <div style={{ fontSize: 10, color: GOLD, marginTop: 4, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>of the group</div>
            </div>
            <div style={{ width: 1, alignSelf: "stretch", background: GOLD_LINE }} />
            <div>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 20, color: "#fff" }}>{standing.tier}</div>
              <div style={{ color: "#b8bcc4", fontSize: 12.5, lineHeight: 1.5, marginTop: 3 }}>{firstName} graded out in the <b style={{ color: "#fff" }}>{standing.band.toLowerCase()}</b> of {standing.total} skaters. The full report shows exactly what to chase to climb.</div>
            </div>
          </div>
        )}

        {/* Skill teaser (free) */}
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
            {skillProfile.length > 3 && <div style={{ fontSize: 11, color: "#6b7078", marginTop: 4 }}>+{skillProfile.length - 3} more skills in the full report</div>}
          </div>
        )}

        {/* Paywall / unlocked actions */}
        {!purchased ? (
          <div style={{ border: `1px solid ${GOLD_LINE}`, borderRadius: 18, padding: "26px 24px", textAlign: "center", background: "linear-gradient(180deg,#16140e,#0d0d10)", marginBottom: 28 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Lock size={22} color="#141414" /></div>
            <h3 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 900, color: "#fff", margin: "0 0 6px" }}>Unlock {firstName}'s full report</h3>
            <p style={{ fontSize: 13, color: "#b8bcc4", maxWidth: 420, margin: "0 auto 18px", lineHeight: 1.55 }}>The complete development report — objective testing vs. the group, skill profile, session-by-session progress, evaluator notes, and a personalized plan of what to work on first.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", maxWidth: 380, margin: "0 auto 20px", textAlign: "left" }}>
              {["Objective testing breakdown", "Full skill profile", "Progress across sessions", "Every evaluator note", "Personalized development plan", "Downloadable PDF"].map(it => (
                <div key={it} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#dfe1e4" }}><Check size={13} color="#5fd08a" /> {it}</div>
              ))}
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 900, color: "#fff" }}>{priceStr}</div>
            <div style={{ fontSize: 11, color: "#6b7078", marginBottom: 18 }}>One-time purchase · Instant access</div>
            <button onClick={handleUnlock} disabled={unlocking} style={{ padding: "13px 30px", background: GOLD, color: "#141414", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: unlocking ? "default" : "pointer", opacity: unlocking ? 0.6 : 1 }}>
              {unlocking ? "Redirecting to checkout…" : `Unlock Report — ${priceStr}`}
            </button>
            <p style={{ fontSize: 11, color: "#6b7078", marginTop: 14 }}>Secure payment via Stripe. No account required.</p>
          </div>
        ) : (
          <div style={{ textAlign: "center", margin: "8px 0 28px" }}>
            <a href={`/report/${token}/pdf`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 26px", background: GOLD, color: "#141414", borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
              <Download size={16} /> View &amp; download full report
            </a>
          </div>
        )}

        <div style={{ borderTop: `1px solid ${LINE}`, padding: "18px 0 28px", textAlign: "center", fontSize: 11, color: "#6b7078" }}>Powered by Sideline Star · sidelinestar.com</div>
      </div>
    </div>
  );
}
