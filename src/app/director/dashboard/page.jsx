"use client";

import { useState, Suspense } from "react";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Users, Calendar, Trophy, Settings, BarChart3, LogOut,
  Zap, CheckCircle, Clock, Medal, AlertCircle, ClipboardList,
  Copy, Check, Download, FileText, ChevronRight
} from "lucide-react";

const qc = new QueryClient();

const POSITION_COLORS = {
  forward: "bg-blue-100 text-blue-700",
  defense: "bg-purple-100 text-purple-700",
  goalie: "bg-amber-100 text-amber-700",
};
const POSITION_SHORT = { forward: "F", defense: "D", goalie: "G" };

function RankBadge({ rank }) {
  if (rank === 1) return <div className="w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center"><Medal size={13} className="text-white" /></div>;
  if (rank === 2) return <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center"><span className="text-white text-xs font-bold">2</span></div>;
  if (rank === 3) return <div className="w-7 h-7 rounded-full bg-amber-600 flex items-center justify-center"><span className="text-white text-xs font-bold">3</span></div>;
  return <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"><span className="text-gray-600 text-xs font-semibold">{rank}</span></div>;
}

function CopyCode({ code, scheduleId }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs font-bold text-gray-800 bg-gray-100 px-2 py-1 rounded tracking-wider">{code}</span>
      <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors">
        {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
      </button>
      <a href={`/checkin/${scheduleId}`} target="_blank" className="text-xs text-[#1A6BFF] hover:underline whitespace-nowrap">Open →</a>
    </div>
  );
}

function ManualScoreUpload({ catId, sessions, scoringCategories }) {
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
    const lines = text.trim().split("\n").filter(l => l.trim());
    const headers = lines[0].split(",").map(h => h.trim());
    const catNames = scoringCategories.map(c => c.name);
    const rows = lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      const scores = catNames.map(cat => { const idx = headers.indexOf(cat); return idx >= 0 ? cols[idx] : null; });
      return { first_name: cols[0], last_name: cols[1], scores };
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
          <div><label className="block text-xs font-medium text-gray-500 mb-1">CSV File * (columns: First, Last, {scoringCategories.map(c => c.name).join(", ")})</label><input type="file" accept=".csv" onChange={e => setFile(e.target.files[0])} className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#1A6BFF] file:text-white hover:file:bg-[#0F4FCC]" /></div>
          {result && <div className={`text-xs px-3 py-2 rounded-lg font-medium ${result.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{result.success ? `Imported ${result.imported} athletes${result.skipped > 0 ? `, ${result.skipped} not matched` : ""}` : result.error}</div>}
          <button onClick={handleUpload} disabled={!evalName || !sessionNum || !file || loading} className="px-5 py-2 bg-[#1A6BFF] text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-[#0F4FCC]">{loading ? "Uploading..." : "Upload Scores"}</button>
        </div>
      )}
    </div>
  );
}

function FlagsPanel({ catId }) {
  const [flags, setFlags] = useState([]);
  const [detecting, setDetecting] = useState(false);
  const [msg, setMsg] = useState("");

  const loadFlags = async () => {
    const res = await fetch(`/api/categories/${catId}/flags`);
    const data = await res.json();
    setFlags(data.flags || []);
  };

  const detect = async () => {
    setDetecting(true);
    setMsg("");
    const res = await fetch(`/api/categories/${catId}/flags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "detect" }) });
    const data = await res.json();
    setMsg(`Detection complete - ${data.flags_created} new flag${data.flags_created !== 1 ? "s" : ""} found`);
    loadFlags();
    setDetecting(false);
  };

  const acknowledge = async (flagId) => {
    await fetch(`/api/categories/${catId}/flags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "acknowledge", flag_id: flagId }) });
    loadFlags();
  };

  useState(() => { loadFlags(); }, []);

  const unacknowledged = flags.filter(f => !f.acknowledged);
  const bySession = flags.reduce((acc, f) => { const k = f.session_number; if (!acc[k]) acc[k] = []; acc[k].push(f); return acc; }, {});

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Athlete Flags</h3>
          <p className="text-xs text-gray-400 mt-0.5">Outlier detection - significant drops or session anomalies</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs text-green-600 font-medium">{msg}</span>}
          <button onClick={detect} disabled={detecting} className="px-4 py-2 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold disabled:opacity-50">
            {detecting ? "Detecting..." : "Run Detection"}
          </button>
        </div>
      </div>

      {flags.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl px-5 py-8 text-center text-sm text-gray-400">No flags detected yet - click Run Detection after scores are uploaded</div>
      ) : (
        <>
          {unacknowledged.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-red-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-red-800">{unacknowledged.length} Unreviewed Flag{unacknowledged.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="divide-y divide-red-100">
                {unacknowledged.map(f => (
                  <div key={f.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.severity === "critical" ? "bg-red-200 text-red-800" : "bg-amber-100 text-amber-700"}`}>{f.severity === "critical" ? "Critical" : "Warning"}</span>
                        <span className="text-sm font-semibold text-gray-900">{f.first_name} {f.last_name}</span>
                        <span className="text-xs text-gray-400">Session {f.session_number}</span>
                        <span className="text-xs text-gray-500">{f.flag_type === "personal_drop" ? "Significant Drop" : "Session Outlier"}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {f.flag_type === "personal_drop"
                          ? `Previous avg: ${f.details?.prev_avg} ? Current: ${f.details?.current_score} (drop of ${f.details?.drop})`
                          : `Score: ${f.details?.athlete_score} vs session mean: ${f.details?.session_mean} (z: ${f.details?.z_score})`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={`/player/report?athlete=${f.athlete_id}&cat=${catId}`} className="text-xs px-2 py-1 border border-gray-200 text-gray-500 rounded-lg hover:border-[#1A6BFF] hover:text-[#1A6BFF]">Report</a>
                      <button onClick={() => acknowledge(f.id)} className="text-xs px-2 py-1 bg-green-50 text-green-600 border border-green-200 rounded-lg hover:bg-green-100">Acknowledge</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.entries(bySession).sort(([a],[b]) => Number(a)-Number(b)).map(([sNum, sFlags]) => (
            <div key={sNum} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-700">Session {sNum} - {sFlags.length} flag{sFlags.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {sFlags.map(f => (
                  <div key={f.id} className={`flex items-center justify-between px-5 py-3 ${f.acknowledged ? "opacity-50" : ""}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.severity === "critical" ? "bg-red-200 text-red-800" : "bg-amber-100 text-amber-700"}`}>{f.severity === "critical" ? "Critical" : "Warning"}</span>
                        <span className="text-sm font-medium text-gray-900">{f.first_name} {f.last_name}</span>
                        <span className="text-xs text-gray-500">{f.flag_type === "personal_drop" ? "Significant Drop" : "Session Outlier"}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {f.flag_type === "personal_drop"
                          ? `Prev avg: ${f.details?.prev_avg} ? Current: ${f.details?.current_score}`
                          : `Score: ${f.details?.athlete_score} vs mean: ${f.details?.session_mean}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {f.acknowledged
                        ? <span className="text-xs text-gray-400">Reviewed by {f.acknowledged_by_name}</span>
                        : <button onClick={() => acknowledge(f.id)} className="text-xs px-2 py-1 bg-green-50 text-green-600 border border-green-200 rounded-lg hover:bg-green-100">Acknowledge</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function DirectorDashboardInner() {
  const [activeTab, setActiveTab] = useState("rankings");
  const [positionFilter, setPositionFilter] = useState("all");
  const [sortBy, setSortBy] = useState(null); // { key, dir }
  const [scoreManagerOpen, setScoreManagerOpen] = useState(null);
  const [volunteerModal, setVolunteerModal] = useState(null); // { sessionNum, entries }
  const [volunteerEmails, setVolunteerEmails] = useState("");
  const [volunteerSending, setVolunteerSending] = useState(false);
  const [volunteerMsg, setVolunteerMsg] = useState("");
  const [scoreManagerData, setScoreManagerData] = useState([]);
  const [uploadMsg, setUploadMsg] = useState("");
  const [importing, setImporting] = useState(false);

  const { data: dirData, isLoading: dirLoading } = useQuery({
    queryKey: ["director-category"],
    queryFn: async () => {
      const res = await fetch("/api/director/category");
      if (!res.ok) throw new Error("Not assigned");
      return res.json();
    },
  });

  const assignment = dirData?.assignments?.[0];
  const catId = assignment?.age_category_id;

  const { data: setupData, refetch: refetchSetup } = useQuery({
    queryKey: ["category-setup", catId],
    queryFn: async () => { const res = await fetch(`/api/categories/${catId}/setup`); return res.json(); },
    enabled: !!catId,
  });

  const { data: rankingsData, refetch: refetchRankings } = useQuery({
    queryKey: ["category-rankings", catId],
    queryFn: async () => { const res = await fetch(`/api/categories/${catId}/rankings`); return res.json(); },
    enabled: !!catId,
    refetchInterval: 30000,
  });

  const { data: scheduleData, refetch: refetchSchedule } = useQuery({
    queryKey: ["category-schedule", catId],
    queryFn: async () => { const res = await fetch(`/api/categories/${catId}/schedule`); return res.json(); },
    enabled: !!catId,
  });

  const { data: athletesData, refetch: refetchAthletes } = useQuery({
    queryKey: ["category-athletes", catId],
    queryFn: async () => { const res = await fetch(`/api/categories/${catId}/athletes`); return res.json(); },
    enabled: !!catId,
  });

  const sessions = setupData?.sessions || [];
  const scoringCategories = setupData?.scoringCategories || [];
  const category = setupData?.category;
  const rankedAthletes = rankingsData?.athletes || [];
  const athletes = athletesData?.athletes || [];
  const schedule = scheduleData?.schedule || [];
  const hasScores = rankingsData?.has_scores || false;
  const phase = rankingsData?.phase || "pre_session";
  const completedSessions = rankingsData?.completed_sessions || [];
  const canEditScores = category?.director_can_edit_scores || false;
  const hasPositions = rankedAthletes.some(a => a.position);
  const filteredAthletes = positionFilter === "all" ? rankedAthletes : rankedAthletes.filter(a => a.position === positionFilter);
  const sortedAthletes = sortBy ? [...filteredAthletes].sort((a, b) => {
    const dir = sortBy.dir === 'asc' ? 1 : -1;
    if (sortBy.key === 'total') return dir * ((a.weighted_total || 0) - (b.weighted_total || 0));
    if (sortBy.key === 'rank') return dir * (a.rank - b.rank);
    const aScore = a.session_scores?.[sortBy.key]?.normalized_score ?? -1;
    const bScore = b.session_scores?.[sortBy.key]?.normalized_score ?? -1;
    return dir * (aScore - bScore);
  }) : filteredAthletes;
  const toggleSort = (key) => setSortBy(prev => prev?.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' });
  const sortIcon = (key) => sortBy?.key === key ? (sortBy.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕';
  const upcomingSchedule = schedule.filter(s => s.scheduled_date >= new Date().toISOString().split("T")[0]).sort((a, b) => a.scheduled_date > b.scheduled_date ? 1 : -1);

  // Load score manager for a session
  const sendVolunteers = async () => {
    if (!volunteerEmails.trim()) return;
    setVolunteerSending(true);
    const emails = volunteerEmails.split(/[,\n]/).map(e => e.trim()).filter(Boolean);
    const res = await fetch("/api/categories/" + catId + "/notify-volunteers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails, sessionNum: volunteerModal.sessionNum, entries: volunteerModal.entries, categoryName: category?.name || "" }),
    });
    const data = await res.json();
    setVolunteerMsg(data.success ? "Sent to " + data.sent + " volunteer(s)" : "Error: " + data.error);
    setVolunteerSending(false);
    setTimeout(() => { setVolunteerMsg(""); setVolunteerModal(null); setVolunteerEmails(""); }, 3000);
  };

  const loadScoreManager = async (sessionNum) => {
    if (scoreManagerOpen === sessionNum) { setScoreManagerOpen(null); return; }
    const res = await fetch(`/api/categories/${catId}/scores?session=${sessionNum}`);
    const data = await res.json();
    setScoreManagerData(data.scores || []);
    setScoreManagerOpen(sessionNum);
  };

  const clearEvaluatorScores = async (sessionNum, evaluatorId, name) => {
    if (!confirm(`Delete all scores by ${name} for Session ${sessionNum}?`)) return;
    await fetch(`/api/categories/${catId}/scores?session=${sessionNum}&evaluator=${evaluatorId}`, { method: "DELETE" });
    loadScoreManager(sessionNum);
    refetchRankings();
  };

  // Export rankings as CSV
  const exportRankingsCSV = () => {
    const headers = ["Rank", "First", "Last", "Position", "HC#", ...sessions.map(s => `S${s.session_number} (${s.weight_percentage}%)`), "Total"];
    const rows = rankedAthletes.map(a => [
      a.rank, a.first_name, a.last_name, a.position || "", a.external_id || "",
      ...sessions.map(s => a.session_scores?.[s.session_number]?.normalized_score?.toFixed(1) || ""),
      a.weighted_total?.toFixed(1) || "",
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${assignment?.category_name || "rankings"}_rankings.csv`;
    a.click();
  };

  // Export session summary CSV
  const exportSessionSummary = (sessionNum) => {
    const sessionAthletes = rankedAthletes.filter(a => a.session_scores?.[sessionNum]);
    const headers = ["Rank", "First", "Last", "Score", "Evaluators"];
    const rows = sessionAthletes.map(a => {
      const sd = a.session_scores[sessionNum];
      return [a.rank, a.first_name, a.last_name, sd.normalized_score?.toFixed(1), sd.evaluator_count || 1];
    });
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `session_${sessionNum}_summary.csv`;
    el.click();
  };

  const tabs = [
    { id: "rankings", label: "Rankings", icon: BarChart3 },
        { id: "schedule", label: "Schedule", icon: Calendar },
    { id: "athletes", label: "Athletes", icon: Users },
    { id: "reports", label: "Reports", icon: FileText },
  ];

  if (dirLoading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" /></div>;

  if (!assignment) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <AlertCircle size={52} className="mx-auto text-gray-300 mb-4" />
        <h2 className="text-xl font-bold text-gray-700 mb-2">No Category Assigned</h2>
        <p className="text-sm text-gray-400">Your association admin needs to assign you to an age category as a director.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-center shadow-md">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{assignment.category_name}</h1>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-400">{assignment.org_name}</span>
                  <span className="text-gray-200">·</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${assignment.status === "active" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {assignment.status === "active" ? "Active" : "Setup"}
                  </span>
                  <span className="text-xs text-gray-400 font-medium">· Director</span>
                  {canEditScores && <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">Can edit scores</span>}
                </div>
              </div>
            </div>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              <LogOut size={15} /> Sign out
            </button>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            {[
              { label: "Athletes", value: athletes.length, color: "text-blue-600", icon: Users },
              { label: "Sessions", value: sessions.length, color: "text-[#1A6BFF]", icon: Trophy },
              { label: "Completed", value: completedSessions.length, color: "text-green-600", icon: CheckCircle },
              { label: "Upcoming", value: upcomingSchedule.length, color: "text-purple-600", icon: Calendar },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <Icon size={18} className={color} />
                <div>
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-gray-500">{label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === tab.id ? "border-[#1A6BFF] text-[#1A6BFF]" : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}>
                  <Icon size={14} /> {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── RANKINGS TAB ── */}
        {activeTab === "rankings" && (
          <div className="space-y-5">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Session Weighting</h3>
              <div className="space-y-3">
                {sessions.map(s => {
                  const isComplete = completedSessions.includes(s.session_number);
                  return (
                    <div key={s.id} className="flex items-center gap-4">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${isComplete ? "bg-green-500" : "bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF]"}`}>
                        {isComplete ? <CheckCircle size={13} /> : s.session_number}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-700">{s.name} <span className="text-xs text-gray-400 ml-1.5 capitalize">({s.session_type})</span></span>
                          <span className="text-sm font-bold text-[#1A6BFF]">{s.weight_percentage}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${isComplete ? "bg-green-500" : "bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF]"}`} style={{ width: `${s.weight_percentage}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{phase === "pre_session" ? "Roster — Alphabetical" : "Live Rankings"}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{phase === "pre_session" ? "Rankings update after Session 1 scores are entered" : `${completedSessions.length} of ${sessions.length} sessions · refreshes every 30s`}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {hasPositions && category?.position_tagging && (
                    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                      {["all", "forward", "defense", "goalie"].map(pos => (
                        <button key={pos} onClick={() => setPositionFilter(pos)}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${positionFilter === pos ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                          {pos === "all" ? "All" : POSITION_SHORT[pos]}
                        </button>
                      ))}
                    </div>
                  )}
                  {hasScores && (
                    <button onClick={exportRankingsCSV}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50">
                      <Download size={12} /> Export CSV
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12 cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort('rank')}>Rank{sortIcon('rank')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">First</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last</th>
                      {hasPositions && category?.position_tagging && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pos</th>}
                      {sessions.map(s => (
                        <th key={s.session_number} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                          S{s.session_number}<span className="block text-gray-400 font-normal normal-case">{s.weight_percentage}%</span>
                        </th>
                      ))}
                      {hasScores && <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort('total')}>Total{sortIcon('total')}</th>}
                      {hasScores && <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Track</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedAthletes.map(a => (
                      <tr key={a.id} className={`hover:bg-gray-50 transition-colors ${a.rank === 1 ? "bg-yellow-50/40" : a.rank === 2 ? "bg-gray-50/60" : a.rank === 3 ? "bg-orange-50/30" : ""}`}>
                        <td className="px-4 py-3"><RankBadge rank={a.rank} /></td>
                        <td className="px-4 py-3">
                          <a href={`/player/report?athlete=${a.id}&cat=${catId}`}
                            className="text-gray-900 font-medium hover:text-[#1A6BFF] transition-colors">
                            {a.first_name}
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <a href={`/player/report?athlete=${a.id}&cat=${catId}`}
                            className="text-gray-900 font-semibold hover:text-[#1A6BFF] transition-colors">
                            {a.last_name}
                          </a>
                        </td>
                        {hasPositions && category?.position_tagging && (
                          <td className="px-4 py-3">{a.position ? <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${POSITION_COLORS[a.position] || "bg-gray-100 text-gray-600"}`}>{POSITION_SHORT[a.position] || a.position}</span> : <span className="text-gray-300">—</span>}</td>
                        )}
                        {sessions.map(s => {
                          const sd = a.session_scores?.[s.session_number];
                          return (
                            <td key={s.session_number} className="px-4 py-3 text-center">
                              {sd ? (
                                <div>
                                  <span className="font-medium text-gray-900" title="Score out of 100">{sd.normalized_score?.toFixed(1)}</span>
                                  {sd.source === "testing" && sd.overall_rank && <span className="block text-xs text-blue-400">rank #{sd.overall_rank}</span>}
                                </div>
                              ) : <span className="text-gray-200">—</span>}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center"><a href={`/player/report?athlete=${a.id}&cat=${catId}`} className="text-xs px-2 py-1 border border-gray-200 text-gray-500 rounded-lg hover:border-[#1A6BFF] hover:text-[#1A6BFF] transition-colors whitespace-nowrap">View Report</a></td>
                        {hasScores && <td className="px-4 py-3 text-center font-bold text-gray-900 tabular-nums">{a.weighted_total?.toFixed(1) || "—"}</td>}
                        {hasScores && (
                          <td className="px-4 py-3 text-center">
                            {a.rank_history?.length > 0 ? (
                              <div className="flex items-center justify-center gap-1 flex-wrap">
                                {a.rank_history.map((r, i) => (
                                  <span key={i} className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${i === a.rank_history.length - 1 ? "bg-[#1A6BFF] text-white" : "bg-gray-100 text-gray-600"}`}>{r}</span>
                                ))}
                              </div>
                            ) : <span className="text-gray-200">—</span>}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── GROUPS TAB ── */}
        {activeTab === "groups" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Group Management</h2>
              <a href={`/association/dashboard/category/${catId}/groups?org=${assignment.organization_id}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-shadow">
                Manage Groups →
              </a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sessions.map(s => (
                <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-[#1A6BFF]/50 hover:shadow-md transition-all cursor-pointer"
                  onClick={() => window.location.href = `/association/dashboard/category/${catId}/groups?org=${assignment.organization_id}&session=${s.session_number}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm ${completedSessions.includes(s.session_number) ? "bg-green-500" : "bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF]"}`}>
                        {completedSessions.includes(s.session_number) ? <CheckCircle size={16} /> : s.session_number}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{s.name}</div>
                        <div className="text-xs text-gray-400 capitalize">{s.session_type}</div>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-300" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SCHEDULE TAB ── */}
        {activeTab === "schedule" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Evaluation Schedule</h2>
              <div className="flex items-center gap-2">
                <a href="/api/templates?type=schedule" download
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
                  ↓ Template
                </a>
                <label className={`inline-flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold cursor-pointer hover:shadow-md ${importing ? "opacity-50" : ""}`}>
                  ↑ Upload / Update CSV
                  <input type="file" accept=".csv" className="hidden" disabled={importing} onChange={async (e) => {
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
                      return { session_number: cols[0], group_number: cols[1], scheduled_date: cols[2], start_time: cols[3], end_time: cols[4], location: cols[5], evaluators_required: cols[6] };
                    }).filter(r => r.session_number && r.scheduled_date);
                    const res = await fetch(`/api/categories/${catId}/schedule`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ schedule: rows }),
                    });
                    const data = await res.json();
                    setUploadMsg(data.success ? `✓ ${data.count} entries uploaded` : "Error: " + data.error);
                    if (data.success) { refetchSchedule(); refetchRankings(); }
                    setImporting(false);
                    e.target.value = "";
                    setTimeout(() => setUploadMsg(""), 4000);
                  }} />
                </label>
              </div>
            </div>
            {uploadMsg && <div className={`px-4 py-2.5 rounded-lg text-sm font-medium ${uploadMsg.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{uploadMsg}</div>}
            {schedule.length === 0 ? (
              <div className="py-12 text-center bg-white border border-dashed border-gray-200 rounded-xl text-gray-400">
                <Calendar size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No schedule uploaded yet — use the Upload CSV button above</p>
              </div>
            ) : (
              Object.entries(schedule.reduce((acc, e) => { const k = e.session_number; if (!acc[k]) acc[k] = []; acc[k].push(e); return acc; }, {}))
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([sessionNum, entries]) => {
                  const sess = sessions.find(s => String(s.session_number) === String(sessionNum));
                  return (
                    <div key={sessionNum} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-center text-white text-xs font-bold">{sessionNum}</div>
                          <span className="text-sm font-semibold text-gray-700">Session {sessionNum}{sess ? ` · ${sess.name} · ${sess.session_type} · ${sess.weight_percentage}%` : ""}</span>
                        </div>
                        <a href={`/association/dashboard/category/${catId}/groups?org=${assignment.organization_id}&session=${sessionNum}`}
                          className="text-xs px-3 py-1.5 bg-[#1A6BFF]/10 text-[#1A6BFF] rounded-lg font-medium hover:bg-[#1A6BFF]/20">
                          Manage Groups →
                        </a>
                      </div>
                      <table className="w-full text-sm">
                        <thead><tr className="text-xs text-gray-500 uppercase border-b border-gray-100">
                          <th className="px-4 py-2 text-left">Group</th>
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-left">Time</th>
                          <th className="px-4 py-2 text-left">Location</th>
                          <th className="px-4 py-2 text-left">Evaluators</th>
                          <th className="px-4 py-2 text-left">Check-in Code</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {entries.sort((a, b) => (a.group_number || 0) - (b.group_number || 0)).map((e, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 font-medium text-gray-700">{e.group_number ? `Group ${e.group_number}` : "—"}</td>
                              <td className="px-4 py-2.5 text-gray-600">{e.scheduled_date?.toString().split("T")[0]}</td>
                              <td className="px-4 py-2.5 text-gray-500">{e.start_time && e.end_time ? `${e.start_time} – ${e.end_time}` : "—"}</td>
                              <td className="px-4 py-2.5 text-gray-500">{e.location || "—"}</td>
                              <td className="px-4 py-2.5 text-gray-500">{sess?.session_type === "testing" ? 0 : (e.evaluators_required || 4)}</td>
                              <td className="px-4 py-2.5">{e.checkin_code ? <CopyCode code={e.checkin_code} scheduleId={e.id} /> : <span className="text-gray-300 text-xs">—</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })
            )}
          </div>
        )}

        {/* ── SESSIONS TAB ── */}
        {volunteerModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
          <div style={{background:"#fff",borderRadius:"16px",padding:"28px",width:"100%",maxWidth:"480px",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
            <h3 style={{margin:"0 0 4px",fontSize:"16px",fontWeight:"600",color:"#111"}}>Assign Volunteers — Session {volunteerModal.sessionNum}</h3>
            <p style={{margin:"0 0 16px",fontSize:"13px",color:"#666"}}>Enter email addresses separated by commas or new lines. They'll receive the check-in links for all groups in this session.</p>
            <textarea
              value={volunteerEmails}
              onChange={e => setVolunteerEmails(e.target.value)}
              placeholder={"volunteer1@email.com, volunteer2@email.com"}
              style={{width:"100%",minHeight:"100px",padding:"10px 12px",border:"1px solid #e5e7eb",borderRadius:"8px",fontSize:"13px",fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",outline:"none"}}
            />
            {volunteerMsg && <div style={{marginTop:"8px",fontSize:"13px",color: volunteerMsg.startsWith("Error") ? "#dc2626" : "#16a34a",fontWeight:"500"}}>{volunteerMsg}</div>}
            <div style={{display:"flex",gap:"8px",marginTop:"16px",justifyContent:"flex-end"}}>
              <button onClick={() => { setVolunteerModal(null); setVolunteerEmails(""); setVolunteerMsg(""); }} style={{padding:"8px 16px",border:"1px solid #e5e7eb",borderRadius:"8px",fontSize:"13px",cursor:"pointer",background:"#fff"}}>Cancel</button>
              <button onClick={sendVolunteers} disabled={volunteerSending || !volunteerEmails.trim()} style={{padding:"8px 16px",background:"#1A6BFF",color:"#fff",border:"none",borderRadius:"8px",fontSize:"13px",fontWeight:"500",cursor:"pointer",opacity: volunteerSending ? 0.6 : 1}}>{volunteerSending ? "Sending..." : "Send Invites"}</button>
            </div>
          </div>
        </div>
      )}

        {activeTab === "schedule" && <ManualScoreUpload catId={catId} sessions={sessions} scoringCategories={scoringCategories} />}

        {activeTab === "sessions" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Sessions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessions.map(s => {
                const isComplete = completedSessions.includes(s.session_number);
                return (
                  <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm ${isComplete ? "bg-green-500" : "bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF]"}`}>
                          {isComplete ? <CheckCircle size={16} /> : s.session_number}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900">{s.name}</div>
                          <div className="text-xs text-gray-400 capitalize">{s.session_type}</div>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-[#1A6BFF]">{s.weight_percentage}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                      <div className={`h-full rounded-full ${isComplete ? "bg-green-500" : "bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF]"}`} style={{ width: `${s.weight_percentage}%` }} />
                    </div>

                    {/* Testing upload */}
                    {s.session_type === "testing" && (
                      <div className="mt-3 pt-3 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-xs text-gray-500">Upload testing results</span>
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer bg-[#1A6BFF] text-white hover:bg-[#0F4FCC]">
                            ↑ Upload CSV
                            <input type="file" accept=".csv,.txt" className="hidden" onChange={async (e) => {
                              const file = e.target.files[0]; if (!file) return;
                              const text = await file.text();
                              const lines = text.trim().split("\n").filter(l => l.trim());
                              const hasHeader = lines[0].toLowerCase().includes("first") || lines[0].toLowerCase().includes("name");
                              const results = (hasHeader ? lines.slice(1) : lines).map(line => {
                                const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
                                return { first_name: cols[0], last_name: cols[1], overall_rank: cols[2] };
                              }).filter(r => r.first_name && r.last_name && r.overall_rank);
                              const res = await fetch(`/api/categories/${catId}/testing-upload`, {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ session_number: s.session_number, results }),
                              });
                              const data = await res.json();
                              alert(data.success ? `✓ ${data.matched} matched${data.skipped > 0 ? `, ${data.skipped} skipped` : ""}` : "Error: " + data.error);
                              refetchRankings();
                              e.target.value = "";
                            }} />
                          </label>
                        </div>
                      </div>
                    )}

                    {/* Score manager — only if director can edit */}
                    {canEditScores && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">{isComplete ? "Scores entered" : "No scores yet"}</span>
                          <button onClick={() => loadScoreManager(s.session_number)}
                            className="text-xs px-2 py-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            Manage Scores
                          </button>
                        </div>
                        {scoreManagerOpen === s.session_number && (
                          <div className="mt-2 bg-gray-50 rounded-xl p-3 space-y-2">
                            {scoreManagerData.length === 0 ? (
                              <div className="text-xs text-gray-400">No scores entered</div>
                            ) : scoreManagerData.map(sc => (
                              <div key={sc.evaluator_id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                                <div>
                                  <div className="text-xs font-medium text-gray-900">{sc.evaluator_name}</div>
                                  <div className="text-xs text-gray-400">{sc.athletes_scored} players scored</div>
                                </div>
                                <button onClick={() => clearEvaluatorScores(s.session_number, sc.evaluator_id, sc.evaluator_name)}
                                  className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded-lg hover:bg-red-100">Delete</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ATHLETES TAB ── */}
        {activeTab === "athletes" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Athletes <span className="text-gray-400 font-normal">({athletes.length})</span></h2>
              <div className="flex items-center gap-2">
                <a href="/api/templates?type=athletes" download
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
                  ↓ Template
                </a>
                <label className={`inline-flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold cursor-pointer hover:shadow-md ${importing ? "opacity-50" : ""}`}>
                  ↑ Upload CSV
                  <input type="file" accept=".csv" className="hidden" disabled={importing} onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    setImporting(true);
                    const text = await file.text();
                    const lines = text.trim().split("\n");
                    const headers = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/^"|"$/g, ""));
                    const hasHeader = headers.some(h => ["first_name","first","last_name","last"].includes(h));
                    const dataLines = hasHeader ? lines.slice(1) : lines;
                    const rows = dataLines.map(line => {
                      const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
                      if (hasHeader) {
                        const obj = {};
                        headers.forEach((h, i) => obj[h] = cols[i]);
                        return {
                          first_name: obj.first_name || obj.first || "",
                          last_name: obj.last_name || obj.last || "",
                          external_id: obj["hc#"] || obj.hc || obj.external_id || obj.id || "",
                          position: obj.position || "",
                          birth_year: obj.birth_year || obj.dob || "",
                        };
                      }
                      return { first_name: cols[0], last_name: cols[1], external_id: cols[2], position: cols[3], birth_year: cols[4] };
                    }).filter(r => r.first_name && r.last_name);
                    const res = await fetch(`/api/categories/${catId}/athletes`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ athletes: rows }),
                    });
                    const data = await res.json();
                    setUploadMsg(data.inserted !== undefined ? `✓ ${data.inserted} athletes imported, ${data.skipped || 0} skipped` : "Error: " + data.error);
                    if (data.inserted !== undefined) { refetchAthletes(); refetchRankings(); }
                    setImporting(false);
                    e.target.value = "";
                    setTimeout(() => setUploadMsg(""), 4000);
                  }} />
                </label>
              </div>
            </div>
            {uploadMsg && <div className={`px-4 py-2.5 rounded-lg text-sm font-medium ${uploadMsg.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{uploadMsg}</div>}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">HC#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Birth Year</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {athletes.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">No athletes yet — upload a CSV above</td></tr>
                  ) : athletes.map((a, i) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{a.last_name}, {a.first_name}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{a.external_id || "—"}</td>
                      <td className="px-4 py-3">{a.position ? <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${POSITION_COLORS[a.position] || "bg-gray-100 text-gray-600"}`}>{a.position}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-500">{a.birth_year || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── REPORTS TAB ── */}
        {activeTab === "reports" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Reports</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Overall Rankings */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-center">
                    <BarChart3 size={18} className="text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Overall Rankings</div>
                    <div className="text-xs text-gray-400">All athletes, all sessions, final rank</div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-4">Exports current rankings with session scores and weighted totals for all {rankedAthletes.length} athletes.</p>
                <button onClick={exportRankingsCSV} disabled={!hasScores}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:shadow-md transition-shadow">
                  <Download size={14} /> Download CSV
                </button>
                {!hasScores && <p className="text-xs text-gray-400 mt-2 text-center">No scores entered yet</p>}
              </div>

              {/* Session Summaries */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
                    <Trophy size={18} className="text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Session Summaries</div>
                    <div className="text-xs text-gray-400">Per-session score breakdown</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {sessions.map(s => {
                    const isComplete = completedSessions.includes(s.session_number);
                    return (
                      <div key={s.id} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">Session {s.session_number} — {s.name}</span>
                        <button onClick={() => exportSessionSummary(s.session_number)} disabled={!isComplete}
                          className="text-xs px-3 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
                          <Download size={11} /> CSV
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Player Report Cards */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                    <Users size={18} className="text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Player Report Cards</div>
                    <div className="text-xs text-gray-400">Individual player score history</div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-4">One row per player with all session scores, rank history, and notes.</p>
                <button
                  onClick={() => {
                    const headers = ["Rank", "First", "Last", "HC#", "Position", ...sessions.map(s => `S${s.session_number}`), "Total", "Rank After S1", "Rank After S2", "Rank After S3", "Rank After S4"];
                    const rows = rankedAthletes.map(a => [
                      a.rank, a.first_name, a.last_name, a.external_id || "", a.position || "",
                      ...sessions.map(s => a.session_scores?.[s.session_number]?.normalized_score?.toFixed(1) || ""),
                      a.weighted_total?.toFixed(1) || "",
                      ...(a.rank_history || []),
                    ]);
                    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const el = document.createElement("a");
                    el.href = url;
                    el.download = `${assignment?.category_name}_player_reports.csv`;
                    el.click();
                  }}
                  disabled={!hasScores}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:shadow-md transition-shadow">
                  <Download size={14} /> Download CSV
                </button>
              </div>

              {/* Team Select — placeholder until team generation is built */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center">
                    <ClipboardList size={18} className="text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Team Select</div>
                    <div className="text-xs text-gray-400">Final team assignments</div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-4">Available once all sessions are scored and teams are generated by the association admin.</p>
                <button disabled className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-400 rounded-lg text-sm font-semibold cursor-not-allowed">
                  <Download size={14} /> Available after team generation
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === "settings" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Category Settings</h2>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {[
                { label: "Score Scale", desc: "Maximum score per category", value: `Out of ${category?.scoring_scale || 10}` },
                { label: "Score Increments", desc: "Minimum score step", value: category?.scoring_increment || 0.5 },
                { label: "Position Tagging", desc: "Tag athletes by Forward / Defense / Goalie", value: category?.position_tagging ? "On" : "Off" },
                { label: "Evaluators Required", desc: "Per group per session", value: category?.evaluators_required || 4 },
                { label: "Directors Can Edit Scores", desc: "Set by association admin", value: category?.director_can_edit_scores ? "Enabled" : "Disabled" },
              ].map(({ label, desc, value }) => (
                <div key={label} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <div className="text-sm font-medium text-gray-700">{label}</div>
                    <div className="text-xs text-gray-400">{desc}</div>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{value}</span>
                </div>
              ))}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-700">To change settings, contact your association admin.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function DirectorDashboardPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" /></div>}>
        <DirectorDashboardInner />
      </Suspense>
    </QueryClientProvider>
  );
}






