"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, MapPin, Plus, X } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

const AREAS = ["Skating", "Puck Skills", "Hockey IQ", "Effort & Compete", "Goaltending", "Strength & Conditioning"];

function ProvidersInner() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org");
  const [theme, toggleTheme] = useTheme();
  const [providers, setProviders] = useState(null);
  const [form, setForm] = useState({ area: AREAS[0], name: "", blurb: "", contact: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = () => fetch(`/api/training-providers?org=${orgId}`).then(r => r.json()).then(d => {
    if (d.error) { setErr(d.error); setProviders([]); } else setProviders(d.providers || []);
  });
  useEffect(() => { if (orgId) load(); }, [orgId]);

  const add = async () => {
    if (!form.name.trim()) return;
    setSaving(true); setErr("");
    const res = await fetch("/api/training-providers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id: Number(orgId), ...form }),
    });
    const d = await res.json();
    if (d.error) setErr(d.error); else { setForm({ ...form, name: "", blurb: "", contact: "" }); await load(); }
    setSaving(false);
  };
  const remove = async (id) => {
    await fetch(`/api/training-providers?id=${id}`, { method: "DELETE" });
    await load();
  };

  const byArea = {};
  for (const p of (providers || [])) (byArea[p.area] ||= []).push(p);

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <button onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 mb-1">
              <ArrowLeft size={13} /> Association · Recommended training
            </button>
            <h1 className="font-display font-black tracking-tight text-ink text-3xl sm:text-4xl leading-none flex items-center gap-3">
              <MapPin size={26} className="text-accent" /> Recommended Providers
            </h1>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {!orgId && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">Add <code>?org=&lt;your association id&gt;</code> to the URL.</div>}
        {err && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{err}</div>}

        {/* Add form */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Add a provider</h3>
          <p className="text-xs text-gray-400 mb-4">These appear on parents' reports under "Where to put in the work", grouped by area. Listed at your recommendation — Sideline Star doesn't endorse them.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <select value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-accent">
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Provider name" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-accent" />
            <input value={form.blurb} onChange={e => setForm({ ...form, blurb: e.target.value })} placeholder="Short description (optional)" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-accent sm:col-span-2" />
            <input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="Website or phone (optional)" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-accent sm:col-span-2" />
          </div>
          <button onClick={add} disabled={saving || !form.name.trim()} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:shadow-md disabled:opacity-50">
            <Plus size={14} /> {saving ? "Adding…" : "Add provider"}
          </button>
        </div>

        {/* Current list */}
        {providers === null ? (
          <div className="text-center text-gray-400 text-sm py-8">Loading…</div>
        ) : providers.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-400">No providers yet. Add a few above and they'll show on reports.</div>
        ) : (
          Object.entries(byArea).map(([area, list]) => (
            <div key={area} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wide">{area}</div>
              <div className="divide-y divide-gray-50">
                {list.map(p => (
                  <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{p.name}</div>
                      {p.blurb && <div className="text-xs text-gray-500">{p.blurb}</div>}
                      {p.contact && <div className="text-xs text-accent">{p.contact}</div>}
                    </div>
                    <button onClick={() => remove(p.id)} className="text-gray-300 hover:text-red-500 p-1.5" title="Remove"><X size={15} /></button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function ProvidersPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium-light"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>}>
      <ProvidersInner />
    </Suspense>
  );
}
