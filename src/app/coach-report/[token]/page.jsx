"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Printer, Target, ListOrdered } from "lucide-react";

const qc = new QueryClient();
const POS_SHORT = { forward: "F", defense: "D", goalie: "G" };

function CoachReportInner() {
  const { token } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["coach-report-token", token],
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
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0b5cd6]">{data.category.org_name} · {data.category.name}</div>
            <h1 className="font-display font-black tracking-tight text-gray-900 text-3xl leading-none mt-1">{t.name} — Development Report</h1>
            <p className="text-sm text-gray-500 mt-1">{t.coach_name ? `Coach ${t.coach_name} · ` : ""}{t.player_count} players</p>
          </div>
          <button onClick={() => window.print()} className="no-print inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50"><Printer size={14} /> Print / PDF</button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2 text-gray-700"><ListOrdered size={15} className="text-[#0b5cd6]" /><h2 className="text-sm font-bold">Team ranking</h2></div>
          <p className="text-xs text-gray-400 mb-3">How the roster ordered relative to their own teammates through the evaluation process.</p>
          <ol className="rounded-xl border border-gray-100 divide-y divide-gray-50">
            {t.ranking.map(p => (
              <li key={p.within_rank} className="flex items-center gap-3 px-3 py-2">
                <span className="w-6 text-center text-xs font-bold text-[#0b5cd6] tabular-nums">{p.within_rank}</span>
                <span className="flex-1 text-sm font-medium text-gray-900">{p.name}</span>
                {p.position && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{POS_SHORT[p.position] || p.position}</span>}
              </li>
            ))}
          </ol>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2 text-gray-700"><Target size={15} className="text-[#0b5cd6]" /><h2 className="text-sm font-bold">Development themes</h2></div>
          {t.themes.length ? (
            <>
              <p className="text-xs text-gray-400 mb-3">What evaluators flagged most across this team — plan the season's focus around these.</p>
              <div className="flex flex-wrap gap-2">
                {t.themes.map(th => (
                  <span key={th.theme} className="inline-flex items-center gap-1.5 rounded-full border border-[#0b5cd6]/20 bg-[#0b5cd6]/5 text-[#0b5cd6] font-medium" style={{ padding: "6px 12px", fontSize: `${Math.min(15, 11 + th.count / 3)}px` }}>
                    {th.theme}<span className="text-gray-400 text-xs">{th.count}</span>
                  </span>
                ))}
              </div>
            </>
          ) : <p className="text-sm text-gray-400 italic">No written evaluator notes for this team yet.</p>}
        </div>
      </div>
      <p className="max-w-3xl mx-auto px-4 sm:px-6 pb-8 text-xs text-gray-300">This private report was shared with you by your association. Please don't forward the link.</p>
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
