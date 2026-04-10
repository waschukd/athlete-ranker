"use client";
import { useState } from "react";
import { Upload, FileText } from "lucide-react";

// ── TeamGenius CSV Parser ───────────────────────────────────────────────────
function parseTeamGeniusCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n").filter(l => l.trim());

  // Find the header row (contains "#" and "Name")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const cols = lines[i].split(",").map(c => c.trim());
    if (cols.some(c => c === "#") && cols.some(c => c === "Name")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const headers = lines[headerIdx].split(",").map(c => c.trim());

  // Find column indices
  const jerseyIdx = headers.indexOf("#");
  const nameIdx = headers.indexOf("Name");
  const birthIdx = headers.findIndex(h => h.toLowerCase().includes("birth"));

  // Find scoring category columns (non-empty headers that aren't rank/#/Name/Birth/total)
  const skipCols = new Set([jerseyIdx, nameIdx, birthIdx]);
  const scoringCols = [];
  for (let i = 0; i < headers.length; i++) {
    if (skipCols.has(i)) continue;
    const h = headers[i].trim();
    if (!h) continue;
    // Skip the rank column (first non-empty before #) and total column (last non-empty)
    if (i < jerseyIdx) continue; // rank column
    scoringCols.push({ idx: i, name: h });
  }
  // Remove last column if it looks like a total (usually no header or a number)
  // Actually keep all — let the mapper handle it

  // Parse data rows
  const dataRows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.toLowerCase().includes("powered by") || line.toLowerCase().includes("teamgenius")) continue;

    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const jerseyRaw = cols[jerseyIdx] || "";
    const fullName = cols[nameIdx] || "";
    if (!fullName) continue;

    // Parse name — "FirstName LastName" or "FIRSTNAME LASTNAME"
    const nameParts = fullName.trim().split(/\s+/);
    const first_name = nameParts[0] || "";
    const last_name = nameParts.slice(1).join(" ") || "";

    // Parse scores for each scoring column
    const scores = {};
    for (const col of scoringCols) {
      const val = parseFloat(cols[col.idx]);
      if (!isNaN(val)) scores[col.name] = val;
    }

    if (first_name && last_name && Object.keys(scores).length > 0) {
      dataRows.push({ first_name, last_name, jersey: jerseyRaw, scores });
    }
  }

  return {
    categories: scoringCols.map(c => c.name).filter(name => dataRows.some(r => r.scores[name] !== undefined)),
    rows: dataRows,
  };
}

export default function ManualScoreUpload({ catId, sessions, scoringCategories }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("standard"); // "standard" | "teamgenius"
  const [evalName, setEvalName] = useState("");
  const [sessionNum, setSessionNum] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // TeamGenius state
  const [tgParsed, setTgParsed] = useState(null); // parsed TeamGenius data
  const [tgMapping, setTgMapping] = useState({}); // { tgCategoryName: ourCategoryId }

  // ── Standard Upload ────────────────────────────────────
  const handleStandardUpload = async () => {
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

  // ── TeamGenius File Parse ──────────────────────────────
  const handleTGFileSelect = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    const text = await f.text();
    const parsed = parseTeamGeniusCSV(text);
    if (!parsed || !parsed.rows.length) {
      setResult({ error: "Could not parse TeamGenius CSV. Check the file format." });
      return;
    }
    setTgParsed(parsed);
    // Auto-map categories by fuzzy name match
    const autoMap = {};
    for (const tgCat of parsed.categories) {
      const tgLower = tgCat.toLowerCase();
      // Try exact match first
      const exact = scoringCategories.find(c => c.name.toLowerCase() === tgLower);
      if (exact) { autoMap[tgCat] = exact.id; continue; }
      // Try contains match
      const partial = scoringCategories.find(c =>
        c.name.toLowerCase().includes(tgLower) || tgLower.includes(c.name.toLowerCase()) ||
        c.name.toLowerCase().split(/[\s/]/).some(w => tgLower.includes(w))
      );
      if (partial) { autoMap[tgCat] = partial.id; continue; }
      autoMap[tgCat] = "";
    }
    setTgMapping(autoMap);
    setResult(null);
  };

  // ── TeamGenius Upload ──────────────────────────────────
  const handleTGUpload = async () => {
    if (!sessionNum || !tgParsed) return;
    setLoading(true);

    // Build rows in the format the API expects
    const catNames = scoringCategories.map(c => c.name);
    const rows = tgParsed.rows.map(row => {
      const scores = catNames.map(catName => {
        // Find which TG category maps to this scoring category
        const sc = scoringCategories.find(c => c.name === catName);
        if (!sc) return null;
        const tgCatEntry = Object.entries(tgMapping).find(([, id]) => id === sc.id);
        if (!tgCatEntry) return null;
        return row.scores[tgCatEntry[0]] ?? null;
      });
      return { first_name: row.first_name, last_name: row.last_name, scores };
    }).filter(r => r.first_name && r.last_name);

    const res = await fetch(`/api/categories/${catId}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evaluatorName: "TeamGenius Import", sessionNumber: parseInt(sessionNum), rows }),
    });
    const data = await res.json();
    setResult(data);
    setLoading(false);
  };

  const mappedCount = Object.values(tgMapping).filter(v => v).length;
  const totalTgCats = tgParsed?.categories?.length || 0;

  return (
    <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl overflow-hidden mt-4">
      <button onClick={() => { setOpen(!open); setResult(null); setTgParsed(null); }} className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-100 transition-colors">
        <span className="text-sm font-medium text-gray-500">Score Upload</span>
        <span className="text-xs text-gray-400">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-gray-200">
          {/* Mode Toggle */}
          <div className="flex gap-2 mt-3 mb-4">
            <button onClick={() => { setMode("standard"); setTgParsed(null); setResult(null); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${mode === "standard" ? "bg-[#1A6BFF] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              <Upload size={12} /> Standard CSV
            </button>
            <button onClick={() => { setMode("teamgenius"); setResult(null); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${mode === "teamgenius" ? "bg-[#1A6BFF] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              <FileText size={12} /> TeamGenius Import
            </button>
          </div>

          {/* ─── Standard Mode ──────────────────────────── */}
          {mode === "standard" && (
            <div className="space-y-4">
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Backup only. Use if the app was unavailable during a session. Each evaluator uploads one file. Overwrites their previous scores for the selected session.</p>
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
              <button onClick={handleStandardUpload} disabled={!evalName || !sessionNum || !file || loading} className="px-5 py-2 bg-[#1A6BFF] text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-[#0F4FCC]">{loading ? "Uploading..." : "Upload Scores"}</button>
            </div>
          )}

          {/* ─── TeamGenius Mode ────────────────────────── */}
          {mode === "teamgenius" && (
            <div className="space-y-4">
              <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">Import aggregate scores from a TeamGenius CSV export. The system will parse the file, let you map their scoring categories to yours, and import as &ldquo;TeamGenius Import&rdquo;.</p>

              <div><label className="block text-xs font-medium text-gray-500 mb-1">Session *</label>
                <select value={sessionNum} onChange={e => setSessionNum(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]">
                  <option value="">Select session to import into...</option>
                  {sessions.map(s => <option key={s.session_number} value={s.session_number}>Session {s.session_number} - {s.name}</option>)}
                </select>
              </div>

              <div><label className="block text-xs font-medium text-gray-500 mb-1">TeamGenius CSV File *</label>
                <input type="file" accept=".csv" onChange={handleTGFileSelect} className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#1A6BFF] file:text-white hover:file:bg-[#0F4FCC]" />
              </div>

              {/* Column Mapping */}
              {tgParsed && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-900">Map Categories</h4>
                    <span className="text-xs text-gray-400">{tgParsed.rows.length} athletes found · {mappedCount}/{totalTgCats} categories mapped</span>
                  </div>
                  {tgParsed.categories.map(tgCat => (
                    <div key={tgCat} className="flex items-center gap-3">
                      <div className="w-40 flex-shrink-0">
                        <span className="text-sm text-gray-700 font-medium">{tgCat}</span>
                        <span className="text-[10px] text-gray-400 ml-1">(TG)</span>
                      </div>
                      <span className="text-gray-300">→</span>
                      <select
                        value={tgMapping[tgCat] || ""}
                        onChange={e => setTgMapping(prev => ({ ...prev, [tgCat]: e.target.value }))}
                        className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF] ${tgMapping[tgCat] ? "border-green-300 bg-green-50" : "border-gray-200"}`}
                      >
                        <option value="">— Skip —</option>
                        {scoringCategories.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                      </select>
                    </div>
                  ))}

                  {/* Preview */}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="text-xs text-gray-500 font-medium mb-2">Preview (first 5 rows)</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left py-1 pr-3 text-gray-400 font-medium">Name</th>
                            {tgParsed.categories.filter(c => tgMapping[c]).map(c => (
                              <th key={c} className="text-center py-1 px-2 text-gray-400 font-medium">{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tgParsed.rows.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-b border-gray-50">
                              <td className="py-1 pr-3 text-gray-700 font-medium">{row.first_name} {row.last_name}</td>
                              {tgParsed.categories.filter(c => tgMapping[c]).map(c => (
                                <td key={c} className="text-center py-1 px-2 font-mono text-gray-600">{row.scores[c] ?? "—"}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {result && <div className={`text-xs px-3 py-2 rounded-lg font-medium ${result.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{result.success ? `Imported ${result.imported} athletes${result.skipped > 0 ? `, ${result.skipped} not matched by name` : ""}` : result.error}</div>}

              <button onClick={handleTGUpload} disabled={!sessionNum || !tgParsed || mappedCount === 0 || loading}
                className="px-5 py-2 bg-[#1A6BFF] text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-[#0F4FCC]">
                {loading ? "Importing..." : `Import ${tgParsed?.rows?.length || 0} Athletes`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
