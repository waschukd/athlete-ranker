"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { TeamReportBody } from "@/components/CoachReportBody";

const qc = new QueryClient();

function CoachReportInner() {
  const { token } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["coach-report-token", token],
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/coach-report/${token}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "This link is no longer valid.");
      return res.json();
    },
  });

  if (isLoading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0b5cd6]" /></div>;
  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-bold text-gray-700 mb-2">Link not available</h1>
        <p className="text-sm text-gray-400">{String(error.message || error)}</p>
      </div>
    </div>
  );

  const t = data.team;
  return (
    <div className="min-h-screen bg-gray-50">
      <style>{`@media print { .no-print { display:none !important; } body { background:#fff; } }`}</style>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0b5cd6]">{data.category.org_name} · {data.category.name}</div>
            <h1 className="font-display font-black tracking-tight text-gray-900 text-3xl leading-none mt-1">{t.name} — Development Report</h1>
            <p className="text-sm text-gray-500 mt-1">{t.coach_name ? `Coach ${t.coach_name} · ` : ""}{t.player_count} players</p>
          </div>
          <button onClick={() => window.print()} className="no-print inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50"><Printer size={14} /> Print / PDF</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <TeamReportBody t={t} />
        </div>
        <p className="px-1 pt-4 pb-8 text-xs text-gray-300">This private report was shared with you by your association. Please don't forward the link.</p>
      </div>
    </div>
  );
}

export default function CoachReportTokenPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0b5cd6]" /></div>}>
        <CoachReportInner />
      </Suspense>
    </QueryClientProvider>
  );
}
