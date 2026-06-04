"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { analyzeTeams, cutsToSizes, detectNaturalTiers } from "@/lib/teamInsights";
import {
  ArrowLeft, Users, Calendar, Trophy, Settings, BarChart3,
  Upload, Plus, ChevronRight, CheckCircle, Clock, Zap,
  Download, FileText, LogOut, Search, X
} from "lucide-react";
import { OrgBrandIcon } from "@/components/OrgBrandIcon";
import RankBadge from "@/components/RankBadge";
import CopyCode from "@/components/CopyCode";
import ScoreManager from "@/components/ScoreManager";
import ManualScoreUpload from "@/components/ManualScoreUpload";
import CSVMappingModal from "@/components/CSVMappingModal";
import ScoreEditor from "@/components/ScoreEditor";
import PlayerComparison from "@/components/PlayerComparison";
import { generateICS, downloadICS } from "@/lib/calendar";

const POSITION_COLORS = {
  forward: "bg-blue-100 text-blue-700",
  defense: "bg-purple-100 text-purple-700",
  goalie: "bg-amber-100 text-amber-700",
};
const POSITION_SHORT = { forward: "F", defense: "D", goalie: "G" };

/**
 * Shared dashboard used by both the association category page and the director
 * dashboard. The two routes pass their own header context plus a `role`; from
 * `role` we derive `canManage` which gates every editing / management
 * affordance. Directors get the exact same read-only view (all tabs, scores
 * read-only, settings display-only).
 */
export default function CategoryDashboard({
  catId,
  orgId,
  role,
  categoryName,
  orgName,
  status,
  onSignOut,
}) {
  const canManage = role === "association";

  const [activeTab, setActiveTab] = useState("rankings");
  const [rankingsView, setRankingsView] = useState("skaters"); // skaters | goalies
  const [scoresOpen, setScoresOpen] = useState(false);
  const [analysisView, setAnalysisView] = useState("insights"); // insights | reports
  // Shared search box used by Rankings + Athletes tabs. Client-side filter
  // over the already-loaded list — no API call needed since both tabs hold
  // the full athlete set in memory.
  const [tableSearch, setTableSearch] = useState("");
  const matchesSearch = (a) => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return true;
    return (a.first_name || "").toLowerCase().includes(q)
        || (a.last_name || "").toLowerCase().includes(q)
        || (a.external_id || "").toLowerCase().includes(q);
  };
  const queryClient = useQueryClient();
  const [positionFilter, setPositionFilter] = useState("all");
  const [compareIds, setCompareIds] = useState([]);
  const [showCompare, setShowCompare] = useState(false);
  const [sortBy, setSortBy] = useState(null); // { key, dir }
  const [importing, setImporting] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [showDirectorModal, setShowDirectorModal] = useState(false);
  const [directorForm, setDirectorForm] = useState({ name: "", email: "" });
  const [directorMsg, setDirectorMsg] = useState("");
  const [scoreManagerOpen, setScoreManagerOpen] = useState(null);
  const [volunteerModal, setVolunteerModal] = useState(null); // { sessionNum, entries }
  const [volunteerEmails, setVolunteerEmails] = useState("");
  const [volunteerSending, setVolunteerSending] = useState(false);
  const [volunteerMsg, setVolunteerMsg] = useState("");
  const [scoreManagerData, setScoreManagerData] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [athleteForm, setAthleteForm] = useState({ first_name: "", last_name: "", external_id: "", position: "", birth_year: "" });
  const [athleteSaving, setAthleteSaving] = useState(false);
  const [athleteMsg, setAthleteMsg] = useState("");
  const [csvPending, setCsvPending] = useState(null);
  const [teamCount, setTeamCount] = useState(2);

  const { data: setupData } = useQuery({
    queryKey: ["category-setup", catId],
    queryFn: async () => { const res = await fetch(`/api/categories/${catId}/setup`); return res.json(); },
    enabled: !!catId,
  });

  const { data: rankingsData, refetch: refetchRankings } = useQuery({
    queryKey: ["category-rankings", catId],
    queryFn: async () => { const res = await fetch(`/api/categories/${catId}/rankings`); return res.json(); },
    enabled: !!catId,
    refetchInterval: 120000,
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

  const { data: directorsData, refetch: refetchDirectors } = useQuery({
    queryKey: ["category-directors", catId],
    queryFn: async () => { const res = await fetch(`/api/categories/${catId}/invite-director`); return res.json(); },
    enabled: !!catId && canManage,
  });

  const { data: checkinSummary } = useQuery({
    queryKey: ["checkin-summary", catId],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/checkin-summary`);
      if (!res.ok) return { sessions: [] };
      return res.json();
    },
    enabled: !!catId,
    refetchInterval: 15000,
  });

  const sessions = setupData?.sessions || [];
  const scoringCategories = setupData?.scoringCategories || [];
  const category = setupData?.category;
  const rankedAthletes = rankingsData?.athletes || [];
  const goalieAthletes = rankingsData?.goalies || [];
  const athletes = athletesData?.athletes || [];
  const schedule = scheduleData?.schedule || [];
  const hasScores = rankingsData?.has_scores || false;
  const phase = rankingsData?.phase || "pre_session";
  const completedSessions = rankingsData?.completed_sessions || [];
  const inProgressSessions = rankingsData?.in_progress_sessions || [];
  const sessionStatus = rankingsData?.session_status || {};
  const hasPositions = rankedAthletes.some(a => a.position);
  const filteredAthletes = positionFilter === "all" ? rankedAthletes : rankedAthletes.filter(a => a.position === positionFilter);
  const sortedAthletes = sortBy ? [...filteredAthletes].sort((a, b) => {
    const dir = sortBy.dir === 'asc' ? 1 : -1;
    if (sortBy.key === 'total') return dir * ((a.weighted_total || 0) - (b.weighted_total || 0));
    if (sortBy.key === 'rank') return dir * (a.rank - b.rank);
    if (sortBy.key === 'first') return dir * (a.first_name || "").localeCompare(b.first_name || "");
    if (sortBy.key === 'last') return dir * (a.last_name || "").localeCompare(b.last_name || "");
    const aScore = a.session_scores?.[sortBy.key]?.normalized_score ?? -1;
    const bScore = b.session_scores?.[sortBy.key]?.normalized_score ?? -1;
    return dir * (aScore - bScore);
  }) : filteredAthletes;
  const toggleSort = (key) => setSortBy(prev => prev?.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' });
  const sortIcon = (key) => sortBy?.key === key ? <span className="ml-1 font-bold text-[#0b5cd6]">{sortBy.dir === 'desc' ? '↓' : '↑'}</span> : <span className="ml-1 text-gray-300 opacity-40">↕</span>;

  const upcomingSchedule = schedule.filter(s => s.scheduled_date >= new Date().toISOString().split("T")[0]);

  // Team Insights — runs client-side on already-fetched rankings. Sessions come
  // from setupData (the `sessions` variable), not rankingsData, in this codebase.
  const rankedForInsights = (rankingsData?.athletes || []).filter(a => a.weighted_total != null);
  const insights = useMemo(() => {
    const filtered = (rankingsData?.athletes || []).filter(a => a.weighted_total != null);
    const n = filtered.length;
    if (!n || teamCount < 2) return { breaks: [], bubbles: [] };
    const base = Math.floor(n / teamCount), rem = n % teamCount;
    const sizes = Array.from({ length: teamCount }, (_, i) => base + (i < rem ? 1 : 0));
    return analyzeTeams(filtered, sessions, sizes, {});
  }, [rankingsData?.athletes, sessions, teamCount]);

  const naturalTiers = useMemo(
    () => detectNaturalTiers((rankingsData?.athletes || []).filter(a => a.weighted_total != null), {}),
    [rankingsData?.athletes]
  );

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

  const exportRankingsCSV = () => {
    const headers = ["Rank", "First", "Last", "Position", "HC#", ...sessions.map(s => `S${s.session_number} (${s.weight_percentage}%)`), "Total"];
    const rows = rankedAthletes.map(a => [a.rank, a.first_name, a.last_name, a.position || "", a.external_id || "", ...sessions.map(s => a.session_scores?.[s.session_number]?.normalized_score?.toFixed(1) || ""), a.weighted_total?.toFixed(1) || ""]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${category?.name || "rankings"}_rankings.csv`; a.click();
  };

  const exportSessionSummary = (sessionNum) => {
    const sessionAthletes = rankedAthletes.filter(a => a.session_scores?.[sessionNum]);
    const headers = ["Rank", "First", "Last", "Score", "Evaluators"];
    const rows = sessionAthletes.map(a => { const sd = a.session_scores[sessionNum]; return [a.rank, a.first_name, a.last_name, sd.normalized_score?.toFixed(1), sd.evaluator_count || 1]; });
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a"); el.href = url; el.download = `session_${sessionNum}_summary.csv`; el.click();
  };

  const handleCSVConfirm = async (mapping) => {
    setCsvPending(null);
    setImporting(true);
    const rows = csvPending.rawRows.map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const get = col => { if (!col) return ''; const idx = csvPending.headers.indexOf(col); return idx >= 0 ? cols[idx] : ''; };
      return { first_name: get(mapping.first_name), last_name: get(mapping.last_name), external_id: get(mapping.external_id), position: get(mapping.position), birth_year: get(mapping.birth_year), parent_email: get(mapping.parent_email) };
    }).filter(r => r.first_name && r.last_name);
    const res = await fetch(`/api/categories/${catId}/athletes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ athletes: rows }) });
    const data = await res.json();
    setAthleteMsg(`${data.imported ?? data.inserted ?? 0} imported, ${data.updated ?? 0} updated, ${data.skipped ?? 0} skipped`);
    refetchAthletes(); refetchRankings(); setImporting(false); setTimeout(() => setAthleteMsg(''), 4000);
  };

  const tabs = [
    { id: "rankings", label: "Rankings", icon: BarChart3 },
    { id: "schedule", label: "Schedule", icon: Calendar },
    { id: "analysis", label: "Analysis", icon: FileText },
    { id: "athletes", label: "Athletes", icon: Users },
  ];

  if (!catId) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0b5cd6]" /></div>;

  const displayName = category?.name || categoryName;
  const displayStatus = category?.status ?? status;
  // Big title tracks the active tab (sample-6 look: group in the kicker, section as the headline)
  const TAB_TITLES = { rankings: "Rankings", schedule: "Schedule", analysis: "Analysis", athletes: "Athletes", settings: "Settings" };
  const activeTitle = TAB_TITLES[activeTab] || "Rankings";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          {canManage ? (
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="min-w-0">
                <a href={`/association/dashboard?org=${orgId}`} className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 transition-opacity mb-2">
                  <ArrowLeft size={13} /> {orgName} · {displayName} Evaluation
                </a>
                <div className="flex items-end gap-4 flex-wrap">
                  <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">{activeTitle}</h1>
                  <OrgBrandIcon orgId={orgId} size={44} />
                  <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-bold tracking-[0.14em] uppercase text-accent bg-accent-soft px-3 py-1.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Live · refreshes 30s
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap text-sm text-gray-500 font-medium">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${displayStatus === "active" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{displayStatus === "active" ? "Active" : "Setup"}</span>
                  <span><b className="text-ink">{athletes.length}</b> athletes · <b className="text-ink">{sessions.length}</b> sessions</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {directorsData?.directors?.length > 0 ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                    <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-green-700">{directorsData.directors.map(d => d.name).join(', ')}</span>
                    <button onClick={() => setActiveTab('settings')} className="text-xs text-green-600 hover:text-green-800 underline ml-1">change</button>
                  </div>
                ) : (
                  <button onClick={() => setActiveTab('settings')} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow">
                    <Users size={14} /> Assign Director
                  </button>
                )}
                <a href={`/association/dashboard/category/${catId}/setup?cat=${catId}&org=${orgId}`} className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">
                  <Settings size={14} /> Edit Setup
                </a>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="min-w-0">
                <div className="font-display text-xs font-bold tracking-[0.2em] uppercase text-accent mb-2">{orgName} · {displayName} Evaluation</div>
                <div className="flex items-end gap-4 flex-wrap">
                  <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">{activeTitle}</h1>
                  <OrgBrandIcon orgId={orgId} size={44} />
                  <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-bold tracking-[0.14em] uppercase text-accent bg-accent-soft px-3 py-1.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Live · refreshes 30s
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap text-sm text-gray-500 font-medium">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${displayStatus === "active" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{displayStatus === "active" ? "Active" : "Setup"}</span>
                  <span><b className="text-ink">{athletes.length}</b> athletes · <b className="text-ink">{sessions.length}</b> sessions</span>
                  <span className="text-gray-300">· Director</span>
                </div>
              </div>
              <button onClick={onSignOut}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                <LogOut size={15} /> Sign out
              </button>
            </div>
          )}
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-7 overflow-x-auto border-b border-[#ededeb]">
            {tabs.map(tab => { const Icon = tab.icon; return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`font-display flex items-center gap-2 pb-3.5 pt-1 text-sm font-bold tracking-wide whitespace-nowrap transition-colors border-b-[3px] -mb-px ${activeTab === tab.id ? "border-accent text-ink" : "border-transparent text-gray-400 hover:text-gray-700"}`}>
                <Icon size={14} /> {tab.label}
              </button>
            ); })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {activeTab === "rankings" && (
          <div className="space-y-5">
            {/* Rankings hub control row */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                {[{ id: "skaters", label: "Skaters" }, { id: "goalies", label: "Goalies" }].map(v => (
                  <button key={v.id} onClick={() => setRankingsView(v.id)} disabled={scoresOpen} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${rankingsView === v.id && !scoresOpen ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"} ${scoresOpen ? "opacity-40 cursor-not-allowed" : ""}`}>{v.label}</button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setScoresOpen(v => !v)} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold ${scoresOpen ? "border border-gray-300 text-gray-700 hover:bg-gray-50" : "bg-[#0b5cd6] text-white hover:bg-[#0F4FCC]"}`}>
                  {scoresOpen ? "← Back to Rankings" : "Edit Scores"}
                </button>
                <a href={`/association/dashboard/category/${catId}/teams?org=${orgId}`} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow">Create Final Teams →</a>
              </div>
            </div>

            {scoresOpen ? (
              <ScoreEditor catId={catId} canEdit={canManage || role === "director"} requireReason={role === "director"} />
            ) : rankingsView === "goalies" ? (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <div>
                    <h3 className="font-display text-lg font-extrabold tracking-tight text-ink">Goalie Rankings</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Ranked independently — goalie categories only</p>
                  </div>
                </div>
                {goalieAthletes.length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-gray-400">No goalies in this category yet. Make sure goalies are tagged with position = goalie in the roster.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">Rank</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">First</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last</th>
                          {sessions.map(s => <th key={s.session_number} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">S{s.session_number}<span className="block text-gray-400 font-normal normal-case">{s.weight_percentage}%</span></th>)}
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {goalieAthletes.map(a => (
                          <tr key={a.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3"><RankBadge rank={a.rank} tied={goalieAthletes.filter(x => x.rank === a.rank).length > 1} /></td>
                            <td className="px-4 py-3 text-gray-900 font-medium">{a.first_name}</td>
                            <td className="px-4 py-3 text-gray-900 font-semibold">{a.last_name}</td>
                            {sessions.map(s => { const sd = a.session_scores?.[s.session_number]; return <td key={s.session_number} className="px-4 py-3 text-center tabular-nums">{sd ? <span className="font-medium text-gray-900">{sd.normalized_score?.toFixed(1)}</span> : <span className="text-gray-200">—</span>}</td>; })}
                            <td className={`px-4 py-3 text-center font-display text-lg font-extrabold tabular-nums ${a.rank === 1 ? "text-accent" : "text-ink"}`}>{a.weighted_total > 0 ? a.weighted_total?.toFixed(1) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
            <>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-3">
                <div>
                  <h3 className="font-display text-lg font-extrabold tracking-tight text-ink">{phase === "pre_session" ? "Roster - Alphabetical" : "Live Rankings"}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{phase === "pre_session" ? "Rankings update after Session 1 scores are entered" : `${completedSessions.length} of ${sessions.length} sessions - refreshes every 30s`}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={tableSearch}
                      onChange={e => setTableSearch(e.target.value)}
                      placeholder="Search name or HC#"
                      className="pl-8 pr-7 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30 w-44"
                    />
                    {tableSearch && (
                      <button onClick={() => setTableSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Clear search">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  {hasPositions && category?.position_tagging && (
                    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                      {["all", "forward", "defense", "goalie"].map(pos => (
                        <button key={pos} onClick={() => setPositionFilter(pos)} className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${positionFilter === pos ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{pos === "all" ? "All" : POSITION_SHORT[pos]}</button>
                      ))}
                    </div>
                  )}
                  {hasScores && <button onClick={exportRankingsCSV} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50"><Download size={12} /> Export CSV</button>}
                  {compareIds.length >= 2 && (
                    <button onClick={() => setShowCompare(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0b5cd6] text-white rounded-lg text-xs font-semibold hover:bg-[#0F4FCC]">
                      Compare ({compareIds.length})
                    </button>
                  )}
                  {compareIds.length > 0 && (
                    <button onClick={() => setCompareIds([])} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-2 py-3 w-8"></th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12 cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort('rank')}>Rank{sortIcon('rank')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort('first')}>First{sortIcon('first')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort('last')}>Last{sortIcon('last')}</th>
                      {hasPositions && category?.position_tagging && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pos</th>}
                      {sessions.map(s => <th key={s.session_number} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort(s.session_number)}>S{s.session_number}{sortIcon(s.session_number)}<span className="block text-gray-400 font-normal normal-case">{s.weight_percentage}%</span></th>)}
                      {hasScores && <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort('total')}>Total{sortIcon('total')}</th>}
                      {hasScores && <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Track</th>}
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedAthletes.filter(matchesSearch).length === 0 && tableSearch && (
                      <tr><td colSpan={(hasScores ? (hasPositions && category?.position_tagging ? 6 + sessions.length : 5 + sessions.length) : (hasPositions && category?.position_tagging ? 4 + sessions.length : 3 + sessions.length)) + 1} className="px-4 py-8 text-center text-gray-400 text-sm">No athletes match "{tableSearch}"</td></tr>
                    )}
                    {sortedAthletes.filter(matchesSearch).map(a => (
                      <tr key={a.id} className={`hover:bg-gray-50 ${compareIds.includes(a.id) ? "bg-blue-50/50" : a.rank === 1 ? "bg-accent-soft" : ""}`}>
                        <td className="px-2 py-3">
                          <input type="checkbox" checked={compareIds.includes(a.id)} onChange={e => { setCompareIds(prev => e.target.checked ? [...prev, a.id] : prev.filter(id => id !== a.id)); }} className="w-3.5 h-3.5 rounded border-gray-300 text-[#0b5cd6] focus:ring-[#0b5cd6]" />
                        </td>
                        <td className="px-4 py-3"><RankBadge rank={a.rank} tied={sortedAthletes.filter(x => x.rank === a.rank).length > 1} /></td>
                        <td className="px-4 py-3"><a href={`/player/report?athlete=${a.id}&cat=${catId}`} className="text-gray-900 font-medium hover:text-[#0b5cd6]">{a.first_name}</a></td>
                        <td className="px-4 py-3">
                          <a href={`/player/report?athlete=${a.id}&cat=${catId}`} className="text-gray-900 font-semibold hover:text-[#0b5cd6]">{a.last_name}</a>
                          {a.incomplete && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium" title={`Attended ${a.sessions_attended} of ${a.sessions_total} sessions — prorated`}>*</span>}
                        </td>
                        {hasPositions && category?.position_tagging && <td className="px-4 py-3">{a.position ? <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${POSITION_COLORS[a.position] || "bg-gray-100 text-gray-600"}`}>{POSITION_SHORT[a.position] || a.position}</span> : <span className="text-gray-300">-</span>}</td>}
                        {sessions.map(s => { const sd = a.session_scores?.[s.session_number]; return <td key={s.session_number} className="px-4 py-3 text-center tabular-nums">{sd ? <span className="font-medium text-gray-900">{sd.normalized_score?.toFixed(1)}</span> : <span className="text-gray-200">-</span>}</td>; })}
                        {hasScores && <td className={`px-4 py-3 text-center font-display text-lg font-extrabold tabular-nums ${a.rank === 1 ? "text-accent" : "text-ink"}`}>{a.weighted_total?.toFixed(1) || "-"}</td>}
                        {hasScores && <td className="px-4 py-3 text-center">
                          {a.rank_history?.length > 0 ? (
                            <div className="flex items-center justify-center gap-0.5 flex-wrap">
                              {a.rank_history.map((r, i) => {
                                const prev = i > 0 ? a.rank_history[i - 1] : null;
                                const up = prev !== null && r < prev;
                                const dn = prev !== null && r > prev;
                                return (
                                  <span key={i} className="inline-flex items-center gap-0.5">
                                    {i > 0 && <span className={`text-xs font-bold leading-none ${up ? 'text-green-500' : dn ? 'text-red-400' : 'text-gray-300'}`}>{up ? '↑' : dn ? '↓' : '–'}</span>}
                                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${r <= 5 ? 'bg-green-100 text-green-700' : r <= 15 ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{r}</span>
                                  </span>
                                );
                              })}
                              {(() => {
                                const last = a.rank_history[a.rank_history.length - 1];
                                const upF = a.rank < last; const dnF = a.rank > last;
                                return (
                                  <span className="inline-flex items-center gap-0.5">
                                    <span className={`text-xs font-bold leading-none ${upF ? 'text-green-500' : dnF ? 'text-red-400' : 'text-gray-300'}`}>{upF ? '↑' : dnF ? '↓' : '–'}</span>
                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold bg-[#0b5cd6] text-white">{a.rank}</span>
                                  </span>
                                );
                              })()}
                            </div>
                          ) : <span className="text-gray-200 text-xs">—</span>}
                        </td>}
                        <td className="px-4 py-3 text-center">
                          <a href={`/player/report?athlete=${a.id}&cat=${catId}`} title="Open player report" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-accent hover:border-accent text-xs font-semibold transition-colors">
                            <FileText size={13} /> Report
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex justify-end">
              <a href={`/association/dashboard/category/${catId}/teams?org=${orgId}`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-xl font-semibold text-sm hover:shadow-lg transition-shadow">Create Final Teams →</a>
            </div>
            </>
            )}
          </div>
        )}

        {activeTab === "schedule" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">Schedule</h2>
              <div className="flex items-center gap-2">
                {schedule.length > 0 && (
                  <button onClick={() => {
                    const ics = generateICS(schedule.map(s => ({ ...s, category_name: category?.name, org_name: "" })));
                    downloadICS(ics, `${category?.name || "sessions"}_schedule.ics`);
                  }} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
                    <Calendar size={12} /> Add All to Calendar
                  </button>
                )}
                <a href="/api/templates?type=schedule" download className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">Template</a>
                <label className={`inline-flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold cursor-pointer ${importing ? "opacity-50" : ""}`}>
                  Upload / Update CSV
                  <input type="file" accept=".csv" className="hidden" disabled={importing} onChange={async (e) => {
                    const file = e.target.files[0]; if (!file) return;
                    setImporting(true);
                    const text = await file.text();
                    const lines = text.trim().split("\n").filter(l => l.trim());
                    const hasHeader = lines[0].toLowerCase().includes("session") || lines[0].toLowerCase().includes("date");
                    const dataLines = hasHeader ? lines.slice(1) : lines;
                    const rows = dataLines.map(line => { const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, "")); return { session_number: cols[0], group_number: cols[1], scheduled_date: cols[2], start_time: cols[3], end_time: cols[4], location: cols[5], evaluators_required: cols[6] }; }).filter(r => r.session_number && r.scheduled_date);
                    const res = await fetch(`/api/categories/${catId}/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule: rows }) });
                    const data = await res.json();
                    setUploadMsg(data.success ? `${data.inserted ?? data.count ?? 0} added, ${data.updated ?? 0} updated` : "Error: " + data.error);
                    if (data.success) { refetchSchedule(); refetchRankings(); }
                    setImporting(false); e.target.value = ""; setTimeout(() => setUploadMsg(""), 4000);
                  }} />
                </label>
              </div>
            </div>
            {uploadMsg && <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">{uploadMsg}</div>}
            {schedule.length === 0 ? (
              <div className="py-12 text-center bg-white border border-dashed border-gray-200 rounded-xl text-gray-400"><Calendar size={40} className="mx-auto mb-3 opacity-30" /><p className="text-sm">No schedule yet - upload a CSV above</p></div>
            ) : (
              Object.entries(schedule.reduce((acc, e) => { const k = String(e.session_number); if (!acc[k]) acc[k] = []; acc[k].push(e); return acc; }, {})).sort(([a], [b]) => Number(a) - Number(b)).map(([sessionNum, entries]) => {
                const sess = sessions.find(s => String(s.session_number) === String(sessionNum));
                const sStatus = sessionStatus[Number(sessionNum)] || "not_started";
                return (
                  <div key={sessionNum} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold ${sStatus === "complete" ? "bg-green-500" : sStatus === "in_progress" ? "bg-blue-500" : "bg-gradient-to-br from-[#0b5cd6] to-[#3b82f6]"}`}>{sessionNum}</div>
                        <span className="text-sm font-semibold text-gray-700">Session {sessionNum}{sess ? ` - ${sess.session_type} - ${sess.weight_percentage}%` : ""}</span>
                      </div>
                      <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <a href={`/association/dashboard/category/${catId}/groups?org=${orgId}&session=${sessionNum}`} className="text-xs px-3 py-1.5 bg-[#0b5cd6]/10 text-[#0b5cd6] rounded-lg font-medium hover:bg-[#0b5cd6]/20">Manage Groups</a>
                        <button onClick={() => { setVolunteerModal({ sessionNum, entries }); setVolunteerEmails(""); }} className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg font-medium hover:bg-blue-100">Assign Volunteers</button>
                        {sess?.session_type === "testing" && (
                          <label className="text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg font-medium hover:bg-green-100 cursor-pointer">
                            Upload Results
                            <input type="file" accept=".csv,.txt" className="hidden" onChange={async (e) => {
                              const file = e.target.files[0]; if (!file) return;
                              const text = await file.text();
                              const lines = text.trim().split('\n').filter(l => l.trim());
                              const hasHeader = lines[0].toLowerCase().includes('first') || lines[0].toLowerCase().includes('name');
                              const results = (hasHeader ? lines.slice(1) : lines).map(line => {
                                const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
                                return { first_name: cols[0], last_name: cols[1], overall_rank: cols[2] };
                              }).filter(r => r.first_name && r.last_name && r.overall_rank);
                              const res = await fetch(`/api/categories/${catId}/testing-upload`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ session_number: parseInt(sessionNum), results }),
                              });
                              const data = await res.json();
                              alert(data.success ? `${data.matched} matched${data.skipped > 0 ? `, ${data.skipped} skipped` : ''}` : 'Error: ' + data.error);
                              refetchRankings(); e.target.value = "";
                            }} />
                          </label>
                        )}
                        {Number(sessionNum) > 1 && <a href={`/association/dashboard/category/${catId}/flags?org=${orgId}&session=${sessionNum}`} className="text-xs px-3 py-1.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg font-medium hover:bg-amber-100">View Flags</a>}
                      </div>
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead><tr className="text-xs text-gray-500 uppercase border-b border-gray-100"><th className="px-4 py-2 text-left">Group</th><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-left">Time</th><th className="px-4 py-2 text-left">Location</th><th className="px-4 py-2 text-left">Evaluators</th><th className="px-4 py-2 text-left">Check-in</th></tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {entries.sort((a, b) => (a.group_number || 0) - (b.group_number || 0)).map((e, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-700">{e.group_number ? `Group ${e.group_number}` : "-"}</td>
                            <td className="px-4 py-2.5 text-gray-600">{e.scheduled_date?.toString().split("T")[0]}</td>
                            <td className="px-4 py-2.5 text-gray-500">{e.start_time && e.end_time ? `${e.start_time} - ${e.end_time}` : "-"}</td>
                            <td className="px-4 py-2.5 text-gray-500">{e.location || "-"}</td>
                            <td className="px-4 py-2.5 text-gray-500">{sess?.session_type === "testing" ? 0 : (e.evaluators_required || 4)}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                {e.checkin_code ? <CopyCode code={e.checkin_code} scheduleId={e.id} /> : <span className="text-gray-300 text-xs">-</span>}
                                {(() => {
                                  const cs = (checkinSummary?.sessions || []).find(x => x.schedule_id === e.id);
                                  return cs && Number(cs.total) > 0 ? (
                                    <span className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg">
                                      {cs.checked_in}/{cs.total} checked in
                                    </span>
                                  ) : null;
                                })()}
                              </div>
                            </td>
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
              <button onClick={sendVolunteers} disabled={volunteerSending || !volunteerEmails.trim()} style={{padding:"8px 16px",background:"#0b5cd6",color:"#fff",border:"none",borderRadius:"8px",fontSize:"13px",fontWeight:"500",cursor:"pointer",opacity: volunteerSending ? 0.6 : 1}}>{volunteerSending ? "Sending..." : "Send Invites"}</button>
            </div>
          </div>
        </div>
      )}

        {csvPending && <CSVMappingModal headers={csvPending.headers} onCancel={() => setCsvPending(null)} onConfirm={handleCSVConfirm} />}

        {activeTab === "schedule" && <ManualScoreUpload catId={catId} sessions={sessions} scoringCategories={scoringCategories} />}


        {activeTab === "athletes" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">Athletes ({athletes.length})</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <a href="/api/templates?type=athletes" download className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">Template</a>
                <label className={`inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-50 ${importing ? "opacity-50" : ""}`}>
                  <Upload size={14} /> {importing ? "Importing..." : "Upload CSV"}
                  <input type="file" accept=".csv" className="hidden" disabled={importing} onChange={async (e) => {
                    const file = e.target.files[0]; if (!file) return;
                    const text = await file.text();
                    const csvLines = text.replace(/\r\n/g,'\n').trim().split('\n').filter(l=>l.trim());
                    if (csvLines.length < 2) return;
                    const rawHeaders = csvLines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,''));
                    const rawRows = csvLines.slice(1).filter(l=>l.trim());
                    setCsvPending({ headers: rawHeaders, rawRows });
                    e.target.value='';
                  }} />
                </label>
                <button onClick={() => setShowAdd(!showAdd)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold"><Plus size={14} /> Add Player</button>
              </div>
            </div>
            {athleteMsg && <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">{athleteMsg}</div>}

            {/* Parent Notifications */}
            {athletes.length > 0 && (() => {
              const withEmail = athletes.filter(a => a.parent_email);
              return (
                <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Parent Notifications</div>
                    <div className="text-xs text-gray-400 mt-0.5">{withEmail.length} of {athletes.length} athletes have parent emails</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        if (!confirm(`Send welcome/onboarding email to ${withEmail.length} parents?`)) return;
                        const res = await fetch(`/api/categories/${catId}/notify-parents`, {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "onboarding" }),
                        });
                        const data = await res.json();
                        setAthleteMsg(data.success ? `Welcome email sent to ${data.sent} parents` : "Failed to send");
                        setTimeout(() => setAthleteMsg(""), 5000);
                      }}
                      disabled={!withEmail.length}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#0b5cd6] text-white rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-[#0F4FCC]"
                    >
                      Send Welcome Email
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Send evaluation schedule to ${withEmail.length} parents? (Only athletes with group assignments will receive it)`)) return;
                        const res = await fetch(`/api/categories/${catId}/notify-parents`, {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "schedule" }),
                        });
                        const data = await res.json();
                        setAthleteMsg(data.success ? `Schedule sent to ${data.sent} parents (${data.skipped} skipped — no group assignment)` : "Failed to send");
                        setTimeout(() => setAthleteMsg(""), 5000);
                      }}
                      disabled={!withEmail.length}
                      className="inline-flex items-center gap-1.5 px-3 py-2 border border-[#0b5cd6] text-[#0b5cd6] rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-blue-50"
                    >
                      Push Schedule
                    </button>
                  </div>
                </div>
              );
            })()}

            {showAdd && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Add Player</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  {[{ key: "first_name", label: "First Name *" }, { key: "last_name", label: "Last Name *" }, { key: "external_id", label: "HC#" }, { key: "birth_year", label: "Birth Year" }].map(({ key, label }) => (
                    <div key={key}><label className="block text-xs font-medium text-gray-500 mb-1">{label}</label><input type="text" value={athleteForm[key]} onChange={e => setAthleteForm(f => ({ ...f, [key]: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]" /></div>
                  ))}
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Position</label>
                    <select value={athleteForm.position} onChange={e => setAthleteForm(f => ({ ...f, position: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]">
                      <option value="">-</option><option value="forward">Forward</option><option value="defense">Defense</option><option value="goalie">Goalie</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowAdd(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Cancel</button>
                  <button onClick={async () => {
                    if (!athleteForm.first_name || !athleteForm.last_name) return;
                    setAthleteSaving(true);
                    await fetch(`/api/categories/${catId}/athletes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ athletes: [athleteForm] }) });
                    setAthleteMsg(`${athleteForm.first_name} ${athleteForm.last_name} added`);
                    setAthleteForm({ first_name: "", last_name: "", external_id: "", position: "", birth_year: "" });
                    setShowAdd(false); refetchAthletes(); refetchRankings(); setAthleteSaving(false); setTimeout(() => setAthleteMsg(""), 3000);
                  }} disabled={!athleteForm.first_name || !athleteForm.last_name || athleteSaving} className="px-5 py-2 bg-[#0b5cd6] text-white rounded-lg text-sm font-semibold disabled:opacity-50">{athleteSaving ? "Saving..." : "Add Player"}</button>
                </div>
              </div>
            )}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {athletes.length > 0 && (
                <div className="px-5 py-3 border-b border-gray-100">
                  <div className="relative max-w-sm">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={tableSearch}
                      onChange={e => setTableSearch(e.target.value)}
                      placeholder="Search name or HC#"
                      className="w-full pl-8 pr-7 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30"
                    />
                    {tableSearch && (
                      <button onClick={() => setTableSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Clear search">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )}
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200"><tr><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">HC#</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Position</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Birth Year</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {athletes.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">No athletes yet - upload a CSV above</td></tr> : athletes.filter(matchesSearch).length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">No athletes match "{tableSearch}"</td></tr> : athletes.filter(matchesSearch).map((a, i) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{a.last_name}, {a.first_name}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{a.external_id || "-"}</td>
                      <td className="px-4 py-3">{a.position ? <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${POSITION_COLORS[a.position] || "bg-gray-100 text-gray-600"}`}>{a.position}</span> : "-"}</td>
                      <td className="px-4 py-3 text-gray-500">{a.birth_year || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "analysis" && analysisView === "reports" && (
          <div className="space-y-6">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
              {[{ id: "insights", label: "Insights" }, { id: "reports", label: "Reports" }].map(v => (
                <button key={v.id} onClick={() => setAnalysisView(v.id)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${analysisView === v.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{v.label}</button>
              ))}
            </div>
            <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">Reports</h2>

            {/* Player Comparison Tool */}
            <PlayerComparison catId={catId} initialPlayerIds={[]} />

            {/* ─── Flagged Athletes ──────────────────────────── */}
            {hasScores && (() => {
              const flagged = rankedAthletes.filter(a => a.agreement_pct !== undefined && a.agreement_pct < 80);
              return flagged.length > 0 ? (
                <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/50 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                      <span className="text-amber-600 text-lg">⚠️</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Flagged Athletes — Low Evaluator Agreement</h3>
                      <p className="text-xs text-gray-500">{flagged.length} athlete{flagged.length !== 1 ? "s" : ""} below 80% agreement — evaluators disagree on these players</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">Rank</th>
                          <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">Name</th>
                          {category?.position_tagging && <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">Pos</th>}
                          <th className="px-4 py-2.5 text-center text-xs text-gray-500 font-medium">Agreement</th>
                          <th className="px-4 py-2.5 text-center text-xs text-gray-500 font-medium">Total</th>
                          <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {flagged.sort((a, b) => a.agreement_pct - b.agreement_pct).map(a => (
                          <tr key={a.id} className={`${a.agreement_pct < 60 ? "bg-red-50/30" : "bg-amber-50/20"}`}>
                            <td className="px-4 py-2.5 font-semibold text-gray-900">#{a.rank}</td>
                            <td className="px-4 py-2.5">
                              <a href={`/player/report?athlete=${a.id}&cat=${catId}`} className="font-medium text-gray-900 hover:text-[#0b5cd6]">{a.first_name} {a.last_name}</a>
                            </td>
                            {category?.position_tagging && <td className="px-4 py-2.5">{a.position ? <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${POSITION_COLORS[a.position] || "bg-gray-100 text-gray-600"}`}>{POSITION_SHORT[a.position]}</span> : "—"}</td>}
                            <td className="px-4 py-2.5 text-center">
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${a.agreement_pct < 60 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                                {a.agreement_pct}%
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-center font-semibold text-gray-900">{a.weighted_total?.toFixed(1)}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-3">
                                <button onClick={() => { setCompareIds(prev => prev.includes(a.id) ? prev : [...prev, a.id]); }} className="text-xs text-[#0b5cd6] hover:underline">+ Compare</button>
                                <a href={`/player/report?athlete=${a.id}&cat=${catId}`} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-accent"><FileText size={12} /> Report</a>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : hasScores ? (
                <div className="bg-white border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center"><span className="text-green-600 text-lg">✓</span></div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">No Flagged Athletes</div>
                    <div className="text-xs text-gray-500">All athletes have 80%+ evaluator agreement</div>
                  </div>
                </div>
              ) : null;
            })()}

            {/* ─── Positional Breakdown ──────────────────────── */}
            {hasScores && category?.position_tagging && (() => {
              const positions = ["forward", "defense", "goalie"];
              const posLabels = { forward: "Forwards", defense: "Defense", goalie: "Goalies" };
              const posColors = { forward: "from-blue-500 to-blue-600", defense: "from-purple-500 to-purple-600", goalie: "from-amber-500 to-amber-600" };
              const posTextColors = { forward: "text-blue-600", defense: "text-purple-600", goalie: "text-amber-600" };
              return (
                <div>
                  <h3 className="text-base font-semibold text-gray-900 mb-3">Positional Breakdown</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {positions.map(pos => {
                      const posAthletes = rankedAthletes.filter(a => a.position === pos).sort((a, b) => (a.weighted_total || 0) > (b.weighted_total || 0) ? -1 : 1);
                      let posRank = 0;
                      let lastScore = null;
                      posAthletes.forEach(a => {
                        const score = a.weighted_total?.toFixed(1);
                        if (score !== lastScore) { posRank++; lastScore = score; }
                        a._posRank = posRank;
                      });
                      return (
                        <div key={pos} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                          <div className={`px-4 py-3 bg-gradient-to-r ${posColors[pos]} text-white flex items-center justify-between`}>
                            <span className="text-sm font-semibold">{posLabels[pos]}</span>
                            <span className="text-xs font-medium opacity-80">{posAthletes.length} player{posAthletes.length !== 1 ? "s" : ""}</span>
                          </div>
                          {posAthletes.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-gray-400">No {posLabels[pos].toLowerCase()} in roster</div>
                          ) : (
                            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                              {posAthletes.map(a => (
                                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${a._posRank <= 3 ? `bg-gradient-to-br ${posColors[pos]} text-white` : "bg-gray-100 text-gray-500"}`}>
                                    {a._posRank}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <a href={`/player/report?athlete=${a.id}&cat=${catId}`} className="text-sm font-medium text-gray-900 hover:text-[#0b5cd6] truncate block">{a.first_name} {a.last_name}</a>
                                  </div>
                                  <div className="text-right">
                                    <div className={`text-sm font-bold ${posTextColors[pos]}`}>{a.weighted_total?.toFixed(1) || "—"}</div>
                                    <div className="text-[10px] text-gray-400">Rank #{a.rank}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <h3 className="text-base font-semibold text-gray-900 pt-2">Export Data</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0b5cd6] to-[#3b82f6] flex items-center justify-center"><BarChart3 size={18} className="text-white" /></div><div><div className="font-semibold text-gray-900">Overall Rankings</div><div className="text-xs text-gray-400">All athletes, all sessions, final rank</div></div></div>
                <button onClick={exportRankingsCSV} disabled={!hasScores} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:shadow-md"><Download size={14} /> Download CSV</button>
                {!hasScores && <p className="text-xs text-gray-400 mt-2 text-center">No scores entered yet</p>}
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center"><Trophy size={18} className="text-white" /></div><div><div className="font-semibold text-gray-900">Session Summaries</div><div className="text-xs text-gray-400">Per-session score breakdown</div></div></div>
                <div className="space-y-2">
                  {sessions.map(s => { const isComplete = completedSessions.includes(s.session_number); return (
                    <div key={s.id} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">Session {s.session_number} - {s.name}</span>
                      <button onClick={() => exportSessionSummary(s.session_number)} disabled={!isComplete} className="text-xs px-3 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1"><Download size={11} /> CSV</button>
                    </div>
                  ); })}
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center"><Users size={18} className="text-white" /></div><div><div className="font-semibold text-gray-900">Player Report Cards</div><div className="text-xs text-gray-400">Individual player score history</div></div></div>
                <button onClick={() => {
                  const headers = ["Rank", "First", "Last", "HC#", "Position", ...sessions.map(s => `S${s.session_number}`), "Total"];
                  const rows = rankedAthletes.map(a => [a.rank, a.first_name, a.last_name, a.external_id || "", a.position || "", ...sessions.map(s => a.session_scores?.[s.session_number]?.normalized_score?.toFixed(1) || ""), a.weighted_total?.toFixed(1) || ""]);
                  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const el = document.createElement("a"); el.href = url; el.download = `${category?.name}_player_reports.csv`; el.click();
                }} disabled={!hasScores} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:shadow-md"><Download size={14} /> Download CSV</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "analysis" && analysisView === "insights" && (
          <div className="space-y-6">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
              {[{ id: "insights", label: "Insights" }, { id: "reports", label: "Reports" }].map(v => (
                <button key={v.id} onClick={() => setAnalysisView(v.id)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${analysisView === v.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{v.label}</button>
              ))}
            </div>
          {rankedForInsights.length === 0 ? (
            <div className="py-12 text-center bg-white border border-dashed border-gray-200 rounded-xl text-gray-400">
              <BarChart3 size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Team Insights appear once scores are in.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">Team Insights</h2>
                  <p className="text-sm text-gray-400 mt-0.5">Natural break lines and the players on the bubble around each cut</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">Number of teams</label>
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setTeamCount(c => Math.max(2, c - 1))}
                      disabled={teamCount <= 2}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-gray-600 bg-white shadow-sm font-bold disabled:opacity-40 hover:text-[#0b5cd6]"
                      aria-label="Fewer teams"
                    >−</button>
                    <input
                      type="number"
                      min={2}
                      max={8}
                      value={teamCount}
                      onChange={e => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) setTeamCount(Math.min(8, Math.max(2, v))); }}
                      className="w-12 text-center bg-transparent text-sm font-semibold text-gray-900 focus:outline-none"
                    />
                    <button
                      onClick={() => setTeamCount(c => Math.min(8, c + 1))}
                      disabled={teamCount >= 8}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-gray-600 bg-white shadow-sm font-bold disabled:opacity-40 hover:text-[#0b5cd6]"
                      aria-label="More teams"
                    >+</button>
                  </div>
                  {insights.breaks.length > 0 && (
                    <button
                      onClick={() => {
                        const cuts = insights.breaks.map(b => b.suggestedCut);
                        const sizes = cutsToSizes(cuts, rankedForInsights.length);
                        window.location.href = `/association/dashboard/category/${catId}/teams?org=${orgId}&sizes=${sizes.join(",")}`;
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#0b5cd6] text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                    >
                      Build teams from these cuts →
                    </button>
                  )}
                </div>
              </div>

              {(() => {
                const total = rankedForInsights.length;
                const cleanCount = insights.breaks.filter(b => b.isClean).length;
                const judgmentCount = insights.breaks.length - cleanCount;
                const bubbleCount = insights.bubbles.length;
                return (
                  <div className="flex items-center flex-wrap gap-2 text-sm bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <span className="text-gray-700 font-medium">{total} players → {teamCount} teams</span>
                    <span className="text-gray-300">·</span>
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">{cleanCount} clean break{cleanCount === 1 ? "" : "s"}</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">{judgmentCount} judgment call{judgmentCount === 1 ? "" : "s"}</span>
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">{bubbleCount} on the bubble</span>
                  </div>
                );
              })()}

              {insights.breaks.map((b, bi) => {
                const bubbles = insights.bubbles.filter(x => x.boundary === bi);
                return (
                  <div key={bi} className="space-y-3">
                    <div className={`rounded-xl border p-5 ${b.isClean ? "bg-green-50/50 border-green-200" : "bg-amber-50/50 border-amber-200"}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${b.isClean ? "bg-green-100" : "bg-amber-100"}`}>
                          <span className={`text-lg ${b.isClean ? "text-green-600" : "text-amber-600"}`}>{b.isClean ? "✓" : "⚠️"}</span>
                        </div>
                        <div className="flex-1">
                          <div className={`text-sm font-semibold ${b.isClean ? "text-green-800" : "text-amber-800"}`}>
                            {b.isClean
                              ? `✓ Clean break after #${b.suggestedCut} — ${b.gap}-pt gap (${b.cleanliness}× the typical spacing)`
                              : `No clean break near the #${b.intendedCut} cut — this one's a judgment call.`}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">Team {b.teamAbove} ↑ / Team {b.teamBelow} ↓</div>
                        </div>
                      </div>
                    </div>

                    {bubbles.length === 0 ? (
                      <div className="px-5 py-4 text-xs text-gray-400 bg-white border border-gray-200 rounded-xl">No bubble players near this cut.</div>
                    ) : (
                      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                        {bubbles.map(p => {
                          const leanStyle = p.lean === "up"
                            ? { cls: "bg-green-100 text-green-700", label: "↑ Lean up" }
                            : p.lean === "down"
                            ? { cls: "bg-red-100 text-red-700", label: "↓ Lean down" }
                            : { cls: "bg-gray-100 text-gray-600", label: "~ Toss-up" };
                          return (
                            <div key={p.id} className="px-5 py-4 hover:bg-gray-50">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                                  <span className="text-xs font-medium text-gray-400">#{p.rank}</span>
                                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${leanStyle.cls}`}>{leanStyle.label}</span>
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium capitalize">{p.confidence}</span>
                                  {p.needsReview && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">needs a look</span>}
                                </div>
                              </div>
                              <div className="text-xs text-gray-500 mt-1.5">{p.reasons.join(" · ")}</div>
                              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                                <span>Composite <span className="font-semibold text-gray-700">{p.composite != null ? p.composite.toFixed(1) : "—"}</span></span>
                                <span>Game <span className="font-semibold text-gray-700">{p.gameScore != null ? p.gameScore.toFixed(1) : "—"}</span></span>
                                <span>Testing <span className="font-semibold text-gray-700">{p.testingScore != null ? p.testingScore.toFixed(1) : "—"}</span></span>
                                <span>Agreement <span className="font-semibold text-gray-700">{p.agreement ?? "—"}{p.agreement != null ? "%" : ""}</span></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {naturalTiers.length > 0 && (
                <details className="bg-white border border-gray-200 rounded-xl px-5 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-700">Natural skill bands ({naturalTiers.length}) — how many distinct bands the data shows</summary>
                  <div className="space-y-2 mt-3">
                    {naturalTiers.map((t, ti) => {
                      const names = rankedForInsights.slice(t.startRank - 1, t.endRank).map(a => `${a.last_name}, ${a.first_name}`);
                      const shown = names.slice(0, 5).join(" · ");
                      const more = names.length > 5 ? ` · +${names.length - 5} more` : "";
                      return (
                        <div key={ti} className="rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3">
                          <div className="text-sm font-medium text-gray-800">Tier {ti + 1} — ranks #{t.startRank}–#{t.endRank} ({t.size} player{t.size === 1 ? "" : "s"})</div>
                          {names.length > 0 && <div className="text-xs text-gray-500 mt-1">{shown}{more}</div>}
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          )}
          </div>
        )}

        {activeTab === "settings" && (
          canManage ? (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">Category Settings</h2>
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
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div><div className="text-sm font-medium text-gray-700">Keep players anonymous to evaluators</div><div className="text-xs text-gray-400 mt-0.5">Hide athlete names — evaluators see jersey color + number only (recommended)</div></div>
                  <button onClick={async () => { await fetch(`/api/categories/${catId}/setup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "scoring", data: { scoring_scale: category?.scoring_scale, scoring_increment: category?.scoring_increment, position_tagging: category?.position_tagging, evaluators_anonymous: !(category?.evaluators_anonymous ?? true), categories: scoringCategories } }) }); queryClient.invalidateQueries(["category-setup", catId]); }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${(category?.evaluators_anonymous ?? true) ? "bg-[#0b5cd6]" : "bg-gray-200"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${(category?.evaluators_anonymous ?? true) ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div><h3 className="text-sm font-semibold text-gray-900">Directors</h3><p className="text-xs text-gray-400 mt-0.5">Assign directors to this age category</p></div>
                  <button onClick={() => { setShowDirectorModal(true); setDirectorMsg(""); }} className="inline-flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-xs font-semibold">+ Invite Director</button>
                </div>
                {!(directorsData?.directors?.length) ? <p className="text-xs text-gray-400">No directors assigned yet</p> : directorsData.directors.map(d => (
                  <div key={d.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 mb-2">
                    <div><div className="text-sm font-medium text-gray-900">{d.name}</div><div className="text-xs text-gray-400">{d.email}</div></div>
                    <button onClick={async () => { if (confirm(`Remove ${d.name}?`)) { await fetch(`/api/categories/${catId}/invite-director?user_id=${d.id}`, { method: "DELETE" }); refetchDirectors(); } }} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 hover:bg-red-50 rounded-lg">Remove</button>
                  </div>
                ))}
              </div>
              {showDirectorModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowDirectorModal(false)}>
                  <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
                    <h3 className="font-bold text-gray-900 mb-1">Invite Director</h3>
                    <p className="text-sm text-gray-500 mb-5">They will receive login credentials and access to this age category only.</p>
                    {directorMsg ? (
                      <div className="text-center py-4"><p className="text-green-600 font-medium text-sm">{directorMsg}</p><button onClick={() => { setShowDirectorModal(false); setDirectorForm({ name: "", email: "" }); }} className="mt-4 px-5 py-2 bg-[#0b5cd6] text-white rounded-lg text-sm font-medium">Done</button></div>
                    ) : (
                      <div className="space-y-4">
                        <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label><input type="text" value={directorForm.name} onChange={e => setDirectorForm(f => ({ ...f, name: e.target.value }))} placeholder="John Smith" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]" /></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label><input type="email" value={directorForm.email} onChange={e => setDirectorForm(f => ({ ...f, email: e.target.value }))} placeholder="john@email.com" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]" /></div>
                        <div className="flex gap-3 pt-2">
                          <button onClick={() => setShowDirectorModal(false)} className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-xl text-sm">Cancel</button>
                          <button onClick={async () => {
                            if (!directorForm.name || !directorForm.email) return;
                            const res = await fetch(`/api/categories/${catId}/invite-director`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(directorForm) });
                            const data = await res.json();
                            if (data.success) { setDirectorMsg(data.message); refetchDirectors(); }
                          }} disabled={!directorForm.name || !directorForm.email} className="flex-1 py-2.5 bg-[#0b5cd6] text-white rounded-xl text-sm font-semibold disabled:opacity-50">Send Invite</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <a href={`/association/dashboard/category/${catId}/setup?cat=${catId}&org=${orgId}`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0b5cd6] text-white rounded-lg text-sm font-semibold hover:bg-[#0F4FCC]"><Settings size={14} /> Edit All Settings</a>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">Category Settings</h2>
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                {[
                  { label: "Score Scale", desc: "Maximum score per category", value: `Out of ${category?.scoring_scale || 10}` },
                  { label: "Score Increments", desc: "Minimum score step", value: category?.scoring_increment || 0.5 },
                  { label: "Position Tagging", desc: "Tag athletes by Forward / Defense / Goalie", value: category?.position_tagging ? "On" : "Off" },
                  { label: "Evaluators Required", desc: "Per group per session", value: category?.evaluators_required || 4 },
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
          )
        )}

        {/* Comparison overlay */}
        {showCompare && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto p-4 pt-16">
            <div className="w-full max-w-6xl">
              <PlayerComparison catId={catId} initialPlayerIds={compareIds} onClose={() => setShowCompare(false)} />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
