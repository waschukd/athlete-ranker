"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Star, Building2 } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

// Goalie-only rankings for one association, for a Goalie Service Provider.
// Goalie data exclusively — never the association's skater dashboards.
function Inner() {
  const sp = useSearchParams();
  const orgId = sp.get("org");
  const [theme, toggleTheme] = useTheme();
  const [assoc, setAssoc] = useState(null);
  const [ranks, setRanks] = useState({}); // catId -> data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/goalie-provider/overview").then(r => r.json()).then(d => {
      if (d.error) { setError(d.error); setLoading(false); return; }
      const a = (d.associations || []).find(o => String(o.id) === String(orgId));
      setAssoc(a || null);
      setLoading(false);
      for (const c of (a?.categories || [])) {
        fetch(`/api/goalie-provider/rankings?cat=${c.id}`).then(r => r.json()).then(rd => setRanks(prev => ({ ...prev, [c.id]: rd })));
      }
    }).catch(() => { setError("Failed to load"); setLoading(false); });
  }, [orgId]);

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <a href="/service-provider/dashboard" className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 mb-1"><ArrowLeft size={13} /> Goalie Service Provider</a>
            <h1 className="font-display font-black tracking-tight text-ink text-3xl sm:text-4xl leading-none flex items-center gap-3"><Star size={26} className="text-accent" /> Goalie Rankings</h1>
            {assoc && <p className="text-sm text-gray-500 mt-2 flex items-center gap-1.5"><Building2 size={14} /> {assoc.name}</p>}
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
        ) : !assoc ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl py-16 text-center text-gray-500">Association not found or not linked to you.</div>
        ) : assoc.categories.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl py-16 text-center text-gray-500">No categories yet.</div>
        ) : (
          assoc.categories.map(cat => {
            const data = ranks[cat.id];
            const goalies = data?.goalies || [];
            const sessions = data?.sessions || [];
            return (
              <div key={cat.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-display font-bold text-ink text-lg leading-tight">{cat.name}</h3>
                  <span className="text-xs text-gray-400">{cat.goalie_count} goalie{cat.goalie_count === 1 ? "" : "s"}</span>
                </div>
                {!data ? (
                  <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>
                ) : goalies.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">No goalie scores yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">Rank</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">First</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last</th>
                          {sessions.map(s => <th key={s.session_number} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">S{s.session_number}</th>)}
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {goalies.map(a => (
                          <tr key={a.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-display text-lg font-extrabold tabular-nums text-ink">{a.rank}</td>
                            <td className="px-4 py-3 text-gray-900">{a.first_name}</td>
                            <td className="px-4 py-3 text-gray-900 font-semibold">{a.last_name}</td>
                            {sessions.map(s => { const sd = a.session_scores?.[s.session_number]; return <td key={s.session_number} className="px-4 py-3 text-center tabular-nums">{sd ? <span className="text-gray-900 font-medium">{sd.normalized_score?.toFixed(1)}</span> : <span className="text-gray-200">—</span>}</td>; })}
                            <td className={`px-4 py-3 text-center font-display text-lg font-extrabold tabular-nums ${a.rank === 1 ? "text-accent" : "text-ink"}`}>{a.weighted_total > 0 ? a.weighted_total?.toFixed(1) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function GoalieRankingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>}>
      <Inner />
    </Suspense>
  );
}
