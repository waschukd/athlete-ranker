"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Shield, Check, Loader2 } from "lucide-react";

// Edits the org-level goalie template (scale, increment, sessions, skills +
// scrimmage categories, players_eval_goalies) and saves via
// PUT /api/organizations/[orgId]/goalie-template, which materializes it into
// every affected category. Self-contained: fetches its own data.
//
// Props: orgId, context ("association" | "sp"), onSaved?()
export default function GoalieTemplateEditor({ orgId, context = "association", onSaved }) {
  const [t, setT] = useState(null);
  const [editable, setEditable] = useState(true);
  const [mode, setMode] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/organizations/${orgId}/goalie-template`).then(r => r.json()).then(d => {
      setT(d.template); setEditable(d.editable !== false); setMode(d.mode || null);
    }).catch(() => {});
  }, [orgId]);

  if (!t) return <div className="py-8 text-center text-sm text-gray-400">Loading goalie template…</div>;

  const upd = (patch) => setT(prev => ({ ...prev, ...patch }));
  const listOp = {
    add: (key) => upd({ [key]: [...(t[key] || []), { name: "" }] }),
    rm: (key, i) => upd({ [key]: t[key].filter((_, idx) => idx !== i) }),
    set: (key, i, v) => upd({ [key]: t[key].map((c, idx) => idx === i ? { ...c, name: v } : c) }),
  };
  const sessOp = {
    add: () => upd({ sessions: [...(t.sessions || []), { session_number: (t.sessions?.length || 0) + 1, name: `Goalie Session ${(t.sessions?.length || 0) + 1}`, session_type: "scrimmage", weight_percentage: 0 }] }),
    rm: (i) => upd({ sessions: t.sessions.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, session_number: idx + 1 })) }),
    set: (i, patch) => upd({ sessions: t.sessions.map((s, idx) => idx === i ? { ...s, ...patch } : s) }),
  };
  const sessTotal = (t.sessions || []).reduce((sum, s) => sum + Number(s.weight_percentage || 0), 0);

  const save = async () => {
    if (Math.round(sessTotal) !== 100) { setMsg({ type: "err", text: "Session weights must total 100%." }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await fetch(`/api/organizations/${orgId}/goalie-template`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: t }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Save failed");
      setMsg({ type: "ok", text: `Saved — applied to ${d.applied} categor${d.applied === 1 ? "y" : "ies"}.` });
      onSaved?.();
    } catch (e) { setMsg({ type: "err", text: e.message }); }
    setSaving(false);
  };

  if (!editable) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-2.5">
        <Shield size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-800">Your goalie service provider controls the goalie template (scale, skills, and sessions). It applies to all your goalie categories automatically.</p>
      </div>
    );
  }

  const CatList = ({ label, hint, keyName, chipClass }) => (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</label>
        <button onClick={() => listOp.add(keyName)} className="inline-flex items-center gap-1 text-xs text-accent hover:opacity-70 font-medium"><Plus size={12} /> Add</button>
      </div>
      {hint && <p className="text-xs text-gray-400 mb-2">{hint}</p>}
      <div className="space-y-2">
        {(t[keyName] || []).map((c, i) => (
          <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2">
            <input type="text" value={c.name} onChange={e => listOp.set(keyName, i, e.target.value)} className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white" placeholder="Name" />
            <button onClick={() => listOp.rm(keyName, i)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {context === "sp" && <p className="text-xs text-gray-500">This is your standard goalie template. Saving pushes it to every association you evaluate goalies for.</p>}

      <div className="flex gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Scale</label>
          <select value={t.scale} onChange={e => upd({ scale: Number(e.target.value) })} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
            <option value={5}>Out of 5</option><option value={10}>Out of 10</option><option value={100}>Out of 100</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Increment</label>
          <select value={t.increment} onChange={e => upd({ increment: Number(e.target.value) })} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
            <option value={0.5}>0.5</option><option value={1}>1.0</option>
          </select>
        </div>
      </div>

      {context === "association" && (
        <div className="flex items-center justify-between gap-3 border border-gray-200 rounded-xl p-3">
          <div>
            <label className="text-sm font-semibold text-gray-700">Let skater evaluators also score goalies</label>
            <p className="text-xs text-gray-500 mt-0.5">Off by default. Turn on only if you don't have dedicated goalie evaluators.</p>
          </div>
          <button type="button" onClick={() => upd({ players_eval_goalies: !t.players_eval_goalies })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${t.players_eval_goalies ? "bg-accent" : "bg-gray-200"}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${t.players_eval_goalies ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Goalie Sessions</label>
          <button onClick={sessOp.add} className="inline-flex items-center gap-1 text-xs text-accent hover:opacity-70 font-medium"><Plus size={12} /> Add session</button>
        </div>
        <div className="space-y-2">
          {(t.sessions || []).map((s, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2">
              <input type="text" value={s.name} onChange={e => sessOp.set(i, { name: e.target.value })} className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white" placeholder="Session name" />
              <select value={s.session_type} onChange={e => sessOp.set(i, { session_type: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
                <option value="goalie_skills">Goalie Skills</option><option value="scrimmage">Scrimmage</option>
              </select>
              <input type="number" min="0" max="100" value={s.weight_percentage} onChange={e => sessOp.set(i, { weight_percentage: Number(e.target.value) })} className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center bg-white" />
              <span className="text-xs text-gray-400">%</span>
              <button onClick={() => sessOp.rm(i)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <div className={`text-xs font-semibold text-right mt-1.5 ${Math.round(sessTotal) === 100 ? "text-green-600" : "text-red-500"}`}>Total: {sessTotal}%</div>
      </div>

      <CatList label="Goalie skills drills · session 1" hint="Like testing for skaters — marked on points, higher is better." keyName="skills_categories" />
      <CatList label="Goalie scrimmage categories" keyName="categories" />

      {msg && <p className={`text-sm ${msg.type === "ok" ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>}
      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-accent to-[#3b82f6] text-white rounded-xl font-semibold text-sm hover:shadow-lg disabled:opacity-50">
          {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Check size={15} /> Save goalie template</>}
        </button>
      </div>
    </div>
  );
}
