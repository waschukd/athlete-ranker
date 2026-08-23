"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Plus, Trash2 } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

// Author the shared scoring-rubric reference guide evaluators pull up while
// scoring (src/app/evaluator/score/[scheduleId]/page.jsx). Platform-wide content,
// not per-association -- deliberately a standalone page rather than a new tab
// woven into the main SP dashboard, to keep this isolated and low-risk to touch.

const SKILLS = [
  { key: "skating", label: "Skating" }, { key: "puck", label: "Puck Skills" },
  { key: "iq", label: "Hockey Sense" }, { key: "compete", label: "Effort & Compete" },
  { key: "shot", label: "Shot" }, { key: "pass", label: "Passing" },
  { key: "g_movement", label: "Goalie: Movement & Mobility" }, { key: "g_positioning", label: "Goalie: Positioning" },
  { key: "g_saves", label: "Goalie: Save Execution" }, { key: "g_reading", label: "Goalie: Reading the Play" },
];
const TIERS = ["ALL", "U7", "U9", "U11", "U13", "U15", "U18"];

export default function ScoringGuideAdminPage() {
  const [theme, toggleTheme] = useTheme();
  const [skill, setSkill] = useState("skating");
  const [tier, setTier] = useState("ALL");
  const [bands, setBands] = useState(null);
  const [form, setForm] = useState({ band_min: "", band_max: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // The GET route is category-scoped (it resolves a category's own age tier), so
  // for authoring we read straight from the DB shape via a lightweight filter --
  // reuse the same table through a tiny query param the route doesn't otherwise need.
  const load = useCallback(() => {
    fetch(`/api/scoring-rubrics/all?skill_key=${skill}&age_tier=${tier}`).then(r => r.json()).then(d => setBands(d.bands || [])).catch(() => setBands([]));
  }, [skill, tier]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const band_min = parseFloat(form.band_min), band_max = parseFloat(form.band_max);
    if (Number.isNaN(band_min) || Number.isNaN(band_max) || !form.description.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/scoring-rubrics", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_key: skill, age_tier: tier, band_min, band_max, description: form.description.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) setErr(d.error || "Couldn't save.");
      else { setForm({ band_min: "", band_max: "", description: "" }); load(); }
    } catch { setErr("Network error."); }
    setBusy(false);
  };
  const remove = async (id) => {
    if (!confirm("Delete this band?")) return;
    setBusy(true);
    try { await fetch(`/api/scoring-rubrics?id=${id}`, { method: "DELETE" }); load(); } catch {}
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <a href="/service-provider/dashboard" className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 mb-1"><ArrowLeft size={13} /> Service Provider</a>
            <h1 className="font-display font-black tracking-tight text-ink text-3xl leading-none flex items-center gap-3"><BookOpen size={26} className="text-accent" /> Scoring Guide</h1>
            <p className="text-sm text-gray-500 mt-2">What a 0 looks like, what a 10 looks like — per skill, per age tier. Evaluators pull this up while scoring.</p>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={skill} onChange={e => setSkill(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/40">
            {SKILLS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select value={tier} onChange={e => setTier(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/40">
            {TIERS.map(t => <option key={t} value={t}>{t === "ALL" ? "All ages (default)" : t}</option>)}
          </select>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Bands</h3></div>
          {bands === null ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : bands.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No bands yet for {SKILLS.find(s => s.key === skill)?.label} · {tier === "ALL" ? "all ages" : tier}. Add one below.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {bands.map(b => (
                <div key={b.id} className="px-5 py-3 flex items-start gap-3">
                  <span className="font-mono font-bold text-accent flex-shrink-0 w-14 pt-0.5">{b.band_min}–{b.band_max}</span>
                  <p className="text-sm text-gray-700 flex-1">{b.description}</p>
                  <button onClick={() => remove(b.id)} disabled={busy} className="p-1 text-gray-400 hover:text-red-500 rounded flex-shrink-0"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Add a band</h3>
          <div className="flex items-start gap-2 flex-wrap">
            <input value={form.band_min} onChange={e => setForm(f => ({ ...f, band_min: e.target.value }))} type="number" step="0.5" placeholder="Min" className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
            <input value={form.band_max} onChange={e => setForm(f => ({ ...f, band_max: e.target.value }))} type="number" step="0.5" placeholder="Max" className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="What does this range look like?" className="flex-1 min-w-[16rem] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
            <button onClick={add} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:opacity-90"><Plus size={14} /> Add</button>
          </div>
          {err && <p className="text-xs font-medium text-red-500 mt-2">{err}</p>}
        </div>
      </div>
    </div>
  );
}
