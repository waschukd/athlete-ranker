"use client";

import { Suspense, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArrowLeft, Printer, Users, TrendingUp, Target, ClipboardList } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

const qc = new QueryClient();

// A 0–100 skill bar: the team's value filled in one hue, with the category
// average and top-team average as reference markers (never a second bar / axis).
function SkillBar({ name, team, category, topTeam }) {
  const clamp = (v) => Math.max(0, Math.min(100, v ?? 0));
  const marker = (v, color, label) => v == null ? null : (
    <div className="absolute top-0 bottom-0 flex flex-col items-center" style={{ left: `${clamp(v)}%`, transform: "translateX(-50%)" }} title={`${label}: ${v.toFixed(1)}`}>
      <div className="w-0.5 h-full" style={{ background: color, opacity: 0.9 }} />
    </div>
  );
  const vsCat = (team != null && category != null) ? team - category : null;
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-semibold text-gray-800">{name}</span>
        <span className="text-sm tabular-nums">
          <b className="text-[#0b5cd6]">{team != null ? team.toFixed(1) : "—"}</b>
          {vsCat != null && (
            <span className={`ml-2 text-xs font-medium ${vsCat >= 0 ? "text-green-600" : "text-red-500"}`}>
              {vsCat >= 0 ? "+" : ""}{vsCat.toFixed(1)} vs field
            </span>
          )}
        </span>
      </div>
      <div className="relative h-4 rounded-full bg-gray-100 overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${clamp(team)}%`, background: "linear-gradient(90deg,#0b5cd6,#3b82f6)" }} />
      </div>
      {/* reference markers sit on their own track so they never hide behind the fill */}
      <div className="relative h-3 mt-0.5">
        {marker(category, "#6b7280", "Field average")}
        {marker(topTeam, "#d4af37", "Top team")}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
      <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2.5 rounded" style={{ background: "linear-gradient(90deg,#0b5cd6,#3b82f6)" }} /> This team</span>
      <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3" style={{ background: "#6b7280" }} /> Field average</span>
      <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3" style={{ background: "#d4af37" }} /> Top team</span>
    </div>
  );
}

function TeamSection({ t }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden break-inside-avoid">
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-xl font-black text-ink">{t.name}</h3>
            {t.is_top && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Top team</span>}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {t.coach_name ? `Coach ${t.coach_name} · ` : ""}{t.player_count} players
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <div className="font-display text-2xl font-black text-[#0b5cd6] tabular-nums">{t.avg_rank_percentile != null ? `${Math.round(t.avg_rank_percentile)}` : "—"}</div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400">Avg percentile</div>
          </div>
          {t.testing_percentile != null && (
            <div className="text-center">
              <div className="font-display text-2xl font-black text-purple-600 tabular-nums">{Math.round(t.testing_percentile)}</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400">Testing</div>
            </div>
          )}
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Skill profile */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-gray-700"><TrendingUp size={15} className="text-[#0b5cd6]" /><h4 className="text-sm font-bold">Skill profile vs the field</h4></div>
          {t.perSkill.map(s => <SkillBar key={s.name} {...s} />)}
          <div className="mt-2"><Legend /></div>
        </div>

        {/* Development themes */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-gray-700"><Target size={15} className="text-[#0b5cd6]" /><h4 className="text-sm font-bold">Development themes</h4></div>
          {t.themes.length ? (
            <>
              <p className="text-xs text-gray-400 mb-3">What evaluators flagged most across this team — the bigger the chip, the more it came up.</p>
              <div className="flex flex-wrap gap-2">
                {t.themes.map((th, i) => (
                  <span key={th.theme} className="inline-flex items-center gap-1.5 rounded-full border border-[#0b5cd6]/20 bg-[#0b5cd6]/5 text-[#0b5cd6] font-medium"
                    style={{ padding: "6px 12px", fontSize: `${Math.min(15, 11 + th.count / 3)}px` }}>
                    {th.theme}<span className="text-gray-400 text-xs">{th.count}</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 italic">No written evaluator notes for this team yet — themes appear once evaluators add observations.</p>
          )}
        </div>
      </div>

      {/* Roster */}
      <div className="px-5 pb-5">
        <div className="flex items-center gap-2 mb-2 text-gray-700"><ClipboardList size={15} className="text-[#0b5cd6]" /><h4 className="text-sm font-bold">Roster</h4></div>
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="text-left px-3 py-2 font-semibold">#</th>
                <th className="text-left px-3 py-2 font-semibold">Player</th>
                <th className="text-center px-3 py-2 font-semibold">Cat. rank</th>
                <th className="text-center px-3 py-2 font-semibold">%ile</th>
                {t.perSkill.map(s => <th key={s.name} className="text-center px-3 py-2 font-semibold whitespace-nowrap">{s.name}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {t.roster.map(p => (
                <tr key={p.athlete_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400 tabular-nums">{p.rank ?? "—"}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{p.name}{p.position === "goalie" ? <span className="ml-1 text-xs text-amber-600">G</span> : ""}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-gray-600">{p.rank ?? "—"}</td>
                  <td className="px-3 py-2 text-center tabular-nums font-semibold text-[#0b5cd6]">{p.percentile != null ? Math.round(p.percentile) : "—"}</td>
                  {t.perSkill.map(s => <td key={s.name} className="px-3 py-2 text-center tabular-nums text-gray-700">{p.perSkill[s.name] != null ? p.perSkill[s.name].toFixed(1) : "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CoachesReportInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const catId = params.catId;
  const orgId = searchParams.get("org");
  const [theme, toggleTheme] = useTheme();
  const [teamFilter, setTeamFilter] = useState("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["coaches-report", catId],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/coaches-report`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load");
      return res.json();
    },
  });

  const teams = data?.teams || [];
  const shown = teamFilter === "all" ? teams : teams.filter(t => String(t.id) === teamFilter);

  return (
    <div data-theme={theme} className="min-h-screen bg-gray-50">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
      <div className="bg-white border-b border-gray-200 shadow-sm no-print">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-start justify-between gap-4">
            <a href={`/association/dashboard/category/${catId}?org=${orgId}`} className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 mb-2"><ArrowLeft size={13} /> Back to dashboard</a>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-display font-black tracking-tight text-ink text-3xl sm:text-4xl leading-none">Team Development Report</h1>
              {data && <p className="text-sm text-gray-500 mt-1">{data.category.org_name} · {data.category.name} · {data.category.skater_count} skaters across {data.category.team_count} teams</p>}
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

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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
            {/* Category rollup */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 break-inside-avoid">
              <div className="flex items-center gap-2 mb-3 text-gray-700"><TrendingUp size={16} className="text-[#0b5cd6]" /><h2 className="font-display text-lg font-extrabold text-ink">Category profile</h2></div>
              <p className="text-xs text-gray-400 mb-4">Where the whole {data.category.name} group averages on each skill, with the top team for reference. Individual teams are profiled below.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                {data.skills.map(s => (
                  <SkillBar key={s.name} name={s.name} team={s.category} category={s.category} topTeam={s.topTeam} />
                ))}
              </div>
              {!data.hasTesting && <p className="mt-3 text-xs text-gray-400 italic">Objective testing scores aren't in yet — testing profiles fill in once drill results are uploaded.</p>}
              {data.unrostered > 0 && <p className="mt-1 text-xs text-gray-400">{data.unrostered} evaluated skater{data.unrostered === 1 ? "" : "s"} not yet on a team.</p>}
            </div>

            {shown.map(t => <TeamSection key={t.id} t={t} />)}
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
