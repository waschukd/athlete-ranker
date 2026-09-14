"use client";

import DevelopmentReport, { ReportFonts } from "@/components/DevelopmentReport";
import { SAMPLE_REPORT_DATA } from "@/lib/sampleReport";

// Public, unauthenticated, no purchase required — the "see what you're
// buying" link Directors/SPs share alongside a category's real report
// links. "Davey Donald" is a fictional player; the SAMPLE banner is
// deliberately part of the print layout (not hidden like the theme
// toggle button), so a printed or forwarded copy can never be mistaken
// for a real athlete's real report.
function safePrint() {
  try { window.print(); return true; } catch { return false; }
}

export default function SampleReportPDF() {
  return (
    <>
      <div
        className="ssrpt-sample-banner"
        style={{
          position: "sticky", top: 0, zIndex: 40, textAlign: "center",
          background: "#e6c15b", color: "#141414", fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
          padding: "8px 12px",
        }}
      >
        Sample report — for illustration only, not a real athlete
      </div>
      <div className="print:hidden" style={{ position: "fixed", top: 50, right: 12, zIndex: 50 }}>
        <button
          onClick={() => safePrint()}
          style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, fontWeight: 600, padding: "10px 16px", borderRadius: 10, border: "none", background: "#0b5cd6", color: "#fff", cursor: "pointer" }}
        >
          Print / Save as PDF
        </button>
      </div>
      <ReportFonts />
      <DevelopmentReport data={SAMPLE_REPORT_DATA} />
    </>
  );
}
