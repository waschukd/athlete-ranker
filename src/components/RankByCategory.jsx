"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, ArrowDown, ArrowUp, Download } from "lucide-react";

// Rank by Category — every athlete's average score in each scoring criterion,
// across all evaluators and all sessions, sortable high-to-low on any column.
//
// The Rankings tab answers "who is best overall". This answers "who are my four
// best skaters", which is the question actually being asked when a team is built
// around a need. Coach scores are excluded server-side to match official rank.

export default function RankByCategory({ catId }) {
  const [sortKey, setSortKey] = useState("overall"); // "overall" | criterion id | "name"
  const [sortDir, setSortDir] = useState("desc");
  const [pool, setPool] = useState("skaters"); // skaters | goalies
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["skill-averages", catId],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/skill-averages`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load");
      return res.json();
    },
    enabled: !!catId,
  });

  const criteria = data?.criteria || [];
  const athletes = data?.athletes || [];
  const hasGoalies = athletes.some(a => a.is_goalie);

  // Show only the criteria that apply to the pool on screen, so the table is not
  // mostly empty columns.
  const shownCriteria = useMemo(() => criteria.filter(c =>
    pool === "goalies"
      ? (c.applies_to === "goalies" || c.applies_to === "goalie_skills" || c.applies_to === "all")
      : (c.applies_to !== "goalies" && c.applies_to !== "goalie_skills")
  ), [criteria, pool]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = athletes.filter(a => (pool === "goalies" ? a.is_goalie : !a.is_goalie));
    if (q) list = list.filter(a => `${a.first_name} ${a.last_name}`.toLowerCase().includes(q));

    const val = (a) => {
      if (sortKey === "name") return null;
      if (sortKey === "overall") return a.overall;
      return a.scores?.[sortKey]?.avg ?? null;
    };

    return [...list].sort((a, b) => {
      if (sortKey === "name") {
        const c = `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
        return sortDir === "asc" ? c : -c;
      }
      const av = val(a), bv = val(b);
      // Unscored players always sink to the bottom regardless of direction --
      // a missing average is not a low one, and mixing them into the order
      // would read as "these players ranked last".
      if (av == null && bv == null) return `${a.last_name}`.localeCompare(`${b.last_name}`);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av === bv) return `${a.last_name}`.localeCompare(`${b.last_name}`);
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [athletes, pool, search, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <ArrowUpDown size={11} className="text-gray-300 inline-block ml-1" />;
    return sortDir === "desc"
      ? <ArrowDown size={11} className="text-accent inline-block ml-1" />
      : <ArrowUp size={11} className="text-accent inline-block ml-1" />;
  };

  const downloadCsv = () => {
    const header = ["Rank", "Last", "First", ...shownCriteria.map(c => c.name), "Overall", "Evaluators", "Sessions"];
    const lines = [header.join(",")];
    rows.forEach((a, i) => {
      lines.push([
        i + 1,
        `"${a.last_name || ""}"`,
        `"${a.first_name || ""}"`,
        ...shownCriteria.map(c => a.scores?.[c.id]?.avg ?? ""),
        a.overall ?? "",
        a.evaluators || 0,
        a.sessions || 0,
      ].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `rank-by-category-${data?.category?.name || catId}.csv`.replace(/\s+/g, "-");
    el.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-10 text-center text-sm text-gray-400">
      Loading skill averages…
    </div>
  );
  if (error) return (
    <div className="bg-white border border-red-200 rounded-xl px-5 py-6 text-sm text-red-600">
      Could not load skill averages: {error.message}
    </div>
  );

  const scale = data?.category?.scoring_scale || 10;
  const anyScored = rows.some(a => a.scored);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Rank by Category</h3>
          <p className="text-xs text-gray-500">
            Average score per criterion across every evaluator and session. Click any column to sort.
            {data?.coach_scores_excluded > 0 && " Coach scores excluded."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasGoalies && (
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {[{ id: "skaters", label: "Skaters" }, { id: "goalies", label: "Goalies" }].map(p => (
                <button key={p.id} onClick={() => { setPool(p.id); setSortKey("overall"); setSortDir("desc"); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${pool === p.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name…"
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent/40 w-36"
          />
          <button onClick={downloadCsv} disabled={!anyScored}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-ink bg-white rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-40">
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      {!anyScored ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">
          No scores yet for {pool === "goalies" ? "goalies" : "skaters"} in this category.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2.5 w-12">#</th>
                <th className="text-left px-4 py-2.5 cursor-pointer select-none hover:text-ink" onClick={() => toggleSort("name")}>
                  Player <SortIcon k="name" />
                </th>
                {shownCriteria.map(c => (
                  <th key={c.id} className="text-center px-3 py-2.5 cursor-pointer select-none hover:text-ink whitespace-nowrap"
                    title={`Sort by ${c.name}`} onClick={() => toggleSort(c.id)}>
                    {c.name} <SortIcon k={c.id} />
                  </th>
                ))}
                <th className="text-center px-3 py-2.5 cursor-pointer select-none hover:text-ink" onClick={() => toggleSort("overall")}>
                  Overall <SortIcon k="overall" />
                </th>
                <th className="text-center px-3 py-2.5 whitespace-nowrap" title="Evaluators who scored this player / sessions scored">
                  Ev · Ses
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((a, i) => (
                <tr key={a.athlete_id} className={`${a.cut ? "opacity-40" : ""} hover:bg-gray-50`}>
                  <td className="px-4 py-2.5 tabular-nums text-gray-400 font-medium">{a.scored ? i + 1 : "—"}</td>
                  <td className="px-4 py-2.5 font-medium text-ink whitespace-nowrap">
                    {a.last_name}, {a.first_name}
                    {a.cut && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full font-semibold">Cut</span>}
                  </td>
                  {shownCriteria.map(c => {
                    const s = a.scores?.[c.id];
                    // Highlight the column being sorted so the eye lands on it.
                    const active = sortKey === c.id;
                    return (
                      <td key={c.id} className={`px-3 py-2.5 text-center tabular-nums ${active ? "bg-accent-soft/40 font-bold text-ink" : "text-gray-700"}`}>
                        {s ? s.avg.toFixed(1) : <span className="text-gray-200">—</span>}
                      </td>
                    );
                  })}
                  <td className={`px-3 py-2.5 text-center tabular-nums font-display font-extrabold ${sortKey === "overall" ? "text-accent" : "text-ink"}`}>
                    {a.overall != null ? a.overall.toFixed(1) : <span className="text-gray-200">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-gray-400 tabular-nums whitespace-nowrap">
                    {a.evaluators || 0} · {a.sessions || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
            Scores out of {scale}. &ldquo;Ev · Ses&rdquo; is how many evaluators scored that player and across how many sessions —
            a low count means the average rests on thin evidence.
          </div>
        </div>
      )}
    </div>
  );
}
