"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import DevelopmentReport, { ReportFonts } from "@/components/DevelopmentReport";

const BG = "#0b0b0d";

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
        setTimeout(() => window.print(), 1100);
      });
  }, [athleteId, catId]);

  if (!data || data.error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Hanken Grotesk', sans-serif", color: "#8b8f99", background: BG }}>
      <ReportFonts />{data?.error ? "Report unavailable." : "Preparing report…"}
    </div>
  );

  return <DevelopmentReport data={data} />;
}

export default function PDFReportPage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: BG, color: "#8b8f99" }}>Preparing…</div>}>
      <PDFReportInner />
    </Suspense>
  );
}
