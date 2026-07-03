"use client";

import { useState, useMemo, useRef } from "react";
import { Upload, Loader2, AlertTriangle, Check, Sparkles, X } from "lucide-react";

// Drop a raw association ice schedule (any CSV/XLSX). We AI-normalize it, pre-filter
// to THIS category (age + division), let you tick rows, map each to a session, bulk-set
// evaluator counts, and import — reusing the standard schedule bulk insert.
//
// Props: catId, categoryName (for pre-filter), sessions [{session_number,name,session_type}],
//        org (SP context, optional), onImported()
const TYPE_BADGE = {
  testing: "bg-blue-100 text-blue-700", scrimmage: "bg-green-100 text-green-700",
  game: "bg-green-100 text-green-700", skills: "bg-purple-100 text-purple-700",
  goalie_skills: "bg-amber-100 text-amber-700", practice: "bg-gray-100 text-gray-600",
  other: "bg-gray-100 text-gray-500",
};
const ageNum = (s) => { const m = String(s || "").match(/\b(?:u|under)\s*(\d{1,2})\b/i); return m ? parseInt(m[1], 10) : null; };
const divNorm = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");

function defaultSessionFor(type, sessions) {
  const byType = (t) => sessions.find(s => s.session_type === t)?.session_number;
  if (type === "testing") return byType("testing") ?? sessions[0]?.session_number;
  if (type === "goalie_skills") return byType("goalie_skills") ?? byType("testing") ?? sessions[0]?.session_number;
  if (type === "skills") return byType("skills") ?? byType("testing") ?? sessions[0]?.session_number;
  // game / scrimmage / practice / other → first scrimmage
  return byType("scrimmage") ?? sessions.find(s => s.session_type !== "testing")?.session_number ?? sessions[0]?.session_number;
}

export default function SmartScheduleImport({ catId, categoryName, sessions = [], org, onImported }) {
  const [phase, setPhase] = useState("idle"); // idle | parsing | review | importing | done
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);        // normalized rows + local {id, session_number, selected}
  const [showAll, setShowAll] = useState(false);
  const [playerEval, setPlayerEval] = useState(4);
  const [goalieEval, setGoalieEval] = useState(0);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const catAge = ageNum(categoryName);
  const catDiv = divNorm(categoryName).replace(/^u\d+/, "");

  const matchesCategory = (r) => {
    if (catAge == null) return true;
    if (ageNum(r.age_group) !== catAge) return false;
    if (catDiv && r.division) { const d = divNorm(r.division); if (d && !d.includes(catDiv) && !catDiv.includes(d)) return false; }
    return true;
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhase("parsing"); setError(""); setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (catId) fd.append("catId", String(catId));
      if (org) fd.append("org", String(org));
      const res = await fetch("/api/schedule-import/parse", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Couldn't read that file."); setPhase("idle"); return; }
      const parsed = (d.rows || []).map((r, i) => ({
        ...r, id: i,
        session_number: defaultSessionFor(r.session_type, sessions),
        selected: r.complete && (catAge == null || matchesCategory(r)),
      }));
      setRows(parsed);
      setShowAll(catAge == null || !parsed.some(r => matchesCategory(r)));
      setPhase("review");
    } catch { setError("Import failed. Please try again."); setPhase("idle"); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const visible = useMemo(() => rows.filter(r => showAll || matchesCategory(r)), [rows, showAll]); // eslint-disable-line
  const selectedCount = visible.filter(r => r.selected).length;
  const set = (id, patch) => setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const toggleAll = (on) => setRows(rs => rs.map(r => (visible.includes(r) && r.complete ? { ...r, selected: on } : r)));

  const doImport = async () => {
    const picks = rows.filter(r => r.selected && r.complete);
    if (!picks.length) return;
    setPhase("importing");
    // group_number: sequential within (session_number, date) ordered by start_time
    const byKey = {};
    const schedule = picks
      .slice().sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.start_time || "").localeCompare(b.start_time || ""))
      .map(r => {
        const key = `${r.session_number}|${r.date}`;
        byKey[key] = (byKey[key] || 0) + 1;
        const sess = sessions.find(s => s.session_number === r.session_number);
        const isTesting = sess?.session_type === "testing";
        const isGoalieSkills = sess?.session_type === "goalie_skills";
        return {
          session_number: r.session_number,
          group_number: byKey[key],
          scheduled_date: r.date,
          start_time: r.start_time || "",
          end_time: r.end_time || "",
          location: r.location || "",
          type: sess?.session_type || "scrimmage",
          evaluators_required: isTesting ? 0 : (parseInt(playerEval) || 0),
          goalie_evaluators_required: isGoalieSkills ? (parseInt(goalieEval) || 2) : (parseInt(goalieEval) || 0),
        };
      });
    try {
      const res = await fetch(`/api/categories/${catId}/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule }) });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Import failed."); setPhase("review"); return; }
      setResult({ count: schedule.length }); setPhase("done"); onImported?.();
    } catch { setError("Import failed."); setPhase("review"); }
  };

  const reset = () => { setPhase("idle"); setRows([]); setError(""); setResult(null); };

  if (phase === "done") {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-start gap-3">
        <Check size={18} className="text-green-600 mt-0.5" />
        <div>
          <div className="font-semibold text-green-800">Imported {result?.count} session{result?.count === 1 ? "" : "s"}.</div>
          <button onClick={reset} className="mt-2 text-sm text-accent hover:underline font-medium">Import another file</button>
        </div>
      </div>
    );
  }

  if (phase === "idle" || phase === "parsing") {
    return (
      <div>
        <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-2xl py-8 px-6 text-center transition-colors ${phase === "parsing" ? "opacity-60" : "cursor-pointer hover:border-accent/50 hover:bg-accent-soft/30"}`}>
          {phase === "parsing" ? <Loader2 size={26} className="text-accent animate-spin" /> : <Sparkles size={26} className="text-accent" />}
          <span className="text-sm font-semibold text-ink">{phase === "parsing" ? "Reading your schedule…" : "Smart import — drop the association's file as-is"}</span>
          <span className="text-xs text-gray-400">{phase === "parsing" ? "AI is pulling out the sessions" : "Any messy CSV or Excel — we'll extract the sessions for this category."}</span>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFile} disabled={phase === "parsing"} />
        </label>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  // review
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-gray-600">
          Found <b className="text-ink">{rows.length}</b> sessions{catAge != null && !showAll ? <> · showing <b className="text-ink">{visible.length}</b> for {categoryName}</> : null}
        </div>
        <div className="flex items-center gap-3">
          {catAge != null && <button onClick={() => setShowAll(s => !s)} className="text-xs text-accent hover:underline font-medium">{showAll ? `Show only ${categoryName}` : "Show all age groups"}</button>}
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-700 inline-flex items-center gap-1"><X size={13} /> Start over</button>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        <span className="text-xs font-medium text-gray-500">Defaults for scrimmage rows:</span>
        <label className="flex items-center gap-1.5 text-sm text-gray-700">Player eval <input type="number" min="0" value={playerEval} onChange={e => setPlayerEval(e.target.value)} className="w-14 px-2 py-1 border border-gray-200 rounded-lg text-center text-sm" /></label>
        <label className="flex items-center gap-1.5 text-sm text-gray-700">Goalie eval <input type="number" min="0" value={goalieEval} onChange={e => setGoalieEval(e.target.value)} className="w-14 px-2 py-1 border border-gray-200 rounded-lg text-center text-sm" /></label>
        <span className="text-[11px] text-gray-400">Testing sessions always take 0 player evaluators.</span>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-3 py-2 text-left"><input type="checkbox" checked={selectedCount > 0 && selectedCount === visible.filter(r => r.complete).length} onChange={e => toggleAll(e.target.checked)} /></th>
              <th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Time</th>
              <th className="px-3 py-2 text-left">Arena</th><th className="px-3 py-2 text-left">Age/Div</th>
              <th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Session</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map(r => (
              <tr key={r.id} className={!r.complete ? "bg-amber-50/40" : r.selected ? "bg-accent-soft/30" : ""}>
                <td className="px-3 py-2">{r.complete ? <input type="checkbox" checked={r.selected} onChange={e => set(r.id, { selected: e.target.checked })} /> : <AlertTriangle size={13} className="text-amber-500" />}</td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-700">{r.date || <span className="text-amber-600">— missing —</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.start_time || "—"}{r.end_time ? `–${r.end_time}` : ""}</td>
                <td className="px-3 py-2 text-gray-600 max-w-[9rem] truncate">{r.location || "—"}</td>
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{[r.age_group, r.division].filter(Boolean).join(" ") || "—"}</td>
                <td className="px-3 py-2"><span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${TYPE_BADGE[r.session_type] || TYPE_BADGE.other}`}>{r.session_type}</span></td>
                <td className="px-3 py-2">
                  <select value={r.session_number ?? ""} onChange={e => set(r.id, { session_number: parseInt(e.target.value) })} className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
                    {sessions.map(s => <option key={s.session_number} value={s.session_number}>{s.name || `Session ${s.session_number}`}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-400">No rows match {categoryName}. <button onClick={() => setShowAll(true)} className="text-accent underline">Show all</button></td></tr>}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{selectedCount} selected · rows missing a date/time can't be imported</span>
        <button onClick={doImport} disabled={phase === "importing" || selectedCount === 0} className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg font-semibold text-sm hover:opacity-90 disabled:opacity-40">
          {phase === "importing" ? <><Loader2 size={15} className="animate-spin" /> Importing…</> : <><Upload size={15} /> Import {selectedCount} session{selectedCount === 1 ? "" : "s"}</>}
        </button>
      </div>
    </div>
  );
}
