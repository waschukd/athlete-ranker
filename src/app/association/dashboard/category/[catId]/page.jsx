"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ArrowLeft, Users, Calendar, Trophy, Settings, BarChart3,
  Upload, Plus, ChevronRight, CheckCircle, Clock, Zap, Medal
} from "lucide-react";

const qc = new QueryClient();

const POSITION_COLORS = {
  forward: "bg-blue-100 text-blue-700",
  defense: "bg-purple-100 text-purple-700",
  goalie: "bg-amber-100 text-amber-700",
};
const POSITION_SHORT = { forward: "F", defense: "D", goalie: "G" };

function RankBadge({ rank }) {
  if (rank === 1) return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-500 flex items-center justify-center shadow-sm flex-shrink-0">
      <Medal size={13} className="text-white" />
    </div>
  );
  if (rank === 2) return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center shadow-sm flex-shrink-0">
      <span className="text-white text-xs font-bold">2</span>
    </div>
  );
  if (rank === 3) return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center shadow-sm flex-shrink-0">
      <span className="text-white text-xs font-bold">3</span>
    </div>
  );
  return (
    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
      <span className="text-gray-600 text-xs font-semibold">{rank}</span>
    </div>
  );
}





function ScoreManager({ catId, sessionNumber }) {
  const [open, setOpen] = useState(false);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/categories/${catId}/scores?session=${sessionNumber}`);
    const data = await res.json();
    setScores(data.scores || []);
    setLoading(false);
  };

  const clearEvaluator = async (evaluatorId, name) => {
    if (!confirm(`Delete all scores entered by ${name} for Session ${sessionNumber}? This cannot be undone.`)) return;
    const res = await fetch(`/api/categories/${catId}/scores?session=${sessionNumber}&evaluator=${evaluatorId}`, { method: "DELETE" });
    const data = await res.json();
    setMsg(`Deleted ${data.deleted} scores from ${name}`);
    load();
  };

  const clearAll = async () => {
    if (!confirm(`Delete ALL scores for Session ${sessionNumber}? This cannot be undone.`)) return;
    const res = await fetch(`/api/categories/${catId}/scores?session=${sessionNumber}`, { method: "DELETE" });
    const data = await res.json();
    setMsg(`Cleared ${data.deleted} scores`);
    setScores([]);
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{scores.length > 0 ? `${scores.length} evaluator(s) have entered scores` : "No scores entered yet"}</span>
        <button
          onClick={async (e) => { e.stopPropagation(); if (!open) await load(); setOpen(!open); setMsg(""); }}
          className="text-xs px-2 py-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          Manage Scores
        </button>
      </div>
      {open && (
        <div className="mt-2 bg-gray-50 rounded-xl p-3 space-y-2">
          {msg && <div className="text-xs text-green-600 font-medium">{msg}</div>}
          {loading ? (
            <div className="text-xs text-gray-400">Loading...</div>
          ) : scores.length === 0 ? (
            <div className="text-xs text-gray-400">No scores entered for this session</div>
          ) : (
            <>
              {scores.map(s => (
                <div key={s.evaluator_id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                  <div>
                    <div className="text-xs font-medium text-gray-900">{s.evaluator_name}</div>
                    <div className="text-xs text-gray-400">{s.athletes_scored} players scored</div>
                  </div>
                  <button
                    onClick={() => clearEvaluator(s.evaluator_id, s.evaluator_name)}
                    className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded-lg hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
              ))}
              <button
                onClick={clearAll}
                className="w-full text-xs py-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 font-medium mt-1"
              >
                Clear All Scores for Session {sessionNumber}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}


function AthletesTab({ catId, orgId, athletes, refetch }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", external_id: "", position: "", birth_year: "", parent_email: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [importing, setImporting] = useState(false);

  const addAthlete = async () => {
    if (!form.first_name || !form.last_name) return;
    setSaving(true);
    const res = await fetch(`/api/categories/${catId}/athletes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athletes: [form], org_id: orgId }),
    });
    const data = await res.json();
    if (data.inserted >= 0) {
      setMsg(`✓ ${form.first_name} ${form.last_name} added`);
      setForm({ first_name: "", last_name: "", external_id: "", position: "", birth_year: "", parent_email: "" });
      setShowAdd(false);
      refetch();
    }
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  };

  const handleCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    const text = await file.text();
    const lines = text.trim().split("\n").filter(l => l.trim());
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "_"));
    const rows = lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      const obj = {};
      headers.forEach((h, i) => obj[h] = cols[i] || "");
      return {
        first_name: obj.first_name || obj.first || "",
        last_name: obj.last_name || obj.last || "",
        external_id: obj["hc#"] || obj.hc || obj.external_id || obj.id || "",
        position: obj.position || "",
        birth_year: obj.birth_year || obj.dob || "",
        parent_email: obj.parent_email || obj.email || "",
      };
    }).filter(r => r.first_name && r.last_name);

    const res = await fetch(`/api/categories/${catId}/athletes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athletes: rows, org_id: orgId }),
    });
    const data = await res.json();
    setMsg(`✓ ${data.inserted || 0} athletes imported, ${data.skipped || 0} skipped`);
    refetch();
    setImporting(false);
    e.target.value = "";
    setTimeout(() => setMsg(""), 4000);
  };

  const removeAthlete = async (athleteId, name) => {
    if (!confirm(`Remove ${name} from this category?`)) return;
    await fetch(`/api/categories/${catId}/athletes?athlete_id=${athleteId}`, { method: "DELETE" });
    refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Athletes <span className="text-gray-400 font-normal">({athletes.length})</span></h2>
        <div className="flex items-center gap-2 flex-wrap">
          <a href="/api/templates?type=athletes" download
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
            ↓ Template
          </a>
          <label className={`inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-50 ${importing ? "opacity-50" : ""}`}>
            <Upload size={14} /> {importing ? "Importing..." : "Upload CSV"}
            <input type="file" accept=".csv" onChange={handleCSV} className="hidden" disabled={importing} />
          </label>
          <button onClick={() => setShowAdd(!showAdd)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#FF6B35] to-[#F7931E] text-white rounded-lg text-sm font-semibold">
            <Plus size={14} /> Add Player
          </button>
        </div>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium">{msg}</div>}

      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Add Player</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {[
              { key: "first_name", label: "First Name *" },
              { key: "last_name", label: "Last Name *" },
              { key: "external_id", label: "HC#" },
              { key: "position", label: "Position", type: "select" },
              { key: "birth_year", label: "Birth Year" },
              { key: "parent_email", label: "Parent Email" },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                {type === "select" ? (
                  <select value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]">
                    <option value="">—</option>
                    <option value="forward">Forward</option>
                    <option value="defense">Defense</option>
                    <option value="goalie">Goalie</option>
                  </select>
                ) : (
                  <input type="text" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]" />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Cancel</button>
            <button onClick={addAthlete} disabled={!form.first_name || !form.last_name || saving}
              className="px-5 py-2 bg-[#FF6B35] text-white rounded-lg text-sm font-semibold disabled:opacity-50">
              {saving ? "Saving..." : "Add Player"}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {athletes.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm mb-3">No athletes yet</p>
            <p className="text-xs text-gray-300">Upload a CSV or add players individually above</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">HC#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Birth Year</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {athletes.map((a, i) => (
                <tr key={a.id} className="hover:bg-gray-50 group">
                  <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-3">
                    <a href={`/player/report?athlete=${a.id}&cat=${catId}&org=${orgId}`}
                      className="font-medium text-gray-900 hover:text-[#FF6B35] transition-colors">
                      {a.last_name}, {a.first_name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{a.external_id || "—"}</td>
                  <td className="px-4 py-3">
                    {a.position ? <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${POSITION_COLORS[a.position] || "bg-gray-100 text-gray-600"}`}>{a.position}</span> : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{a.birth_year || "—"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => removeAthlete(a.id, `${a.first_name} ${a.last_name}`)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-xs px-2 py-1 rounded">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


function ScheduleTab({ catId, orgId, sessions, schedule, completedSessions, sessionStatus, inProgressSessions, refetch }) {
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");
  const [cancelConfirm, setCancelConfirm] = useState(null); // schedule entry id to cancel

  const handleCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    const text = await file.text();
    const lines = text.trim().split("\n").filter(l => l.trim());
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes("session") || firstLine.includes("date") || firstLine.includes("group");
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const rows = dataLines.map(line => {
      const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      return {
        session_number: cols[0],
        group_number: cols[1],
        scheduled_date: cols[2],
        start_time: cols[3],
        end_time: cols[4],
        location: cols[5],
        evaluators_required: cols[6],
      };
    }).filter(r => r.session_number && r.scheduled_date);

    const res = await fetch(`/api/categories/${catId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule: rows }),
    });
    const data = await res.json();
    if (data.success) { setMsg(`✓ ${data.count || rows.length} entries uploaded`); refetch(); }
    else setMsg("Error: " + data.error);
    setImporting(false);
    e.target.value = "";
    setTimeout(() => setMsg(""), 4000);
  };

  const cancelSession = async (scheduleId, label) => {
    await fetch(`/api/categories/${catId}/schedule?id=${scheduleId}`, { method: "DELETE" });
    setCancelConfirm(null);
    setMsg(`✓ ${label} cancelled and parties notified`);
    refetch();
    setTimeout(() => setMsg(""), 4000);
  };

  // Group schedule by session number — coerce to string to avoid int/string key mismatch
  const bySession = schedule.reduce((acc, e) => {
    const key = String(e.session_number);
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Schedule</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <a href="/api/templates?type=schedule" download
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
            ↓ Template
          </a>
          <label className={`inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-50 ${importing ? "opacity-50" : ""}`}>
            <Upload size={14} /> {importing ? "Uploading..." : "Upload / Update CSV"}
            <input type="file" accept=".csv" onChange={handleCSV} className="hidden" disabled={importing} />
          </label>
        </div>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium">{msg}</div>}

      {/* Session cards with groups inside */}
      {sessions.map(s => {
        const sStatus = sessionStatus[s.session_number] || "not_started";
        const isComplete = sStatus === "complete";
        const isInProgress = sStatus === "in_progress";
        const entries = (bySession[String(s.session_number)] || []).sort((a, b) => (a.group_number||0) - (b.group_number||0));

        return (
          <div key={s.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Session header */}
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm ${
                  isComplete ? "bg-green-500" : isInProgress ? "bg-blue-500" : "bg-gradient-to-br from-[#FF6B35] to-[#F7931E]"
                }`}>
                  {isComplete ? <CheckCircle size={14} /> : isInProgress ? <Clock size={14} /> : s.session_number}
                </div>
                <div>
                  <span className="text-sm font-semibold text-gray-900">{s.name}</span>
                  <span className="text-xs text-gray-400 ml-2 capitalize">{s.session_type} · {s.weight_percentage}%</span>
                  {isInProgress && <span className="ml-2 text-xs text-blue-500 font-medium">In Progress</span>}
                  {isComplete && <span className="ml-2 text-xs text-green-500 font-medium">Complete</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/association/dashboard/category/${catId}/groups?org=${orgId}&session=${s.session_number}`}
                  className="text-xs px-3 py-1.5 bg-[#FF6B35]/10 text-[#FF6B35] rounded-lg font-medium hover:bg-[#FF6B35]/20">
                  Manage Groups →
                </a>
                {s.session_type === "testing" && (
                  <label className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg font-medium cursor-pointer hover:bg-blue-100">
                    ↑ Upload Results
                    <input type="file" accept=".csv,.txt" className="hidden" onChange={async (ev) => {
                      const file = ev.target.files[0]; if (!file) return;
                      const text = await file.text();
                      const lines = text.trim().split("\n").filter(l => l.trim());
                      const hasHeader = lines[0].toLowerCase().includes("first") || lines[0].toLowerCase().includes("rank");
                      const results = (hasHeader ? lines.slice(1) : lines).map(line => {
                        const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
                        return { first_name: cols[0], last_name: cols[1], overall_rank: cols[2] };
                      }).filter(r => r.first_name && r.last_name && r.overall_rank);
                      const res = await fetch(`/api/categories/${catId}/testing-upload`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ session_number: s.session_number, results }),
                      });
                      const data = await res.json();
                      setMsg(data.success ? `✓ ${data.matched} matched${data.skipped > 0 ? `, ${data.skipped} skipped` : ""}` : "Error: " + data.error);
                      if (data.success) refetch();
                      ev.target.value = "";
                      setTimeout(() => setMsg(""), 4000);
                    }} />
                  </label>
                )}
                <ScoreManager catId={catId} sessionNumber={s.session_number} />
              </div>
            </div>

            {/* Progress bar */}
            <div className="px-5 py-2 border-b border-gray-50">
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${
                  isComplete ? "bg-green-500" : isInProgress ? "bg-blue-400" : "bg-gradient-to-r from-[#FF6B35] to-[#F7931E]"
                }`} style={{ width: `${s.weight_percentage}%` }} />
              </div>
            </div>

            {/* Groups/schedule entries */}
            {entries.length === 0 ? (
              <div className="px-5 py-4 text-sm text-gray-400 text-center">No schedule entries yet — upload a CSV above</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase border-b border-gray-100 bg-gray-50/50">
                    <th className="px-4 py-2 text-left">Group</th>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Time</th>
                    <th className="px-4 py-2 text-left">Location</th>
                    <th className="px-4 py-2 text-left">Evaluators</th>
                    <th className="px-4 py-2 text-left">Check-in</th>
                    <th className="px-4 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.map((e, i) => (
                    <tr key={i} className="hover:bg-gray-50 group">
                      <td className="px-4 py-2.5 font-medium text-gray-700">{e.group_number ? `Group ${e.group_number}` : "—"}</td>
                      <td className="px-4 py-2.5 text-gray-600">{e.scheduled_date?.toString().split("T")[0]}</td>
                      <td className="px-4 py-2.5 text-gray-500">{e.start_time && e.end_time ? `${e.start_time} – ${e.end_time}` : e.start_time || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-500">{e.location || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-500">{s.session_type === 'testing' ? 0 : (e.evaluators_required || 4)}</td>
                      <td className="px-4 py-2.5">
                        {e.checkin_code ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">{e.checkin_code}</span>
                            <a href={`/checkin/${e.id}`} target="_blank" className="text-xs text-[#FF6B35] hover:underline">Open</a>
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {cancelConfirm === e.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-red-500">Confirm?</span>
                            <button onClick={() => cancelSession(e.id, `Session ${s.session_number} Group ${e.group_number}`)}
                              className="text-xs px-2 py-0.5 bg-red-500 text-white rounded font-medium">Yes</button>
                            <button onClick={() => setCancelConfirm(null)} className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setCancelConfirm(e.id)}
                            className="opacity-0 group-hover:opacity-100 text-xs text-gray-300 hover:text-red-400 px-2 py-1 rounded transition-all">
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {schedule.length === 0 && sessions.length === 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-400">
          <Calendar size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No schedule yet</p>
          <p className="text-xs mt-1">Upload a CSV or complete the category setup</p>
        </div>
      )}
    </div>
  );
}

function CategoryHub() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org");
  const catId = typeof window !== "undefined" ? window.location.pathname.split("/")[4] : null;
  const [activeTab, setActiveTab] = useState("overview");
  const queryClient = useQueryClient();
  const [playerSearch, setPlayerSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [showDirectorModal, setShowDirectorModal] = useState(false);
  const [directorForm, setDirectorForm] = useState({ name: "", email: "" });
  const [directorMsg, setDirectorMsg] = useState("");

  const { data: setupData, isLoading } = useQuery({
    queryKey: ["category-setup", catId],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/setup`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!catId,
  });

  const { data: rankingsData, isLoading: rankingsLoading } = useQuery({
    queryKey: ["category-rankings", catId],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/rankings`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!catId,
    refetchInterval: 30000,
  });

  const { data: scheduleData } = useQuery({
    queryKey: ["category-schedule", catId],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/schedule`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!catId,
  });

  const category = setupData?.category;

  const { data: directorsData, refetch: refetchDirectors } = useQuery({
    queryKey: ["category-directors", catId],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/invite-director`);
      return res.json();
    },
    enabled: !!catId,
  });
  const sessions = setupData?.sessions || [];
  const athletes = rankingsData?.athletes || [];
  const schedule = scheduleData?.schedule || [];
  const hasScores = rankingsData?.has_scores || false;
  const phase = rankingsData?.phase || "pre_session";
  const completedSessions = rankingsData?.completed_sessions || [];
  const inProgressSessions = rankingsData?.in_progress_sessions || [];
  const sessionStatus = rankingsData?.session_status || {};
  const hasPositions = athletes.some(a => a.position);

  const filteredAthletes = positionFilter === "all"
    ? athletes
    : athletes.filter(a => a.position === positionFilter);

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "athletes", label: "Athletes", icon: Users },
    { id: "schedule", label: "Schedule", icon: Calendar },
    { id: "teams", label: "Teams", icon: Trophy },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  if (isLoading || !catId) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6B35]" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <a href={`/association/dashboard?org=${orgId}`}
            className="inline-flex items-center gap-1.5 text-gray-500 hover:text-[#FF6B35] mb-4 text-sm font-medium transition-colors">
            <ArrowLeft size={15} /> Back to Dashboard
          </a>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#F7931E] flex items-center justify-center shadow-md">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{category?.name}</h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                    category?.status === "active" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {category?.status === "active" ? <CheckCircle size={11} /> : <Clock size={11} />}
                    {category?.status === "active" ? "Active" : "Setup"}
                  </span>
                  <span className="text-xs text-gray-400">{athletes.length} athletes · {sessions.length} sessions</span>
                </div>
              </div>
            </div>
            <a href={`/association/dashboard/category/${catId}/setup?cat=${catId}&org=${orgId}`}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors">
              <Settings size={14} /> Edit Setup
            </a>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === tab.id ? "border-[#FF6B35] text-[#FF6B35]" : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}>
                  <Icon size={14} /> {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── OVERVIEW TAB ── */}
        {activeTab === "overview" && (
          <div className="space-y-6">

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Athletes", value: athletes.length, icon: Users, color: "from-blue-500 to-blue-600" },
                { label: "Sessions", value: sessions.length, icon: Trophy, color: "from-[#FF6B35] to-[#F7931E]" },
                { label: "Completed", value: completedSessions.length, icon: CheckCircle, color: "from-green-500 to-green-600" },
                { label: "In Progress", value: inProgressSessions.length, icon: Clock, color: "from-blue-500 to-blue-600" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center mb-3`}>
                    <Icon size={16} className="text-white" />
                  </div>
                  <div className="text-3xl font-bold text-gray-900">{value}</div>
                  <div className="text-sm text-gray-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* Session weight bars */}
            {sessions.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Session Weighting</h3>
                <div className="space-y-3">
                  {sessions.map(s => {
                    const sStatus = sessionStatus[s.session_number] || "not_started";
                    const isComplete = sStatus === "complete";
                    const isInProgress = sStatus === "in_progress";
                    return (
                      <div key={s.id} className="flex items-center gap-4">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                          isComplete ? "bg-green-500" : isInProgress ? "bg-blue-500" : "bg-gradient-to-br from-[#FF6B35] to-[#F7931E]"
                        }`}>
                          {isComplete ? <CheckCircle size={12} /> : isInProgress ? <Clock size={12} /> : s.session_number}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-gray-700">{s.name}</span>
                            <span className="text-sm font-bold text-[#FF6B35]">{s.weight_percentage}%</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${
                              isComplete ? "bg-green-500" : isInProgress ? "bg-blue-400" : "bg-gradient-to-r from-[#FF6B35] to-[#F7931E]"
                            }`} style={{ width: `${s.weight_percentage}%` }} />
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0 ${
                          s.session_type === "testing" ? "bg-blue-100 text-blue-700" :
                          s.session_type === "skills" ? "bg-purple-100 text-purple-700" :
                          "bg-green-100 text-green-700"
                        }`}>{s.session_type}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rankings table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    {phase === "pre_session" ? "Roster — Alphabetical Order" : "Live Rankings"}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {phase === "pre_session"
                      ? "Rankings update automatically after Session 1 scores are entered"
                      : phase === "in_progress"
                      ? `${completedSessions.length} of ${sessions.length} sessions scored · refreshes every 30s`
                      : "All sessions complete · Final Rankings"}
                  </p>
                </div>
                {hasPositions && category?.position_tagging && (
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                    {["all", "forward", "defense", "goalie"].map(pos => (
                      <button key={pos} onClick={() => setPositionFilter(pos)}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${
                          positionFilter === pos ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                        }`}>
                        {pos === "all" ? "All" : POSITION_SHORT[pos]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {rankingsLoading ? (
                <div className="p-12 text-center text-gray-400 text-sm">Loading...</div>
              ) : filteredAthletes.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <Users size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No athletes added yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: `${600 + sessions.length * 90}px` }}>
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-10">#</th>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">First</th>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Last</th>
                        {category?.position_tagging && (
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-12">Pos</th>
                        )}
                        {sessions.map(s => (
                          <th key={s.session_number} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-24">
                            <div>S{s.session_number}</div>
                            <div className="text-gray-400 font-normal normal-case text-xs">{s.weight_percentage}%</div>
                          </th>
                        ))}
                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-24">Total</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Rank History</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredAthletes.map((a) => {
                        // Calculate rank after each completed session
                        const rankHistory = sessions
                          .filter(s => completedSessions.includes(s.session_number))
                          .map(s => {
                            const upTo = s.session_number;
                            const scores = filteredAthletes.map(athlete => {
                              let total = 0;
                              sessions.forEach(sess => {
                                if (sess.session_number <= upTo) {
                                  total += athlete.session_scores?.[sess.session_number]?.contribution || 0;
                                }
                              });
                              return { id: athlete.id, total };
                            });
                            scores.sort((x, y) => y.total - x.total);
                            return scores.findIndex(s => s.id === a.id) + 1;
                          });

                        const isTop3 = hasScores && a.rank <= 3;

                        return (
                          <tr key={a.id} className={`hover:bg-orange-50/30 transition-colors ${isTop3 ? "bg-orange-50/20" : ""}`}>

                            {/* Rank badge */}
                            <td className="px-3 py-3">
                              <RankBadge rank={a.rank} />
                            </td>

                            {/* Name split */}
                            <td className="px-3 py-3 text-gray-700">
                              <a href={`/player/report?athlete=${a.id}&cat=${catId}&org=${orgId}`} className="hover:text-[#FF6B35] transition-colors font-medium">{a.first_name}</a>
                            </td>
                            <td className="px-3 py-3">
                              <a href={`/player/report?athlete=${a.id}&cat=${catId}&org=${orgId}`} className="text-gray-900 font-semibold hover:text-[#FF6B35] transition-colors">{a.last_name}</a>
                            </td>

                            {/* Position */}
                            {category?.position_tagging && (
                              <td className="px-3 py-3">
                                {a.position ? (
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${POSITION_COLORS[a.position] || "bg-gray-100 text-gray-600"}`}>
                                    {POSITION_SHORT[a.position] || a.position}
                                  </span>
                                ) : <span className="text-gray-300 text-xs">—</span>}
                              </td>
                            )}

                            {/* Per-session scores */}
                            {sessions.map(s => {
                              const sd = a.session_scores?.[s.session_number];
                              const isScored = completedSessions.includes(s.session_number);
                              return (
                                <td key={s.session_number} className="px-3 py-3 text-center">
                                  {sd ? (
                                    <div className="flex flex-col items-center">
                                      <span className="font-semibold text-gray-900">
                                        <span title="Score out of 100">{sd.normalized_score?.toFixed(1)}</span>
                                      </span>
                                    </div>
                                  ) : (
                                    <span className={`text-xs ${isScored ? "text-red-300" : "text-gray-200"}`}>
                                      {isScored ? "—" : "·"}
                                    </span>
                                  )}
                                </td>
                              );
                            })}

                            {/* Running total */}
                            <td className="px-3 py-3 text-center">
                              {hasScores && a.weighted_total !== null ? (
                                <span className={`inline-block px-2.5 py-1 rounded-lg text-sm font-bold ${
                                  a.rank === 1 ? "bg-yellow-100 text-yellow-700" :
                                  a.rank === 2 ? "bg-gray-100 text-gray-600" :
                                  a.rank === 3 ? "bg-amber-100 text-amber-700" :
                                  "bg-orange-50 text-[#FF6B35]"
                                }`}>
                                  {a.weighted_total?.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-gray-200 text-xs">·</span>
                              )}
                            </td>

                            {/* Rank history: e.g. 16 › 22 › 19 */}
                            <td className="px-3 py-3 text-center">
                              {rankHistory.length > 0 ? (
                                <div className="flex items-center justify-center gap-1 flex-wrap">
                                  {rankHistory.map((r, idx) => (
                                    <span key={idx} className="flex items-center gap-1">
                                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                                        idx === rankHistory.length - 1
                                          ? "bg-[#FF6B35] text-white"
                                          : "bg-gray-100 text-gray-500"
                                      }`}>
                                        {r}
                                      </span>
                                      {idx < rankHistory.length - 1 && (
                                        <span className="text-gray-300 text-xs">›</span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-200 text-xs">·</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ATHLETES TAB ── */}
        {activeTab === "athletes" && (
          <AthletesTab catId={catId} orgId={orgId} athletes={athletes} refetch={() => queryClient.invalidateQueries(["category-rankings", catId])} />
        )}

        {/* ── SCHEDULE TAB ── */}
        {activeTab === "schedule" && (
          <ScheduleTab catId={catId} orgId={orgId} sessions={sessions} schedule={schedule} completedSessions={completedSessions} sessionStatus={sessionStatus} inProgressSessions={inProgressSessions} refetch={() => { queryClient.invalidateQueries(["category-setup", catId]); queryClient.invalidateQueries(["category-schedule", catId]); queryClient.invalidateQueries(["category-rankings", catId]); }} />
        )}

                {activeTab === "teams" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Team Generation</h2>
                <p className="text-sm text-gray-400 mt-0.5">Generate teams from final rankings once all sessions are complete</p>
              </div>
              <a href={`/association/dashboard/category/${catId}/teams?org=${orgId}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#FF6B35] to-[#F7931E] text-white rounded-xl font-semibold text-sm hover:shadow-lg transition-shadow">
                Generate Teams →
              </a>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${rankingsData?.phase === "complete" ? "bg-green-100" : "bg-amber-100"}`}>
                  <Trophy size={18} className={rankingsData?.phase === "complete" ? "text-green-600" : "text-amber-600"} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {rankingsData?.phase === "complete" ? "All sessions complete — ready to generate" : `${completedSessions.length} of ${sessions.length} sessions scored`}
                  </div>
                  <div className="text-xs text-gray-400">
                    {rankingsData?.phase === "complete" ? "You can now generate final teams" : "Complete all sessions before generating teams"}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-gray-50 rounded-xl py-3">
                  <div className="text-2xl font-bold text-gray-900">{(rankingsData?.athletes || []).filter(a => a.position !== "goalie").length}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Skaters</div>
                </div>
                <div className="bg-gray-50 rounded-xl py-3">
                  <div className="text-2xl font-bold text-gray-900">{(rankingsData?.athletes || []).filter(a => a.position === "goalie").length}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Goalies</div>
                </div>
                <div className="bg-gray-50 rounded-xl py-3">
                  <div className="text-2xl font-bold text-[#FF6B35]">{completedSessions.length}/{sessions.length}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Sessions</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Category Settings</h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              {[
                { label: "Score Scale", desc: "Maximum score per category", value: `Out of ${category?.scoring_scale || 10}` },
                { label: "Score Increments", desc: "Minimum score step", value: category?.scoring_increment || 0.5 },
                { label: "Position Tagging", desc: "Tag athletes by Forward / Defense / Goalie", value: category?.position_tagging ? "On" : "Off" },
              ].map(({ label, desc, value }) => (
                <div key={label} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div><div className="text-sm font-medium text-gray-700">{label}</div><div className="text-xs text-gray-400">{desc}</div></div>
                  <span className="text-sm font-semibold text-gray-900">{value}</span>
                </div>
              ))}
            </div>
            {/* Director can edit scores toggle */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-700">Directors can edit scores</div>
                  <div className="text-xs text-gray-400 mt-0.5">Allow directors to clear or modify evaluator scores</div>
                </div>
                <button
                  onClick={async () => {
                    await fetch(`/api/categories/${catId}/setup`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "update_setting", director_can_edit_scores: !category?.director_can_edit_scores }),
                    });
                    queryClient.invalidateQueries(["category-setup", catId]);
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${category?.director_can_edit_scores ? "bg-[#FF6B35]" : "bg-gray-200"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${category?.director_can_edit_scores ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>

            {/* Directors */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Directors</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Assign directors to this age category</p>
                </div>
                <button onClick={() => { setShowDirectorModal(true); setDirectorMsg(""); }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#FF6B35] to-[#F7931E] text-white rounded-lg text-xs font-semibold">
                  + Invite Director
                </button>
              </div>
              {!(directorsData?.directors?.length) ? (
                <p className="text-xs text-gray-400">No directors assigned yet</p>
              ) : (directorsData.directors.map(d => (
                <div key={d.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 mb-2">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{d.name}</div>
                    <div className="text-xs text-gray-400">{d.email}</div>
                  </div>
                  <button onClick={async () => {
                    if (confirm(`Remove ${d.name} as director?`)) {
                      await fetch(`/api/categories/${catId}/invite-director?user_id=${d.id}`, { method: "DELETE" });
                      refetchDirectors();
                    }
                  }} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 hover:bg-red-50 rounded-lg">Remove</button>
                </div>
              )))}
            </div>

            {/* Director invite modal */}
            {showDirectorModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowDirectorModal(false)}>
                <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
                  <h3 className="font-bold text-gray-900 mb-1">Invite Director</h3>
                  <p className="text-sm text-gray-500 mb-5">They'll receive login credentials and access to this age category only.</p>
                  {directorMsg ? (
                    <div className="text-center py-4">
                      <p className="text-green-600 font-medium text-sm">{directorMsg}</p>
                      <button onClick={() => { setShowDirectorModal(false); setDirectorForm({ name: "", email: "" }); }} className="mt-4 px-5 py-2 bg-[#FF6B35] text-white rounded-lg text-sm font-medium">Done</button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                        <input type="text" value={directorForm.name} onChange={e => setDirectorForm(f => ({ ...f, name: e.target.value }))} placeholder="John Smith" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                        <input type="email" value={directorForm.email} onChange={e => setDirectorForm(f => ({ ...f, email: e.target.value }))} placeholder="john@email.com" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]" />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <button onClick={() => setShowDirectorModal(false)} className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-xl text-sm">Cancel</button>
                        <button onClick={async () => {
                          if (!directorForm.name || !directorForm.email) return;
                          const res = await fetch(`/api/categories/${catId}/invite-director`, {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(directorForm),
                          });
                          const data = await res.json();
                          if (data.success) { setDirectorMsg(data.message); refetchDirectors(); }
                        }} disabled={!directorForm.name || !directorForm.email}
                          className="flex-1 py-2.5 bg-[#FF6B35] text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                          Send Invite
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <a href={`/association/dashboard/category/${catId}/setup?cat=${catId}&org=${orgId}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FF6B35] text-white rounded-lg text-sm font-semibold hover:bg-[#E55A2E] transition-colors">
              <Settings size={14} /> Edit All Settings
            </a>
          </div>
        )}

      </div>
    </div>
  );
}

export default function CategoryPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6B35]" /></div>}>
        <CategoryHub />
      </Suspense>
    </QueryClientProvider>
  );
}
