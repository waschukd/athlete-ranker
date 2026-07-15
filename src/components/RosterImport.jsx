"use client";

import { useState, useMemo, useEffect } from "react";
import { Upload, Check, AlertCircle } from "lucide-react";
import {
  parseCsv, detectMapping, summarizeDivisions, buildAthletes, suggestDivisions,
} from "@/lib/rosterImport";

// Universal roster import: drop in a raw RAMP / TeamSnap / TeamLinkt (or our own
// template) CSV, auto-maps the columns, lets you correct them, pick which
// division(s) belong to this category, preview, then import.
export default function RosterImport({ catId, categoryName, onImported }) {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState(null);
  const [nameMode, setNameMode] = useState("split"); // 'split' | 'combined'
  const [selectedDivisions, setSelectedDivisions] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setResult(null);
    try {
      const text = await file.text();
      const { headers: hdrs, rows: parsed } = parseCsv(text);
      if (!hdrs.length) { setError("Couldn't read any columns from that file."); return; }
      const m = detectMapping(hdrs);
      setFileName(file.name);
      setHeaders(hdrs);
      setRows(parsed);
      setMapping(m);
      setNameMode(m.fullName && !(m.firstName && m.lastName) ? "combined" : "split");
      setSelectedDivisions([]);
    } catch {
      setError("Failed to parse that file. Make sure it's a .csv export.");
    }
  };

  const divisions = useMemo(
    () => (mapping?.division ? summarizeDivisions(rows, mapping.division) : []),
    [rows, mapping]
  );

  // Pre-tick the division that matches this category (fallback for whole-association
  // uploads). Only fires on file load / division-column change — toggling chips won't
  // re-trigger it, so a manual choice stands.
  useEffect(() => {
    if (mapping?.division && divisions.length > 1 && categoryName) {
      const sug = suggestDivisions(categoryName, divisions.map(d => d.value));
      if (sug.length) setSelectedDivisions(sug);
    }
  }, [divisions, categoryName, mapping?.division]);

  const { athletes, skipped } = useMemo(() => {
    if (!mapping) return { athletes: [], skipped: 0 };
    const sel = selectedDivisions.length ? selectedDivisions : null;
    return buildAthletes(rows, mapping, sel);
  }, [rows, mapping, selectedDivisions]);

  const setMap = (k, v) => setMapping(m => ({ ...m, [k]: v || null }));

  const doImport = async () => {
    setImporting(true); setError("");
    try {
      const res = await fetch(`/api/categories/${catId}/athletes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athletes }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Import failed."); setImporting(false); return; }
      setResult(data);
      onImported?.(data);
    } catch {
      setError("Import failed. Please try again.");
    }
    setImporting(false);
  };

  const reset = () => { setHeaders([]); setRows([]); setMapping(null); setResult(null); setFileName(""); setSelectedDivisions([]); };

  const selectCls = "w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/30";
  const HeaderSelect = ({ label, k }) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select className={selectCls} value={mapping[k] || ""} onChange={e => setMap(k, e.target.value)}>
        <option value="">— none —</option>
        {headers.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );

  // ── Empty / upload state ──────────────────────────────────────────────────
  if (!mapping) {
    return (
      <div>
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-2xl py-10 px-6 cursor-pointer hover:border-accent/50 hover:bg-accent-soft/30 transition-colors text-center">
          <Upload size={26} className="text-gray-400" />
          <span className="text-sm font-semibold text-ink">Upload a roster CSV</span>
          <span className="text-xs text-gray-400">RAMP, TeamSnap, TeamLinkt, or our template — we'll map the columns for you.</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        </label>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  // ── Result state ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-start gap-3">
        <Check size={18} className="text-green-600 mt-0.5" />
        <div>
          <div className="font-semibold text-green-800">Imported {result.imported ?? 0} athlete{(result.imported ?? 0) === 1 ? "" : "s"}{result.updated ? `, updated ${result.updated}` : ""}{result.skipped ? `, skipped ${result.skipped}` : ""}.</div>
          {Array.isArray(result.errors) && result.errors.length > 0 && (
            <div className="mt-2 text-xs text-amber-700">
              <div className="font-semibold">{result.errors.length} row{result.errors.length === 1 ? "" : "s"} couldn't be saved:</div>
              <ul className="list-disc ml-4 mt-0.5 max-h-32 overflow-y-auto">
                {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          <button onClick={reset} className="mt-2 text-sm text-accent hover:underline font-medium">Import another file</button>
        </div>
      </div>
    );
  }

  // ── Mapping + preview state ───────────────────────────────────────────────
  const preview = athletes.slice(0, 8);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm text-gray-500"><b className="text-ink">{fileName}</b> · {rows.length} rows</span>
        <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-700">Choose a different file</button>
      </div>

      {/* Column mapping */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-display font-bold text-ink text-sm">Map columns</h4>
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs">
            <button onClick={() => setNameMode("split")} className={`px-2.5 py-1 rounded-md font-medium ${nameMode === "split" ? "bg-white text-ink shadow-sm" : "text-gray-500"}`}>First + Last</button>
            <button onClick={() => setNameMode("combined")} className={`px-2.5 py-1 rounded-md font-medium ${nameMode === "combined" ? "bg-white text-ink shadow-sm" : "text-gray-500"}`}>Combined name</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {nameMode === "split" ? (
            <>
              <HeaderSelect label="First name *" k="firstName" />
              <HeaderSelect label="Last name *" k="lastName" />
            </>
          ) : (
            <HeaderSelect label="Full name * (we'll split it)" k="fullName" />
          )}
          <HeaderSelect label="Birth date / year" k={mapping.birthYear ? "birthYear" : "birthdate"} />
          <HeaderSelect label="Position" k="position" />
          <HeaderSelect label="HC # / ID" k="externalId" />
          <HeaderSelect label="Helmet # (optional)" k="helmet" />
          <HeaderSelect label="Parent email" k="parentEmail" />
          <HeaderSelect label="Parent email 2 (optional)" k="parentEmail2" />
          <HeaderSelect label="Division / group" k="division" />
        </div>
      </div>

      {/* Division filter */}
      {divisions.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h4 className="font-display font-bold text-ink text-sm mb-1">Which division(s) belong to this category?</h4>
          <p className="text-xs text-gray-400 mb-3">This file has multiple groups. Tick the one(s) for this age category — leave all unticked to import everyone.</p>
          <div className="flex flex-wrap gap-2">
            {divisions.map(d => {
              const on = selectedDivisions.includes(d.value);
              return (
                <button key={d.value}
                  onClick={() => setSelectedDivisions(s => on ? s.filter(x => x !== d.value) : [...s, d.value])}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${on ? "bg-accent text-white border-accent" : "bg-white text-gray-600 border-gray-200 hover:border-accent/40"}`}>
                  {d.value} · {d.count}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Preview */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <span className="font-display font-bold text-ink text-sm">Preview</span>
          <span className="text-xs text-gray-500"><b className="text-ink">{athletes.length}</b> ready{skipped ? ` · ${skipped} skipped (no name)` : ""}</span>
        </div>
        {athletes.length === 0 ? (
          <div className="px-4 py-6 text-sm text-amber-600 flex items-center gap-2"><AlertCircle size={15} /> No athletes resolved — check the name mapping above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr><th className="text-left px-4 py-2">Name</th><th className="text-left px-4 py-2">Birth yr</th><th className="text-left px-4 py-2">Pos</th><th className="text-left px-4 py-2">Parent email</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {preview.map((a, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-ink font-medium">{a.first_name} {a.last_name}</td>
                  <td className="px-4 py-2 text-gray-600 tabular-nums">{a.birth_year || "—"}</td>
                  <td className="px-4 py-2 text-gray-600 capitalize">{a.position || "—"}</td>
                  <td className="px-4 py-2 text-gray-500">{a.parent_email || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {athletes.length > preview.length && <div className="px-4 py-2 text-xs text-gray-400">+ {athletes.length - preview.length} more</div>}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex justify-end">
        <button onClick={doImport} disabled={importing || athletes.length === 0}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-opacity">
          <Upload size={15} /> {importing ? "Importing…" : `Import ${athletes.length} athlete${athletes.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
