"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Lock, Target, AlertTriangle, Save, Users } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

const STATUS = {
  locked: { label: "Locked in", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: Lock },
  bubble: { label: "Bubble — play", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: Target },
  out: { label: "Out", cls: "bg-gray-100 text-gray-500 border-gray-200", Icon: null },
};

function PlannerInner() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org");
  const catId = typeof window !== "undefined" ? window.location.pathname.split("/")[4] : null;

  const [theme, toggleTheme] = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tiers, setTiers] = useState([{ name: "Roster", size: 17 }]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/categories/${catId}/contention`);
    const d = await res.json();
    setData(d);
    if (Array.isArray(d.roster_targets) && d.roster_targets.length) setTiers(d.roster_targets);
    setLoading(false);
  }, [catId]);
  useEffect(() => { if (catId) load(); }, [catId, load]);

  const saveTargets = async () => {
    setSaving(true);
    const clean = tiers.map(t => ({ name: t.name || "Roster", size: parseInt(t.size) || 0 })).filter(t => t.size > 0);
    await fetch(`/api/categories/${catId}/contention`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roster_targets: clean }),
    });
    await load();
    setSaving(false);
  };

  const a = data?.analysis;
  const players = a?.dataReady ? a.players : [];

  return (
    <div data-theme={theme} className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <a href={`/association/dashboard/category/${catId}?org=${orgId}`} className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 mb-2"><ArrowLeft size={13} /> Back to category</a>
            <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">Final Session Planner</h1>
            <p className="text-sm text-gray-500 mt-3 max-w-2xl">Before the last game(s), see who's already locked in, who's out of contention, and who's still on the bubble — so you rest the decided players and put your evaluation time on the ones who need it.</p>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Roster targets */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Roster targets</h2>
          <p className="text-xs text-gray-400 mb-4">How many players make it. One number for a single team, or add tiers (AA, A, BB…). These set the cut line(s).</p>
          <div className="space-y-2">
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-3">
                <input value={t.name} onChange={e => setTiers(ts => ts.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  placeholder="Tier name" className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input type="number" min={1} value={t.size} onChange={e => setTiers(ts => ts.map((x, j) => j === i ? { ...x, size: e.target.value } : x))}
                  className="w-20 px-3 py-2 border border-gray-200 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <span className="text-xs text-gray-400">players</span>
                {tiers.length > 1 && <button onClick={() => setTiers(ts => ts.filter((_, j) => j !== i))} className="p-1.5 text-gray-300 hover:text-red-400"><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={() => setTiers(ts => [...ts, { name: `Tier ${ts.length + 1}`, size: 15 }])} className="inline-flex items-center gap-1.5 text-sm text-accent font-medium hover:opacity-70"><Plus size={14} /> Add tier</button>
            <button onClick={saveTargets} disabled={saving} className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-50"><Save size={15} /> {saving ? "Saving…" : "Save & analyze"}</button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
        ) : !a?.dataReady ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-700 flex items-center gap-2">
            <AlertTriangle size={16} />
            {a?.reason === "no_roster_targets" ? "Set a roster target above and save to run the analysis."
              : a?.reason === "no_scored_sessions" ? "No scored sessions yet — the planner needs at least one game scored."
              : a?.reason === "no_remaining_sessions" ? "All sessions are complete — there's no upcoming game left to plan for."
              : a?.reason === "no_athletes" ? "No athletes in this category yet."
              : "Not enough data yet to plan."}
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              {[["locked", a.counts.locked], ["bubble", a.counts.bubble], ["out", a.counts.out]].map(([k, n]) => {
                const s = STATUS[k];
                return (
                  <div key={k} className={`rounded-2xl border p-4 ${s.cls}`}>
                    <div className="text-2xl font-black tabular-nums">{n}</div>
                    <div className="text-xs font-semibold uppercase tracking-wide">{s.label}</div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400">
              Forecasting {a.remaining_sessions.length} remaining session{a.remaining_sessions.length === 1 ? "" : "s"} ·
              cut line{a.lines.length === 1 ? "" : "s"} at {a.lines.map(l => `${l.name} ${l.at}`).join(", ")} ·
              based on {a.runs.toLocaleString()} simulations at {Math.round((1 - a.confidence) * 100)}% confidence (typical game-to-game movement ≈ {a.movement_sd} pts).
            </p>

            {/* Recommendation */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 flex items-start gap-3">
              <Users size={18} className="text-accent mt-0.5" />
              <div className="text-sm text-gray-700">
                <b className="text-ink">Recommended:</b> rest the {a.counts.locked + a.counts.out} decided player{a.counts.locked + a.counts.out === 1 ? "" : "s"} (locked + out), and play the <b className="text-ink">{a.counts.bubble}</b> on the bubble. You confirm each below — nothing is applied automatically.
              </div>
            </div>

            {/* Players */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr><th className="text-left px-4 py-2.5">#</th><th className="text-left px-4 py-2.5">Player</th><th className="text-left px-4 py-2.5">Projected</th><th className="text-left px-4 py-2.5">Status</th><th className="text-right px-4 py-2.5">Make-it odds</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {players.map(p => {
                    const s = STATUS[p.status];
                    return (
                      <tr key={p.id} className={p.status === "bubble" ? "bg-amber-50/40" : ""}>
                        <td className="px-4 py-2.5 text-gray-400 tabular-nums">{p.rank}</td>
                        <td className="px-4 py-2.5 font-medium text-ink">{p.last_name}, {p.first_name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{p.projected_tier}</td>
                        <td className="px-4 py-2.5"><span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.Icon && <s.Icon size={11} />}{s.label}</span></td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{p.p_kept}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PlannerPage() {
  return (
    <Suspense fallback={<div data-theme="premium" className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>}>
      <PlannerInner />
    </Suspense>
  );
}
