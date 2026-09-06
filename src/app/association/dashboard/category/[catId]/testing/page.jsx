"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, ClipboardList, AlertTriangle, ChevronUp, ChevronDown } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";
import { sortTestingAthletes, nextSort } from "@/lib/testingSort";

// A drill header sorts by time on click, and by that drill's RANK on a second
// control, because "who was fastest" and "where did she place" are different
// questions and the table is read for both.
function SortArrow({ active, dir }) {
  if (!active) return <span className="inline-block w-3" />;
  return dir === "asc"
    ? <ChevronUp size={11} className="inline-block text-accent" />
    : <ChevronDown size={11} className="inline-block text-accent" />;
}

function medalColor(rank) {
  if (rank === 1) return "text-amber-500";
  if (rank === 2) return "text-gray-400";
  if (rank === 3) return "text-amber-700";
  return "text-gray-900";
}

function TestingContent() {
  const params = useParams();
  const catId = params.catId;
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
  const [sort, setSort] = useState({ key: "rank", dir: "asc", field: "value" });
  const [theme, toggleTheme] = useTheme();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/categories/${catId}/testing-scores`);
    const json = await res.json();
    setData(json);
    if (json.sessions?.length) setActiveSession(prev => prev ?? json.sessions[json.sessions.length - 1].session_number);
    setLoading(false);
  }, [catId]);

  useEffect(() => { load(); }, [load]);

  const sessions = data?.sessions || [];
  const current = sessions.find(s => s.session_number === activeSession) || sessions[0];
  const testNames = current?.test_names || [];
  const rows = sortTestingAthletes(current?.athletes, sort);
  const sortBy = (key, field = "value") => setSort(s => nextSort(s, key, field));
  const isSorted = (key, field = "value") => sort.key === key && (sort.field || "value") === field;

  // Switching sessions keeps the sort, unless it was on a drill that session
  // does not have -- then fall back to overall rank rather than showing a
  // column sorted by nothing.
  useEffect(() => {
    if (sort.key === "rank" || sort.key === "name") return;
    if (!testNames.includes(sort.key)) setSort({ key: "rank", dir: "asc", field: "value" });
  }, [activeSession, testNames, sort.key]);

  return (
    <div data-theme={theme} className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="min-w-0 flex items-center gap-3 flex-wrap">
              <a href={`/association/dashboard/category/${catId}?org=${orgId}`}
                className="inline-flex items-center gap-1.5 font-display text-[11px] font-bold tracking-[0.15em] uppercase text-accent hover:opacity-70 transition-opacity">
                <ArrowLeft size={12} /> Back
              </a>
              <span className="text-gray-300">·</span>
              <h1 className="font-display font-extrabold tracking-tight text-ink text-lg leading-none">
                Raw Testing Scores
              </h1>
              {data?.category?.name && (
                <span className="text-xs text-gray-500 font-medium">{data.category.name}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {sessions.length > 1 && (
                <div className="flex gap-1">
                  {sessions.map(s => (
                    <button key={s.session_number} onClick={() => setActiveSession(s.session_number)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${
                        activeSession === s.session_number
                          ? "bg-accent text-white border-accent"
                          : "border-gray-200 text-gray-600 hover:border-accent hover:text-accent"
                      }`}>
                      S{s.session_number}
                    </button>
                  ))}
                </div>
              )}
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-3 space-y-2 flex-1 min-h-0 flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0b5cd6]" />
          </div>
        ) : !current ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl px-6 py-16 text-center">
            <ClipboardList size={36} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">No testing results uploaded yet.</p>
          </div>
        ) : (
          <>
            {current.missing.length > 0 && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex-shrink-0">
                <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800">
                  <b>{current.missing.length} athlete{current.missing.length !== 1 ? "s" : ""} with no score:</b>{" "}
                  {current.missing.map(a => `${a.first_name} ${a.last_name}`).join(", ")}
                </div>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
              <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
                <ClipboardList size={14} className="text-accent" />
                <span className="text-sm font-semibold text-gray-900">
                  {current.athletes.length} Athlete{current.athletes.length !== 1 ? "s" : ""} Tested
                </span>
                <span className="text-xs text-gray-400 font-normal">· drills left to right in the order they were run · click a heading to sort, <span className="font-semibold">#</span> for placing</span>
              </div>
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase w-10">
                        <button onClick={() => sortBy("rank")} title="Sort by overall testing rank"
                          className={`inline-flex items-center gap-0.5 uppercase hover:text-accent transition-colors ${isSorted("rank") ? "text-accent" : ""}`}>
                          Rank <SortArrow active={isSorted("rank")} dir={sort.dir} />
                        </button>
                      </th>
                      <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase">
                        <button onClick={() => sortBy("name")} title="Sort by last name"
                          className={`inline-flex items-center gap-0.5 uppercase hover:text-accent transition-colors ${isSorted("name") ? "text-accent" : ""}`}>
                          Athlete <SortArrow active={isSorted("name")} dir={sort.dir} />
                        </button>
                      </th>
                      {testNames.map(name => (
                        <th key={name} className="px-2.5 py-1.5 text-center text-[10px] font-medium text-gray-500 uppercase whitespace-nowrap">
                          <button onClick={() => sortBy(name)} title={`Sort by ${name} time`}
                            className={`inline-flex items-center gap-0.5 uppercase hover:text-accent transition-colors ${isSorted(name) ? "text-accent" : ""}`}>
                            {name} <SortArrow active={isSorted(name)} dir={sort.dir} />
                          </button>
                          {/* Placing in a drill is a separate question from the raw
                              time, and the ranks are already on screen -- so they
                              get their own control rather than a second click that
                              means something different. */}
                          <button onClick={() => sortBy(name, "rank")} title={`Sort by ${name} placing`}
                            className={`ml-1 font-normal normal-case hover:text-accent transition-colors ${isSorted(name, "rank") ? "text-accent" : "text-gray-300"}`}>
                            #<SortArrow active={isSorted(name, "rank")} dir={sort.dir} />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(a => (
                      <tr key={a.athlete_id} className="hover:bg-gray-50">
                        <td className={`px-3 py-1 font-display text-sm font-extrabold tabular-nums ${medalColor(a.overall_rank)}`}>{a.overall_rank}</td>
                        <td className="px-3 py-1 text-gray-900 font-medium whitespace-nowrap">{a.first_name} {a.last_name}</td>
                        {testNames.map(name => {
                          const t = a.tests.find(x => x.test_name === name);
                          return (
                            <td key={name} className="px-2.5 py-1 text-center tabular-nums text-gray-700 whitespace-nowrap">
                              {t ? (
                                <span>
                                  {t.value}
                                  {t.rank != null && <span className="text-gray-400 ml-1">#{t.rank}</span>}
                                </span>
                              ) : <span className="text-gray-200">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function TestingScoresPage() {
  return (
    <Suspense fallback={
      <div data-theme="premium" className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" />
      </div>
    }>
      <TestingContent />
    </Suspense>
  );
}
