"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Shield, LogOut, Users, Building2, Star, Plus, ChevronRight } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

function GoalieProviderInner() {
  const searchParams = useSearchParams();
  const orgParam = searchParams.get("org");
  const q = (path) => (orgParam ? `${path}${path.includes("?") ? "&" : "?"}org=${orgParam}` : path);
  const [theme, toggleTheme] = useTheme();

  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCat, setSelectedCat] = useState(null); // { id, name, org }
  const [ranks, setRanks] = useState(null);
  const [evaluators, setEvaluators] = useState([]);
  const [addCat, setAddCat] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addMsg, setAddMsg] = useState(null);

  const loadEvaluators = () => fetch(q("/api/goalie-provider/evaluators")).then(r => r.json()).then(d => setEvaluators(d.evaluators || []));

  useEffect(() => {
    fetch(q("/api/goalie-provider/overview")).then(r => r.json()).then(d => {
      if (d.error) setError(d.error); else setOverview(d);
      setLoading(false);
    }).catch(() => { setError("Failed to load"); setLoading(false); });
    loadEvaluators();
  }, [orgParam]);

  const openRankings = (cat, orgName) => {
    setSelectedCat({ ...cat, org: orgName });
    setRanks(null);
    fetch(q(`/api/goalie-provider/rankings?cat=${cat.id}`)).then(r => r.json()).then(d => setRanks(d));
  };

  const allCats = (overview?.associations || []).flatMap(o => o.categories.map(c => ({ ...c, org: o.name })));

  const addEvaluator = async () => {
    setAddMsg(null);
    if (!addCat || !addEmail) { setAddMsg({ type: "error", text: "Pick a category and enter an email." }); return; }
    const res = await fetch(q("/api/goalie-provider/evaluators"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ age_category_id: Number(addCat), email: addEmail }),
    });
    const d = await res.json();
    if (!res.ok || d.error) { setAddMsg({ type: "error", text: d.error || "Failed" }); return; }
    setAddMsg({ type: "success", text: d.already ? "Already a goalie evaluator there." : "Goalie evaluator added." });
    setAddEmail("");
    loadEvaluators();
  };

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-end items-center gap-3">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1">
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 pt-1">
          <div className="font-display text-xs font-bold tracking-[0.2em] uppercase text-accent mb-2 flex items-center gap-2"><Shield size={13} /> Goalie Service Provider</div>
          <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">{overview?.sp?.name || "Goalie Provider"}</h1>
          <div className="flex items-center gap-2 mt-3 flex-wrap text-sm text-gray-500 font-medium">
            <span><b className="text-ink">{overview?.total_associations ?? 0}</b> association{overview?.total_associations === 1 ? "" : "s"}</span>
            <span className="text-gray-300">·</span>
            <span><b className="text-ink">{overview?.total_goalies ?? 0}</b> goalie{overview?.total_goalies === 1 ? "" : "s"}</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400">goalies only — skaters are managed by the association's skater provider</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* LEFT: associations + categories + rankings */}
        <div className="lg:col-span-2 space-y-6">
          {loading ? (
            <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
          ) : (overview?.associations || []).length === 0 ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-2xl py-16 text-center">
              <Building2 size={40} className="mx-auto text-gray-200 mb-3" />
              <h3 className="font-semibold text-gray-600">No associations linked yet</h3>
              <p className="text-xs text-gray-400 mt-1">An association invites you, then their goalies show up here.</p>
            </div>
          ) : (
            overview.associations.map(org => (
              <div key={org.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <Building2 size={16} className="text-accent" />
                  <h3 className="font-display font-bold text-ink text-lg leading-tight">{org.name}</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {org.categories.map(cat => (
                    <button key={cat.id} onClick={() => openRankings(cat, org.name)} className={`w-full px-5 py-3 flex items-center justify-between gap-3 text-left hover:bg-gray-50 ${selectedCat?.id === cat.id ? "bg-accent-soft" : ""}`}>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{cat.name}</div>
                        <div className="text-xs text-gray-400">{cat.goalie_count} goalie{cat.goalie_count === 1 ? "" : "s"}</div>
                      </div>
                      <ChevronRight size={16} className="text-gray-300" />
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}

          {selectedCat && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <Star size={16} className="text-accent" />
                <div>
                  <h3 className="font-display font-bold text-ink text-lg leading-tight">Goalie rankings — {selectedCat.name}</h3>
                  <p className="text-xs text-gray-400">{selectedCat.org} · ranked separately from skaters</p>
                </div>
              </div>
              {!ranks ? (
                <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
              ) : (ranks.goalies || []).length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">No goalie scores yet for this category.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">Rank</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">First</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last</th>
                        {(ranks.sessions || []).map(s => <th key={s.session_number} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">S{s.session_number}</th>)}
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ranks.goalies.map(a => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-display text-lg font-extrabold tabular-nums text-ink">{a.rank}</td>
                          <td className="px-4 py-3 text-gray-900">{a.first_name}</td>
                          <td className="px-4 py-3 text-gray-900 font-semibold">{a.last_name}</td>
                          {(ranks.sessions || []).map(s => { const sd = a.session_scores?.[s.session_number]; return <td key={s.session_number} className="px-4 py-3 text-center tabular-nums">{sd ? <span className="text-gray-900 font-medium">{sd.normalized_score?.toFixed(1)}</span> : <span className="text-gray-200">—</span>}</td>; })}
                          <td className={`px-4 py-3 text-center font-display text-lg font-extrabold tabular-nums ${a.rank === 1 ? "text-accent" : "text-ink"}`}>{a.weighted_total > 0 ? a.weighted_total?.toFixed(1) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: goalie evaluators */}
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="font-display font-bold text-ink text-lg leading-tight flex items-center gap-2"><Users size={16} className="text-accent" /> Goalie evaluators</h3>
            <p className="text-xs text-gray-400 mt-0.5 mb-3">They only see goalies when scoring.</p>
            {evaluators.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No goalie evaluators assigned yet.</p>
            ) : (
              <div className="divide-y divide-gray-100 -mx-1">
                {evaluators.map((e, i) => (
                  <div key={i} className="px-1 py-2">
                    <div className="text-sm font-medium text-ink">{e.name || e.email || e.user_email}</div>
                    <div className="text-xs text-gray-400">{e.org_name} · {e.category_name}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <div className="font-display text-xs font-bold tracking-[0.14em] uppercase text-gray-500">Add goalie evaluator</div>
              <select value={addCat} onChange={e => setAddCat(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/30">
                <option value="">Select category…</option>
                {allCats.map(c => <option key={c.id} value={c.id}>{c.org} · {c.name}</option>)}
              </select>
              <input type="email" placeholder="evaluator@email.com" value={addEmail} onChange={e => setAddEmail(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              <button onClick={addEvaluator} className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90"><Plus size={14} /> Add evaluator</button>
              {addMsg && <p className={`text-xs font-medium ${addMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>{addMsg.text}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GoalieProviderDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>}>
      <GoalieProviderInner />
    </Suspense>
  );
}
