"use client";
import { useState } from "react";

export default function ManualScoreUpload({ catId, sessions, scoringCategories }) {
  const [open, setOpen] = useState(false);
  const [evalName, setEvalName] = useState("");
  const [sessionNum, setSessionNum] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!evalName || !sessionNum || !file) return;
    setLoading(true);
    const text = await file.text();
    const csvLines = text.replace(/\r\n/g, '\n').trim().split('\n').filter(l => l.trim());
    const headers = csvLines[0].split(',').map(h => h.trim());
    const catNames = scoringCategories.map(c => c.name);
    const notesIdx = headers.findIndex(h => ['notes', 'comments', 'comment', 'note', 'evaluator notes'].includes(h.toLowerCase().trim()));
    const rows = csvLines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const scores = catNames.map(cat => { const idx = headers.indexOf(cat); return idx >= 0 ? cols[idx] : null; });
      const notes = notesIdx >= 0 && cols[notesIdx] ? cols[notesIdx] : null;
      return { first_name: cols[0], last_name: cols[1], scores, notes };
    }).filter(r => r.first_name && r.last_name);
    const res = await fetch(`/api/categories/${catId}/scores`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evaluatorName: evalName, sessionNumber: parseInt(sessionNum), rows }) });
    const data = await res.json();
    setResult(data);
    setLoading(false);
  };

  return (
    <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl overflow-hidden mt-4">
      <button onClick={() => { setOpen(!open); setResult(null); }} className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-100 transition-colors">
        <span className="text-sm font-medium text-gray-500">Emergency Score Upload</span>
        <span className="text-xs text-gray-400">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-200">
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">Backup only. Use if the app was unavailable during a session. Each evaluator uploads one file. Overwrites their previous scores for the selected session.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Evaluator Name *</label><input type="text" value={evalName} onChange={e => setEvalName(e.target.value)} placeholder="e.g. John Smith" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]" /></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Session *</label>
              <select value={sessionNum} onChange={e => setSessionNum(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]">
                <option value="">Select session...</option>
                {sessions.map(s => <option key={s.session_number} value={s.session_number}>Session {s.session_number} - {s.name}</option>)}
              </select>
            </div>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">CSV File * (columns: First Name, Last Name, {scoringCategories.map(c => c.name).join(", ")}, Notes (optional))</label><input type="file" accept=".csv" onChange={e => setFile(e.target.files[0])} className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#1A6BFF] file:text-white hover:file:bg-[#0F4FCC]" /></div>
          {result && <div className={`text-xs px-3 py-2 rounded-lg font-medium ${result.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{result.success ? `Imported ${result.imported} athletes${result.skipped > 0 ? `, ${result.skipped} not matched` : ""}` : result.error}</div>}
          <button onClick={handleUpload} disabled={!evalName || !sessionNum || !file || loading} className="px-5 py-2 bg-[#1A6BFF] text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-[#0F4FCC]">{loading ? "Uploading..." : "Upload Scores"}</button>
        </div>
      )}
    </div>
  );
}
