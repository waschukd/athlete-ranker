"use client";

import { Suspense, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArrowLeft, Printer, Users } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";
import { TeamReportBody } from "@/components/CoachReportBody";

const qc = new QueryClient();

function CoachesReportInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const catId = params.catId;
  const orgId = searchParams.get("org");
  const [theme, toggleTheme] = useTheme();
  const [teamFilter, setTeamFilter] = useState("all");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["coaches-report", catId],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/coaches-report`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load");
      return res.json();
    },
  });

  const [generatingId, setGeneratingId] = useState(null);
  const [genErr, setGenErr] = useState("");
  const generateBriefing = async (teamId) => {
    setGeneratingId(teamId); setGenErr("");
    try {
      const res = await fetch(`/api/categories/${catId}/coach-briefing`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId }),
      });
      const d = await res.json();
      if (!res.ok) setGenErr(d.error || "Couldn't generate the briefing.");
      else await refetch();
    } catch { setGenErr("Network error — please try again."); }
    finally { setGeneratingId(null); setTimeout(() => setGenErr(""), 6000); }
  };

  const teams = data?.teams || [];
  const shown = teamFilter === "all" ? teams : teams.filter(t => String(t.id) === teamFilter);

  return (
    <div data-theme={theme} className="min-h-screen bg-gray-50">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
      <div className="bg-white border-b border-gray-200 shadow-sm no-print">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-start justify-between gap-4">
            <a href={`/association/dashboard/category/${catId}?org=${orgId}`} className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 mb-2"><ArrowLeft size={13} /> Back to dashboard</a>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-display font-black tracking-tight text-ink text-3xl sm:text-4xl leading-none">Team Development Report</h1>
              {data && <p className="text-sm text-gray-500 mt-1">{data.category.org_name} · {data.category.name} · {data.category.team_count} teams</p>}
            </div>
            <div className="flex items-center gap-2">
              {teams.length > 1 && (
                <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent/30">
                  <option value="all">All teams</option>
                  {teams.map(t => <option key={t.id} value={String(t.id)}>{t.name}{t.coach_name ? ` · ${t.coach_name}` : ""}</option>)}
                </select>
              )}
              <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50"><Printer size={14} /> Print / PDF</button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {isLoading ? (
          <div className="py-16 text-center text-gray-400"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0b5cd6] mx-auto mb-3" />Building report…</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{String(error.message || error)}</div>
        ) : !teams.length ? (
          <div className="py-16 text-center bg-white border border-dashed border-gray-200 rounded-2xl">
            <Users size={44} className="mx-auto text-gray-200 mb-4" />
            <h3 className="font-semibold text-gray-700 mb-1">No teams yet</h3>
            <p className="text-sm text-gray-400">Build your final teams first — then this report profiles each one for its coach.</p>
          </div>
        ) : (
          <>
            {data.unrostered > 0 && <p className="text-xs text-gray-400">{data.unrostered} evaluated skater{data.unrostered === 1 ? "" : "s"} not yet on a team.</p>}
            {genErr && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{genErr}</div>}
            {shown.map(t => (
              <div key={t.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden break-inside-avoid">
                <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-xl font-black text-ink">{t.name}</h3>
                      {t.is_top && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Top team</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{t.coach_name ? `Coach ${t.coach_name} · ` : ""}{t.player_count} players</p>
                  </div>
                </div>
                <TeamReportBody t={t} onGenerate={generateBriefing} generating={generatingId === t.id} />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default function CoachesReportPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>}>
        <CoachesReportInner />
      </Suspense>
    </QueryClientProvider>
  );
}
