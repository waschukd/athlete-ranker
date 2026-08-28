"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import RankBadge from "@/components/RankBadge";

// Standalone coach-only ranking — the same computeCategoryRankings engine as
// the official Rankings tab, scoped to ONLY coach-evaluator scores (scope=coach).
// Coaches never touch the official ranking; this is the dedicated view for
// associations/coaches to see their own ranked, sorted results at season's end.
const POSITION_COLORS = { forward: "bg-blue-100 text-blue-700", defense: "bg-purple-100 text-purple-700", forward_defense: "bg-teal-100 text-teal-700", goalie: "bg-amber-100 text-amber-700" };
const POSITION_SHORT = { forward: "F", defense: "D", forward_defense: "F/D", goalie: "G" };

function RankingsTable({ rows, sessions, hasPositionTagging, sortBy, toggleSort, sortIcon }) {
  const sorted = sortBy ? [...rows].sort((a, b) => {
    let av, bv;
    if (sortBy.key === "rank") { av = a.rank; bv = b.rank; }
    else if (sortBy.key === "first") { av = a.first_name || ""; bv = b.first_name || ""; }
    else if (sortBy.key === "last") { av = a.last_name || ""; bv = b.last_name || ""; }
    else if (sortBy.key === "total") { av = a.weighted_total ?? -1; bv = b.weighted_total ?? -1; }
    else { av = a.session_scores?.[sortBy.key]?.normalized_score ?? -1; bv = b.session_scores?.[sortBy.key]?.normalized_score ?? -1; }
    if (typeof av === "string") return sortBy.dir === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
    return sortBy.dir === "desc" ? bv - av : av - bv;
  }) : rows;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12 cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort("rank")}>Rank{sortIcon("rank")}</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort("first")}>First{sortIcon("first")}</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort("last")}>Last{sortIcon("last")}</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" title="Jersey number from their most recent check-in">#</th>
            {hasPositionTagging && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pos</th>}
            {sessions.map(s => (
              <th key={s.session_number} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort(s.session_number)}>S{s.session_number}{sortIcon(s.session_number)}</th>
            ))}
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort("total")}>Total{sortIcon("total")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.length === 0 ? (
            <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400 text-sm">No coach scores yet</td></tr>
          ) : sorted.map(a => (
            <tr key={a.id} className={`hover:bg-gray-50 ${a.rank === 1 ? "bg-accent-soft" : ""}`}>
              <td className="px-4 py-3"><RankBadge rank={a.rank} tied={rows.filter(x => x.rank === a.rank).length > 1} /></td>
              <td className="px-4 py-3 text-gray-900 font-medium">{a.first_name}</td>
              <td className="px-4 py-3 text-gray-900 font-semibold">
                {a.last_name}
                {a.incomplete && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium" title={`Attended ${a.sessions_attended} of ${a.sessions_total} sessions — prorated`}>*</span>}
              </td>
              <td className="px-4 py-3 tabular-nums text-gray-700">{a.last_jersey_number ?? <span className="text-gray-300">-</span>}</td>
              {hasPositionTagging && (
                <td className="px-4 py-3">{a.position ? <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${POSITION_COLORS[a.position] || "bg-gray-100 text-gray-600"}`}>{POSITION_SHORT[a.position] || a.position}</span> : <span className="text-gray-300">-</span>}</td>
              )}
              {sessions.map(s => {
                const sd = a.session_scores?.[s.session_number];
                return <td key={s.session_number} className="px-4 py-3 text-center tabular-nums">{sd ? <span className="font-medium text-gray-900">{sd.normalized_score?.toFixed(1)}</span> : <span className="text-gray-200">-</span>}</td>;
              })}
              <td className={`px-4 py-3 text-center font-display text-lg font-extrabold tabular-nums ${a.rank === 1 ? "text-accent" : "text-ink"}`}>{a.weighted_total?.toFixed(1) || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CoachRankingsPanel({ catId, hasPositionTagging }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["coach-rankings", catId],
    queryFn: async () => { const res = await fetch(`/api/categories/${catId}/rankings?scope=coach`); return res.json(); },
    enabled: !!catId,
    refetchInterval: 120000,
  });
  const [sortBy, setSortBy] = useState(null);
  const toggleSort = (key) => setSortBy(prev => prev?.key === key ? { key, dir: prev.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" });
  const sortIcon = (key) => sortBy?.key === key ? (sortBy.dir === "desc" ? " ↓" : " ↑") : "";

  if (isLoading) return <div className="py-10 text-center text-gray-400 text-sm">Loading coach rankings…</div>;
  if (error || data?.error) return <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">Couldn't load coach rankings.</div>;

  const athletes = data?.athletes || [];
  const goalies = data?.goalies || [];
  const sessions = data?.sessions || [];

  // has_scores reflects the CATEGORY overall (official evaluators may already
  // have scores while no coach has scored a single athlete yet) -- so check
  // for real coach attendance directly rather than trusting that flag here.
  const anyCoachScores = [...athletes, ...goalies].some(a => (a.sessions_attended || 0) > 0);
  if (!data?.has_scores || !anyCoachScores) {
    return <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">No coach scores recorded yet.</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">Coach Rankings</h2>
        <p className="text-xs text-gray-400 mt-0.5">Ranked using only coach-evaluator scores — separate from, and never counted toward, the official evaluator ranking.</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {goalies.length > 0 && <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-sm font-semibold text-gray-900">Skaters</div>}
        <RankingsTable rows={athletes} sessions={sessions} hasPositionTagging={hasPositionTagging} sortBy={sortBy} toggleSort={toggleSort} sortIcon={sortIcon} />
      </div>
      {goalies.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-sm font-semibold text-gray-900">Goalies</div>
          <RankingsTable rows={goalies} sessions={sessions} hasPositionTagging={false} sortBy={sortBy} toggleSort={toggleSort} sortIcon={sortIcon} />
        </div>
      )}
    </div>
  );
}
