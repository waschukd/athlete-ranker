"use client";

import { useState } from "react";
import { Upload, Loader2, Check, X, Sparkles, AlertTriangle, Calendar, Users } from "lucide-react";

// Bulk association onboarding: drop the whole-association schedule and/or roster,
// review the divisions it detected, confirm/map, and create every category at once.
export default function BulkOnboard({ orgId, existingCategories = [], onDone, onClose }) {
  const [phase, setPhase] = useState("upload"); // upload | parsing | review | committing | done
  const [schedFile, setSchedFile] = useState(null);
  const [rosterFile, setRosterFile] = useState(null);
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState(null);
  const [decisions, setDecisions] = useState({}); // key → { action, categoryId, name }
  const [rosterMap, setRosterMap] = useState({});  // source division value → target division key ("" = skip)
  const [summary, setSummary] = useState(null);

  const parse = async () => {
    if (!schedFile && !rosterFile) { setError("Add a schedule and/or roster file first."); return; }
    setPhase("parsing"); setError("");
    try {
      const fd = new FormData();
      if (schedFile) fd.append("schedule", schedFile);
      if (rosterFile) fd.append("roster", rosterFile);
      const res = await fetch(`/api/organizations/${orgId}/bulk-onboard/parse`, { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) { setError((d.error || "Couldn't read those files.") + (d.detail ? ` — ${d.detail}` : "")); setPhase("upload"); return; }
      setParsed(d);
      // Default every detected division to "create", pre-matched to an existing category by name.
      const init = {};
      for (const div of d.divisions) {
        const match = (d.existing || []).find(c => c.name.toLowerCase() === div.key.toLowerCase());
        init[div.key] = match ? { action: "existing", categoryId: match.id, name: div.key } : { action: "create", name: div.key };
      }
      setDecisions(init);
      // Pre-fill roster mapping from each source value's canonical suggestion.
      const rmap = {};
      for (const rd of d.rosterDivisions || []) rmap[rd.value] = rd.suggestedKey || "";
      setRosterMap(rmap);
      setPhase("review");
    } catch { setError("Upload failed. Please try again."); setPhase("upload"); }
  };

  const setDec = (key, patch) => setDecisions(s => ({ ...s, [key]: { ...s[key], ...patch } }));

  const commit = async () => {
    setPhase("committing"); setError("");
    try {
      const decisionList = (parsed.divisions || []).map(d => ({ key: d.key, ...(decisions[d.key] || { action: "skip" }) }));
      // Apply the admin's roster mapping: each athlete's category = the target chosen
      // for its source division value (dropped if unmapped/skipped).
      const athletesMapped = (parsed.athletes || [])
        .map(a => ({ ...a, divisionKey: (rosterMap[a.rawDivision] ?? a.divisionKey) || null }))
        .filter(a => a.divisionKey);
      const res = await fetch(`/api/organizations/${orgId}/bulk-onboard/commit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions: decisionList, scheduleRows: parsed.scheduleRows, athletes: athletesMapped }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Import failed."); setPhase("review"); return; }
      setSummary(d); setPhase("done"); onDone?.();
    } catch { setError("Import failed."); setPhase("review"); }
  };

  const createCount = Object.values(decisions).filter(d => d.action === "create").length;
  const existingCount = Object.values(decisions).filter(d => d.action === "existing").length;
  const unmatched = parsed?.unmatched || { schedule: 0, athletes: 0 };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="w-full max-w-3xl my-10 bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2"><Sparkles size={18} className="text-accent" /><h2 className="font-display font-bold text-ink text-lg">Set up entire association</h2></div>
          <button onClick={() => onClose?.()} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-6">
          {(phase === "upload" || phase === "parsing") && (
            <>
              <p className="text-sm text-gray-500 mb-3">Drop your schedule and/or athlete files. Cleanest is our template (a Division column, read instantly and free); a messy association export also works via AI reading.</p>
              <div className="flex items-center gap-3 mb-4 text-xs">
                <span className="text-gray-400">Templates:</span>
                <a href="/api/templates?type=bulk-schedule" download className="px-3 py-1.5 bg-[#e8f0fd] text-[#0b5cd6] rounded-lg font-medium hover:bg-[#dbe8fc]">↓ Schedule</a>
                <a href="/api/templates?type=bulk-roster" download className="px-3 py-1.5 bg-[#e8f0fd] text-[#0b5cd6] rounded-lg font-medium hover:bg-[#dbe8fc]">↓ Roster</a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <label className="flex flex-col items-center gap-1.5 border-2 border-dashed border-gray-300 rounded-xl py-6 px-4 cursor-pointer hover:border-accent/50 text-center">
                  <Calendar size={22} className="text-gray-400" />
                  <span className="text-sm font-semibold text-ink">{schedFile ? schedFile.name : "Schedule file"}</span>
                  <span className="text-xs text-gray-400">CSV or Excel — any format</span>
                  <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => setSchedFile(e.target.files?.[0] || null)} />
                </label>
                <label className="flex flex-col items-center gap-1.5 border-2 border-dashed border-gray-300 rounded-xl py-6 px-4 cursor-pointer hover:border-accent/50 text-center">
                  <Users size={22} className="text-gray-400" />
                  <span className="text-sm font-semibold text-ink">{rosterFile ? rosterFile.name : "Athlete file"}</span>
                  <span className="text-xs text-gray-400">CSV with a division column</span>
                  <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => setRosterFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
              <button onClick={parse} disabled={phase === "parsing" || (!schedFile && !rosterFile)} className="w-full py-3 bg-accent text-white rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-2">
                {phase === "parsing" ? <><Loader2 size={16} className="animate-spin" /> Detecting divisions…</> : <><Sparkles size={16} /> Detect divisions</>}
              </button>
            </>
          )}

          {phase === "review" && parsed && parsed.divisions.length === 0 && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
                <span>No divisions detected. The reader returned <b>{(parsed.scheduleRows || []).length}</b> schedule row{(parsed.scheduleRows || []).length === 1 ? "" : "s"} and <b>{(parsed.athletes || []).length}</b> athlete row{(parsed.athletes || []).length === 1 ? "" : "s"}. Sample below — send it to support if it looks wrong.</span>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto text-xs">
                <table className="w-full">
                  <thead className="bg-gray-50 text-gray-500 uppercase"><tr><th className="text-left px-3 py-2">raw_label</th><th className="text-left px-3 py-2">age</th><th className="text-left px-3 py-2">division</th><th className="text-left px-3 py-2">key</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {(parsed.scheduleRows || []).slice(0, 12).map((r, i) => (
                      <tr key={i}><td className="px-3 py-1.5">{r.raw_label || "—"}</td><td className="px-3 py-1.5">{r.age_group || "—"}</td><td className="px-3 py-1.5">{r.division || "—"}</td><td className="px-3 py-1.5">{r.divisionKey || "(none)"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.debug?.aiRaw && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-500">Show raw AI response (for support)</summary>
                  <pre className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded-lg overflow-x-auto whitespace-pre-wrap text-[11px] text-gray-600">{parsed.debug.aiRaw}</pre>
                </details>
              )}
              <button onClick={() => setPhase("upload")} className="text-sm text-accent hover:underline">← Try a different file</button>
            </div>
          )}
          {phase === "review" && parsed && parsed.divisions.length > 0 && (
            <>
              <p className="text-sm text-gray-500 mb-4">Found <b className="text-ink">{parsed.divisions.length}</b> division{parsed.divisions.length === 1 ? "" : "s"}. Review below — rename, route into an existing category, or skip. Then create everything.</p>
              <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto mb-3">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr><th className="text-left px-4 py-2">Category name</th><th className="px-3 py-2">Schedule</th><th className="px-3 py-2">Athletes</th><th className="text-left px-4 py-2">Action</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsed.divisions.map(div => {
                      const dec = decisions[div.key] || {};
                      return (
                        <tr key={div.key}>
                          <td className="px-4 py-2.5">
                            <input value={dec.name ?? div.key} onChange={e => setDec(div.key, { name: e.target.value })} disabled={dec.action === "skip"} className="w-40 px-2 py-1 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-400" />
                          </td>
                          <td className="px-3 py-2.5 text-center text-gray-600 tabular-nums">{div.scheduleCount || "—"}</td>
                          <td className="px-3 py-2.5 text-center text-gray-600 tabular-nums">{div.athleteCount || "—"}</td>
                          <td className="px-4 py-2.5">
                            <select value={dec.action === "existing" ? `existing:${dec.categoryId}` : dec.action} onChange={e => {
                              const v = e.target.value;
                              if (v.startsWith("existing:")) setDec(div.key, { action: "existing", categoryId: parseInt(v.split(":")[1]) });
                              else setDec(div.key, { action: v });
                            }} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                              <option value="create">Create new</option>
                              {(parsed.existing || []).map(c => <option key={c.id} value={`existing:${c.id}`}>Use “{c.name}”</option>)}
                              <option value="skip">Skip</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(parsed.rosterDivisions || []).length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-700">Athletes — map each group in your file to a category</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{parsed.rosterHasDivisionColumn ? "From your file's division/team column." : "No division column found — assign each group to a category."}</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-white text-xs text-gray-500 uppercase"><tr><th className="text-left px-4 py-2">Your value</th><th className="px-3 py-2">Athletes</th><th className="text-left px-4 py-2">→ Category</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {(parsed.rosterDivisions || []).map(rd => (
                        <tr key={rd.value} className={!rosterMap[rd.value] ? "bg-amber-50/40" : ""}>
                          <td className="px-4 py-2 text-ink">{rd.value}</td>
                          <td className="px-3 py-2 text-center text-gray-600 tabular-nums">{rd.count}</td>
                          <td className="px-4 py-2">
                            <select value={rosterMap[rd.value] || ""} onChange={e => setRosterMap(m => ({ ...m, [rd.value]: e.target.value }))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white min-w-[9rem]">
                              <option value="">— skip —</option>
                              {parsed.divisions.map(dv => <option key={dv.key} value={dv.key}>{decisions[dv.key]?.name || dv.key}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(unmatched.schedule > 0 || unmatched.athletes > 0) && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{unmatched.schedule} schedule row{unmatched.schedule === 1 ? "" : "s"} and {unmatched.athletes} athlete{unmatched.athletes === 1 ? "" : "s"} had no clear division and won't be imported. You can add them per-category afterward.</span>
                </div>
              )}
              {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
              <div className="flex items-center justify-between">
                <button onClick={() => setPhase("upload")} className="text-sm text-gray-500 hover:text-gray-700">← Different files</button>
                <button onClick={commit} disabled={createCount + existingCount === 0} className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-40">
                  <Upload size={15} /> Create {createCount} + fill {existingCount}
                </button>
              </div>
            </>
          )}

          {phase === "committing" && <div className="py-10 text-center text-gray-500 text-sm inline-flex items-center gap-2 w-full justify-center"><Loader2 size={18} className="animate-spin" /> Creating your categories…</div>}

          {phase === "done" && summary && (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4"><Check size={26} className="text-green-600" /></div>
              <h3 className="font-display font-bold text-ink text-xl mb-2">Your association is set up</h3>
              <p className="text-sm text-gray-600 mb-5">
                {summary.categoriesCreated} categor{summary.categoriesCreated === 1 ? "y" : "ies"} created{summary.categoriesReused ? `, ${summary.categoriesReused} filled` : ""} · {summary.athletesImported} athletes · {summary.scheduleImported} schedule slots.
              </p>
              <button onClick={() => onClose?.()} className="px-6 py-2.5 bg-accent text-white rounded-xl font-semibold text-sm hover:opacity-90">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
