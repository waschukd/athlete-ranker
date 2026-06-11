"use client";

import { useState, useEffect } from "react";
import DevelopmentReport, { ReportFonts } from "@/components/DevelopmentReport";

const BG = "#0b0b0d";

export default function PublicReportPDF({ params }) {
  const { token } = params;
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`/api/report/${token}`)
      .then(r => r.json())
      .then(d => {
        // PDF is the paid artifact — bounce unpaid viewers back to the paywall.
        if (!d || d.error || !d.purchased) { window.location.href = `/report/${token}`; return; }
        setData(d);
        setTimeout(() => window.print(), 1100);
      })
      .catch(() => { window.location.href = `/report/${token}`; });
  }, [token]);

  if (!data) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Hanken Grotesk', sans-serif", color: "#8b8f99", background: BG }}>
      <ReportFonts />Loading report…
    </div>
  );

  return <DevelopmentReport data={data} />;
}
