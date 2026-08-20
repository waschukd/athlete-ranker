"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Star, Users, CalendarDays, Plus, Trash2, MapPin, Clock } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

// A single goalie-only category's own roster + schedule management, for a Goalie
// Service Provider running everything self-serve. Talks to the exact same
// category APIs the association's skater tools use (categories/[catId]/athletes,
// categories/[catId]/schedule) -- those routes already authorize a connected
// goalie_service_provider_admin via authorizeCategoryAccess, so nothing new was
// needed there. This page is the only thing that was missing.
function Inner() {
  const params = useParams();
  const sp = useSearchParams();
  const catId = params.catId;
  const orgParam = sp.get("org");
  const [theme, toggleTheme] = useTheme();
  const [tab, setTab] = useState("roster");
  const [setupData, setSetupData] = useState(null);

  const withOrg = useCallback((path) => (orgParam ? `${path}${path.includes("?") ? "&" : "?"}org=${orgParam}` : path), [orgParam]);

  const loadSetup = useCallback(() => {
    fetch(`/api/categories/${catId}/setup`).then(r => r.json()).then(setSetupData).catch(() => setSetupData({ error: "Failed to load" }));
  }, [catId]);
  useEffect(() => { loadSetup(); }, [loadSetup]);

  const category = setupData?.category;
  const goalieSessions = category?.goalie_config?.sessions || [];

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <a href={withOrg("/goalie-provider/dashboard?tab=categories")} className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 mb-1">
              <ArrowLeft size={13} /> Goalie Service Provider
            </a>
            <h1 className="font-display font-black tracking-tight text-ink text-3xl sm:text-4xl leading-none flex items-center gap-3">
              <Star size={26} className="text-accent" /> {category?.name || "Category"}
            </h1>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto">
          {[{ id: "roster", label: "Roster" }, { id: "schedule", label: "Schedule" }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.id ? "border-accent text-accent" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {setupData?.error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{setupData.error}</div>
        ) : tab === "roster" ? (
          <RosterTab catId={catId} />
        ) : (
          <ScheduleTab catId={catId} goalieSessions={goalieSessions} />
        )}
      </div>
    </div>
  );
}

function RosterTab({ catId }) {
  const [athletes, setAthletes] = useState(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", external_id: "", birth_year: "", parent_email: "" });
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    fetch(`/api/categories/${catId}/athletes`).then(r => r.json()).then(d => setAthletes(d.athletes || [])).catch(() => setAthletes([]));
  }, [catId]);
  useEffect(() => { load(); }, [load]);

  const addOne = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/categories/${catId}/athletes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, position: "goalie" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) setMsg({ type: "error", text: d.error || "Couldn't add goalie." });
      else { setForm({ first_name: "", last_name: "", external_id: "", birth_year: "", parent_email: "" }); load(); }
    } catch { setMsg({ type: "error", text: "Network error." }); }
    setBusy(false);
  };

  // Paste-CSV: "First,Last,Parent Email" or "First,Last,Parent Email,Birth Year" per line.
  const importBulk = async () => {
    const rows = bulk.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
      const [first_name, last_name, parent_email, birth_year] = line.split(",").map(s => (s || "").trim());
      return { first_name, last_name, parent_email, birth_year, position: "goalie" };
    }).filter(r => r.first_name && r.last_name);
    if (!rows.length) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/categories/${catId}/athletes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athletes: rows }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) setMsg({ type: "error", text: d.error || "Import failed." });
      else { setMsg({ type: "success", text: `Imported ${d.imported}, updated ${d.updated}, skipped ${d.skipped}.` }); setBulk(""); setShowBulk(false); load(); }
    } catch { setMsg({ type: "error", text: "Network error." }); }
    setBusy(false);
  };

  const remove = async (athleteId) => {
    if (!confirm("Remove this goalie from the roster?")) return;
    setBusy(true);
    try { await fetch(`/api/categories/${catId}/athletes?athlete_id=${athleteId}`, { method: "DELETE" }); load(); } catch {}
    setBusy(false);
  };

  const list = athletes || [];
  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3"><Users size={15} className="text-accent" /> Add a goalie</h3>
        <div className="flex items-end gap-2 flex-wrap">
          <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">First name</label>
            <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-accent/40" /></div>
          <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">Last name</label>
            <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-accent/40" /></div>
          <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">HC# / ID</label>
            <input value={form.external_id} onChange={e => setForm(f => ({ ...f, external_id: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-accent/40" /></div>
          <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">Birth year</label>
            <input value={form.birth_year} onChange={e => setForm(f => ({ ...f, birth_year: e.target.value }))} type="number" placeholder="2014" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-accent/40" /></div>
          <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">Parent email</label>
            <input value={form.parent_email} onChange={e => setForm(f => ({ ...f, parent_email: e.target.value }))} type="email" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-accent/40" /></div>
          <button onClick={addOne} disabled={busy || !form.first_name.trim() || !form.last_name.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:opacity-90">
            <Plus size={14} /> Add
          </button>
          <button onClick={() => setShowBulk(s => !s)} className="text-xs px-3 py-2 text-accent font-medium hover:underline">{showBulk ? "Hide bulk import" : "Bulk import (paste CSV)"}</button>
        </div>
        {showBulk && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">One goalie per line: <code className="bg-gray-100 px-1 rounded">First,Last,Parent Email,Birth Year</code> (email and birth year optional).</p>
            <textarea value={bulk} onChange={e => setBulk(e.target.value)} rows={5} placeholder="Owen,Vance,parent@email.com,2013"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/40" />
            <button onClick={importBulk} disabled={busy || !bulk.trim()} className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:opacity-90">
              <Plus size={14} /> Import
            </button>
          </div>
        )}
        {msg && <p className={`text-xs font-medium mt-2 ${msg.type === "success" ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Roster ({list.length})</h3></div>
        {athletes === null ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : list.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">No goalies yet — add one above.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {list.map(a => (
              <div key={a.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-ink">{a.first_name} {a.last_name}</div>
                  <div className="text-xs text-gray-400">{a.external_id ? `${a.external_id} · ` : ""}{a.birth_year || ""}{a.parent_email ? ` · ${a.parent_email}` : ""}</div>
                </div>
                <button onClick={() => remove(a.id)} disabled={busy} className="p-1.5 text-gray-400 hover:text-red-500 rounded" title="Remove"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleTab({ catId, goalieSessions }) {
  const [schedule, setSchedule] = useState(null);
  const [form, setForm] = useState({ session_number: goalieSessions[0]?.session_number || 1, scheduled_date: "", start_time: "", end_time: "", location: "", goalie_evaluators_required: 1 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    fetch(`/api/categories/${catId}/schedule`).then(r => r.json()).then(d => setSchedule(d.schedule || [])).catch(() => setSchedule([]));
  }, [catId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.scheduled_date || !form.session_number) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/categories/${catId}/schedule`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        // evaluators_required explicitly 0 -- this is a goalie-only category, there
        // are no skater evaluators to staff, only goalie_evaluators_required.
        body: JSON.stringify({ add: { ...form, evaluators_required: 0 } }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) setMsg({ type: "error", text: d.error || "Couldn't add session." });
      else { setForm(f => ({ ...f, scheduled_date: "", start_time: "", end_time: "", location: "" })); load(); }
    } catch { setMsg({ type: "error", text: "Network error." }); }
    setBusy(false);
  };

  const remove = async (id) => {
    if (!confirm("Cancel this session?")) return;
    setBusy(true);
    try { await fetch(`/api/categories/${catId}/schedule?id=${id}`, { method: "DELETE" }); load(); } catch {}
    setBusy(false);
  };

  const list = schedule || [];
  const sessionName = (n) => goalieSessions.find(s => s.session_number === n)?.name || `Session ${n}`;
  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3"><CalendarDays size={15} className="text-accent" /> Add a session</h3>
        <div className="flex items-end gap-2 flex-wrap">
          <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">Session</label>
            <select value={form.session_number} onChange={e => setForm(f => ({ ...f, session_number: parseInt(e.target.value) }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40">
              {goalieSessions.length ? goalieSessions.map(s => <option key={s.session_number} value={s.session_number}>{s.name}</option>) : <option value={1}>Session 1</option>}
            </select></div>
          <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">Date</label>
            <input value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" /></div>
          <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">Start</label>
            <input value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} type="time" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" /></div>
          <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">End</label>
            <input value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} type="time" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" /></div>
          <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">Location</label>
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Rink name" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-accent/40" /></div>
          <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">Goalie evaluators</label>
            <input value={form.goalie_evaluators_required} onChange={e => setForm(f => ({ ...f, goalie_evaluators_required: parseInt(e.target.value) || 0 }))} type="number" min="0" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-16 focus:outline-none focus:ring-2 focus:ring-accent/40" /></div>
          <button onClick={add} disabled={busy || !form.scheduled_date} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:opacity-90">
            <Plus size={14} /> Add
          </button>
        </div>
        {msg && <p className={`text-xs font-medium mt-2 ${msg.type === "success" ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Scheduled sessions ({list.length})</h3></div>
        {schedule === null ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : list.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">No sessions scheduled yet — add one above.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {list.map(s => (
              <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-medium text-ink">{sessionName(s.session_number)}</div>
                  <div className="text-xs text-gray-400 flex items-center gap-3 flex-wrap mt-0.5">
                    {s.scheduled_date && <span>{new Date(String(s.scheduled_date).slice(0, 10) + "T00:00:00").toLocaleDateString()}</span>}
                    {s.start_time && <span className="flex items-center gap-1"><Clock size={11} />{s.start_time}{s.end_time ? `–${s.end_time}` : ""}</span>}
                    {s.location && <span className="flex items-center gap-1"><MapPin size={11} />{s.location}</span>}
                    {s.checkin_code && <span className="font-mono">{s.checkin_code}</span>}
                  </div>
                </div>
                <button onClick={() => remove(s.id)} disabled={busy} className="p-1.5 text-gray-400 hover:text-red-500 rounded" title="Cancel session"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GoalieCategoryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" data-theme="premium" />}>
      <Inner />
    </Suspense>
  );
}
