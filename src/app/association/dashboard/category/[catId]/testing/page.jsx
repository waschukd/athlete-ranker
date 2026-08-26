"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, ClipboardList, AlertTriangle } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

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

  return (
    <div data-theme={theme} className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="min-w-0">
              <a href={`/association/dashboard/category/${catId}?org=${orgId}`}
                className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 transition-opacity mb-2">
                <ArrowLeft size={13} /> Back to rankings
              </a>
              <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">
                Raw Testing Scores
              </h1>
              {data?.category?.name && (
                <p className="text-sm text-gray-500 font-medium mt-3">{data.category.name}</p>
              )}
            </div>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>

          {sessions.length > 1 && (
            <div className="flex gap-1 mt-4 overflow-x-auto">
              {sessions.map(s => (
                <button key={s.session_number} onClick={() => setActiveSession(s.session_number)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${
                    activeSession === s.session_number
                      ? "bg-accent text-white border-accent"
                      : "border-gray-200 text-gray-600 hover:border-accent hover:text-accent"
                  }`}>
                  Session {s.session_number}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
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
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5">
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <b>{current.missing.length} athlete{current.missing.length !== 1 ? "s" : ""} on the roster with no testing score:</b>{" "}
                  {current.missing.map(a => `${a.first_name} ${a.last_name}`).join(", ")}.
                  {" "}Usually means they joined the roster after the results were uploaded — re-upload the CSV or add them directly.
                </div>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList size={16} className="text-accent" />
                  <span className="text-base font-semibold text-gray-900">
                    {current.athletes.length} Athlete{current.athletes.length !== 1 ? "s" : ""} Tested
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-14">Rank</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Athlete</th>
                      {testNames.map(name => (
                        <th key={name} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[...current.athletes].sort((a, b) => a.overall_rank - b.overall_rank).map(a => (
                      <tr key={a.athlete_id} className="hover:bg-gray-50">
                        <td className={`px-4 py-3 font-display text-lg font-extrabold tabular-nums ${medalColor(a.overall_rank)}`}>{a.overall_rank}</td>
                        <td className="px-4 py-3 text-gray-900 font-medium whitespace-nowrap">{a.first_name} {a.last_name}</td>
                        {testNames.map(name => {
                          const t = a.tests.find(x => x.test_name === name);
                          return (
                            <td key={name} className="px-4 py-3 text-center tabular-nums text-gray-700">
                              {t ? (
                                <span>
                                  {t.value}
                                  {t.rank != null && <span className="text-gray-400 text-xs ml-1">(#{t.rank})</span>}
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
