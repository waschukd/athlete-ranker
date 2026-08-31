"use client";

import { useState, useEffect } from "react";
import DevelopmentReport, { ReportFonts } from "@/components/DevelopmentReport";

const BG = "#0b0b0d";

// window.print() isn't safe to call unconditionally: iOS WKWebView-based
// in-app browsers (Google app, Facebook, Instagram, etc. -- anything that
// isn't real Safari or standalone Chrome-for-iOS) expect their host app to
// have registered a native print bridge and throw a TypeError reaching for
// it ("window.webkit.messageHandlers.print.postMessage") when it hasn't been
// -- which it never has here, since this is a web page, not our Capacitor
// app. Uncaught, that broke the auto-print silently for anyone opening a
// purchased report from an in-app browser (a common way to tap an emailed
// link) and threw an unhandled exception on top (seen in production
// Sentry). Wrapped so a failure here just falls back to the manual button
// instead of crashing.
function safePrint() {
  try { window.print(); return true; } catch { return false; }
}

export default function PublicReportPDF({ params }) {
  const { token } = params;
  const [data, setData] = useState(null);
  const [printFailed, setPrintFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/report/${token}`)
      .then(r => r.json())
      .then(d => {
        // PDF is the paid artifact — bounce unpaid viewers back to the paywall.
        if (!d || d.error || !d.purchased) { window.location.href = `/report/${token}`; return; }
        setData(d);
        setTimeout(() => { if (!safePrint()) setPrintFailed(true); }, 1100);
      })
      .catch(() => { window.location.href = `/report/${token}`; });
  }, [token]);

  if (!data) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Hanken Grotesk', sans-serif", color: "#8b8f99", background: BG }}>
      <ReportFonts />Loading report…
    </div>
  );

  return (
    <>
      {/* Manual fallback -- the auto-print above is best-effort everywhere:
          in-app browsers can't do it at all, and even real browsers often
          block window.print() from a setTimeout since it didn't originate
          from a direct user gesture. print:hidden via @media print in the
          report's own stylesheet keeps this off the printed page itself. */}
      <div className="print:hidden" style={{ position: "fixed", top: 12, right: 12, zIndex: 50 }}>
        <button
          onClick={() => setPrintFailed(!safePrint())}
          style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, fontWeight: 600, padding: "10px 16px", borderRadius: 10, border: "none", background: "#0b5cd6", color: "#fff", cursor: "pointer" }}
        >
          Print / Save as PDF
        </button>
        {printFailed && (
          <p style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: "#5b606b", background: "#fff", padding: "8px 12px", borderRadius: 8, marginTop: 6, maxWidth: 220 }}>
            This browser can't open the print dialog directly — try opening this link in Safari or Chrome instead.
          </p>
        )}
      </div>
      <DevelopmentReport data={data} />
    </>
  );
}
