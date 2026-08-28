"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Download, Users, Shuffle, ChevronDown, ChevronUp, Mail, ClipboardList } from "lucide-react";
import { OrgBrandIcon } from "@/components/OrgBrandIcon";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

const qc = new QueryClient();

const POSITION_COLORS = {
  forward: "bg-blue-100 text-blue-700",
  defense: "bg-purple-100 text-purple-700",
  forward_defense: "bg-teal-100 text-teal-700",
  goalie: "bg-amber-100 text-amber-700",
};
const POSITION_SHORT = { forward: "F", defense: "D", forward_defense: "F/D", goalie: "G" };

function TeamGeneratorInner() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org");
  // useParams() is SSR-safe; reading window.location.pathname directly gave
  // the server "null" and the client the real id on its first render, a
  // guaranteed hydration mismatch (React errors #418/#422) on every load.
  const params = useParams();
  const catId = params.catId;

  const [step, setStep] = useState("setup"); // setup | review
  const [teamConfig, setTeamConfig] = useState(() => {
    const sizesParam = searchParams.get("sizes");
    if (sizesParam) {
      const sizes = sizesParam.split(",").map(s => parseInt(s)).filter(n => n > 0);
      if (sizes.length) return sizes.map((size, i) => ({ name: `Team ${String.fromCharCode(65 + i)}`, size }));
    }
    return [{ name: "Team A", size: 16 }, { name: "Team B", size: 16 }];
  });
  const [method, setMethod] = useState("straight");
  const [positionBalanced, setPositionBalanced] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [dragPlayer, setDragPlayer] = useState(null);
  const [theme, toggleTheme] = useTheme();
  const [showNotify, setShowNotify] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState("");
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyResult, setNotifyResult] = useState(null);
  const [notifyRecipients, setNotifyRecipients] = useState(0);

  const { data: rankingsData } = useQuery({
    queryKey: ["rankings", catId],
    queryFn: async () => { const res = await fetch(`/api/categories/${catId}/rankings`); return res.json(); },
    enabled: !!catId,
  });

  const { data: teamsData, refetch: refetchTeams } = useQuery({
    queryKey: ["teams", catId],
    queryFn: async () => { const res = await fetch(`/api/categories/${catId}/teams`); return res.json(); },
    enabled: !!catId,
  });

  const { data: setupData } = useQuery({
    queryKey: ["setup", catId],
    queryFn: async () => { const res = await fetch(`/api/categories/${catId}/setup`); return res.json(); },
    enabled: !!catId,
  });

  const category = setupData?.category;
  const teams = teamsData?.teams || [];
  const rosters = teamsData?.rosters || [];
  const goalies = teamsData?.goalies || [];
  const ranked = rankingsData?.athletes || [];
  const hasExistingTeams = teams.length > 0;

  // athlete_id → overall category rank + weighted score, so each team roster row
  // can show WHY a player landed where they did (teams are balanced by ranking).
  const rankByAthlete = {};
  ranked.forEach(a => { rankByAthlete[a.id] = { rank: a.rank, score: a.weighted_total }; });

  const totalConfigured = teamConfig.reduce((s, t) => s + (parseInt(t.size) || 0), 0);
  const totalAthletes = ranked.filter(a => a.position !== 'goalie').length;

  const addTeam = () => setTeamConfig(prev => [...prev, { name: `Team ${String.fromCharCode(65 + prev.length)}`, size: 16 }]);
  const removeTeam = (i) => setTeamConfig(prev => prev.filter((_, idx) => idx !== i));
  const updateTeam = (i, field, val) => setTeamConfig(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: val } : t));

  const generate = async () => {
    if (!teamConfig.length) return;
    setGenerating(true);
    setError("");
    const res = await fetch(`/api/categories/${catId}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate",
        teams: teamConfig.map(t => ({ ...t, size: parseInt(t.size) })),
        method,
        snake_range: null,
        position_balanced: positionBalanced,
      }),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); setGenerating(false); return; }
    await refetchTeams();
    setStep("review");
    setGenerating(false);
  };

  const movePlayer = async (athleteId, fromTeamId, toTeamId) => {
    await fetch(`/api/categories/${catId}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move_player", athlete_id: athleteId, from_team_id: fromTeamId, to_team_id: toTeamId }),
    });
    refetchTeams();
  };

  const assignGoalie = async (athleteId, teamId) => {
    await fetch(`/api/categories/${catId}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign_goalie", athlete_id: athleteId, team_id: teamId }),
    });
    refetchTeams();
  };

  const autoAssignGoalies = async () => {
    await fetch(`/api/categories/${catId}/teams`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auto_assign_goalies" }),
    });
    refetchTeams();
  };

  const clearTeams = async () => {
    if (!confirm("Clear all teams and start over?")) return;
    await fetch(`/api/categories/${catId}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear" }),
    });
    refetchTeams();
    setStep("setup");
  };

  const renameTeam = async (teamId, name) => {
    const clean = (name || "").trim();
    if (!clean) return;
    await fetch(`/api/categories/${catId}/teams`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename_team", team_id: teamId, name: clean }),
    });
    refetchTeams();
  };

  // Save one coach field (name or email) for a team; each input saves on blur.
  const setCoach = async (teamId, field, value) => {
    await fetch(`/api/categories/${catId}/teams`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_coach", team_id: teamId, [field]: value }),
    });
    refetchTeams();
  };

  const [coachEmailMsg, setCoachEmailMsg] = useState("");
  const [coachEmailBusy, setCoachEmailBusy] = useState(false);
  const emailCoachReports = async () => {
    const assigned = teams.filter(t => t.coach_email).length;
    if (!assigned) { setCoachEmailMsg("No coaches assigned yet — add a coach email to a team first."); setTimeout(() => setCoachEmailMsg(""), 5000); return; }
    if (!confirm(`Email the team development report to ${assigned} assigned coach${assigned === 1 ? "" : "es"}? Teams with no coach email are skipped.`)) return;
    setCoachEmailBusy(true);
    try {
      const res = await fetch(`/api/categories/${catId}/teams`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "email_coach_reports" }),
      });
      const d = await res.json();
      setCoachEmailMsg(d.success ? `Report sent to ${d.sent} coach${d.sent === 1 ? "" : "es"}${d.without_coach ? ` · ${d.without_coach} team${d.without_coach === 1 ? "" : "s"} had no coach` : ""}.` : (d.error || "Failed to send"));
    } catch { setCoachEmailMsg("Network error — please try again."); }
    finally { setCoachEmailBusy(false); setTimeout(() => setCoachEmailMsg(""), 6000); }
  };

  const openNotify = async () => {
    setShowNotify(true); setNotifyResult(null);
    const res = await fetch(`/api/categories/${catId}/teams`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "notify_preview" }),
    });
    const d = await res.json();
    if (!notifyMsg) setNotifyMsg(d.default_message || "");
    setNotifyRecipients(d.recipients || 0);
  };

  const sendNotify = async () => {
    setNotifyBusy(true);
    const res = await fetch(`/api/categories/${catId}/teams`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "notify_teams", message: notifyMsg }),
    });
    setNotifyResult(await res.json());
    setNotifyBusy(false);
  };

  const exportTeamSheet = () => {
    const lines = [];
    for (const team of teams) {
      lines.push(`${team.name}`);
      lines.push("Rank,First,Last,Position,HC#");
      const players = rosters.filter(r => r.team_id === team.id).sort((a, b) => a.team_rank - b.team_rank);
      players.forEach(p => lines.push(`${p.team_rank},${p.first_name},${p.last_name},${p.position || ""},${p.external_id || ""}`));
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${category?.name || "teams"}_team_sheet.csv`;
    a.click();
  };

  return (
    <div data-theme={theme} className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="min-w-0">
              <a href={`/association/dashboard/category/${catId}?org=${orgId}`}
                className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 transition-opacity mb-2">
                <ArrowLeft size={13} /> Back to rankings
              </a>
              <div className="flex items-end gap-4 flex-wrap">
                <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">Build Teams</h1>
              </div>
              {ranked.length > 0 && (
                <div className="flex items-center gap-2 mt-3 flex-wrap text-sm text-gray-500 font-medium">
                  <b className="text-ink">{ranked.filter(a => a.position !== 'goalie').length}</b> skaters
                  <span className="text-gray-300">·</span>
                  <b className="text-ink">{ranked.filter(a => a.position === 'goalie').length}</b> goalies
                  {teams.length > 0 && (
                    <>
                      <span className="text-gray-300">·</span>
                      <b className="text-ink">{teams.length}</b> teams
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              {hasExistingTeams && (
                <>
                  <button onClick={exportTeamSheet}
                    className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
                    <Download size={14} /> Export
                  </button>
                  <button onClick={clearTeams}
                    className="inline-flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-500 rounded-lg text-sm font-medium hover:bg-red-50">
                    <Trash2 size={14} /> Clear & Restart
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* SETUP STEP */}
        {step === "setup" && (
          <div className="max-w-2xl mx-auto space-y-6">

            {/* Team list */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Teams</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {totalConfigured} spots configured · {totalAthletes} skaters available
                    {totalConfigured !== totalAthletes && (
                      <span className="text-amber-500 ml-1">· {Math.abs(totalConfigured - totalAthletes)} {totalConfigured > totalAthletes ? "over" : "under"}</span>
                    )}
                  </p>
                </div>
                <button onClick={addTeam}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
                  <Plus size={14} /> Add Team
                </button>
              </div>

              <div className="space-y-3">
                {teamConfig.map((team, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0b5cd6] to-[#3b82f6] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <input
                      type="text"
                      value={team.name}
                      onChange={e => updateTeam(i, "name", e.target.value)}
                      placeholder="Team name"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={team.size}
                        onChange={e => updateTeam(i, "size", e.target.value)}
                        min={1}
                        className="w-16 px-3 py-2 border border-gray-200 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]"
                      />
                      <span className="text-xs text-gray-400">players</span>
                    </div>
                    {teamConfig.length > 1 && (
                      <button onClick={() => removeTeam(i)} className="p-1.5 text-gray-300 hover:text-red-400 rounded-lg">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Draft method */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
              <h2 className="text-base font-semibold text-gray-900">Draft Method</h2>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMethod("straight")}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${method === "straight" ? "border-[#0b5cd6] bg-orange-50" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <div className="font-semibold text-gray-900 text-sm mb-1">Straight Cut</div>
                  <div className="text-xs text-gray-400">Top N to Team 1, next N to Team 2, etc. Creates tiered teams (AA, A, BB...)</div>
                </button>
                <button
                  onClick={() => setMethod("snake")}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${method === "snake" ? "border-[#0b5cd6] bg-orange-50" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <div className="font-semibold text-gray-900 text-sm mb-1">Snake Draft</div>
                  <div className="text-xs text-gray-400">1→2→3→3→2→1 pick order. Creates balanced teams of equal caliber.</div>
                </button>
              </div>

              {/* Position balancing */}
              <div className="flex items-center justify-between border border-gray-200 rounded-xl p-4">
                <div>
                  <div className="text-sm font-medium text-gray-700">Position Balanced</div>
                  <div className="text-xs text-gray-400 mt-0.5">Fill Forward and Defense slots separately — about 5 defense per team (capped at 6), the rest forwards. E.g. a team of 15 → top 10 F + top 5 D. Goalies assigned manually.</div>
                </div>
                <button
                  onClick={() => setPositionBalanced(!positionBalanced)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${positionBalanced ? "bg-[#0b5cd6]" : "bg-gray-200"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${positionBalanced ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>}

            <button
              onClick={generate}
              disabled={generating || !teamConfig.length}
              className="w-full py-3.5 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-xl font-semibold text-base disabled:opacity-50 hover:shadow-lg transition-shadow flex items-center justify-center gap-2"
            >
              <Shuffle size={18} />
              {generating ? "Generating..." : `Generate ${teamConfig.length} Teams`}
            </button>

            {hasExistingTeams && (
              <button onClick={() => setStep("review")}
                className="w-full py-3 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">
                View Existing Teams →
              </button>
            )}
          </div>
        )}

        {/* REVIEW STEP */}
        {step === "review" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Team Rosters</h2>
                <p className="text-xs text-gray-400 mt-0.5">Balanced by overall ranking. Each row shows <b className="text-gray-500">#rank</b> · <b className="text-[#0b5cd6]">score</b> · position. Drag players between teams to adjust; goalies assigned separately.</p>
              </div>
              <button onClick={() => setStep("setup")}
                className="text-sm text-[#0b5cd6] hover:underline">← Back to Setup</button>
            </div>

            {/* Teams grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {teams.map(team => {
                const players = rosters.filter(r => r.team_id === team.id).sort((a, b) => a.team_rank - b.team_rank);
                return (
                  <div key={team.id}
                    className="bg-white border-2 border-gray-200 rounded-2xl overflow-hidden"
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      const { athleteId, fromTeamId } = JSON.parse(e.dataTransfer.getData("text/plain"));
                      if (fromTeamId !== team.id) movePlayer(athleteId, fromTeamId, team.id);
                    }}
                  >
                    <div className="px-4 py-3 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <input
                          key={`${team.id}-${team.name}`}
                          defaultValue={team.name}
                          onBlur={e => { const v = e.target.value.trim(); if (v && v !== team.name) renameTeam(team.id, v); else e.target.value = team.name; }}
                          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                          title="Click to rename this team"
                          className="w-full bg-transparent text-white font-bold text-base border-b border-transparent hover:border-white/40 focus:border-white focus:outline-none px-0 py-0.5"
                        />
                        <span className="text-xs text-white/70">{players.length} / {team.size} players</span>
                      </div>
                      <Users size={16} className="text-white/70 flex-shrink-0" />
                    </div>
                    <div className="divide-y divide-gray-50">
                      {players.map((p) => {
                        const info = rankByAthlete[p.athlete_id] || {};
                        return (
                        <div key={p.athlete_id}
                          draggable
                          onDragStart={e => e.dataTransfer.setData("text/plain", JSON.stringify({ athleteId: p.athlete_id, fromTeamId: team.id }))}
                          className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 cursor-grab active:cursor-grabbing"
                        >
                          <span className="text-xs font-bold text-gray-400 w-7 text-right tabular-nums flex-shrink-0" title="Overall ranking in this category">#{info.rank ?? "—"}</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-900">{p.last_name}, {p.first_name}</span>
                          </div>
                          {info.score != null && (
                            <span className="text-xs font-bold text-[#0b5cd6] bg-[#0b5cd6]/10 px-1.5 py-0.5 rounded tabular-nums flex-shrink-0" title="Overall score">{info.score.toFixed(1)}</span>
                          )}
                          {p.position && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${POSITION_COLORS[p.position] || "bg-gray-100 text-gray-600"}`}>
                              {POSITION_SHORT[p.position] || p.position}
                            </span>
                          )}
                          {p.external_id && <span className="text-[10px] text-gray-300 font-mono flex-shrink-0" title="HC#">{p.external_id}</span>}
                        </div>
                        );
                      })}
                      {players.length === 0 && (
                        <div className="px-4 py-8 text-center text-xs text-gray-300">Drop players here</div>
                      )}
                    </div>
                    {/* Coach — assign to email this team's development report */}
                    <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/60 space-y-1.5">
                      <label className="block text-[11px] font-semibold text-gray-500">Coach <span className="font-normal text-gray-400">— assign to email them this team's report</span></label>
                      <input
                        key={`cn-${team.id}-${team.coach_name || ""}`}
                        defaultValue={team.coach_name || ""}
                        placeholder="Coach name"
                        onBlur={e => { const v = e.target.value.trim(); if (v !== (team.coach_name || "")) setCoach(team.id, "coach_name", v); }}
                        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                      <input
                        key={`ce-${team.id}-${team.coach_email || ""}`}
                        type="email"
                        defaultValue={team.coach_email || ""}
                        placeholder="coach@email.com"
                        onBlur={e => { const v = e.target.value.trim(); if (v !== (team.coach_email || "")) setCoach(team.id, "coach_email", v); }}
                        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Goalie assignment */}
            {goalies.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-amber-800 mb-1">🥅 Unassigned Goalies ({goalies.length})</h3>
                <p className="text-xs text-amber-600 mb-4">Goalies are not included in auto-generation. Assign them manually, or auto-assign them evenly across teams.</p>
                {teams.length > 0 && (
                  <div className="mb-4">
                    <button onClick={autoAssignGoalies}
                      className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold">
                      Auto-assign goalies ({goalies.length})
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  {goalies.map(g => (
                    <div key={g.id} className="bg-white border border-amber-200 rounded-xl px-3 py-2">
                      <div className="text-sm font-medium text-gray-900">{g.last_name}, {g.first_name}</div>
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {teams.map(team => (
                          <button key={team.id} onClick={() => assignGoalie(g.id, team.id)}
                            className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 font-medium">
                            → {team.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {coachEmailMsg && <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{coachEmailMsg}</div>}
            {/* Actions */}
            <div className="flex flex-wrap justify-end gap-3">
              <a href={`/association/dashboard/category/${catId}/coaches-report?org=${orgId}`}
                className="inline-flex items-center gap-2 px-6 py-3 border border-[#0b5cd6] text-[#0b5cd6] rounded-xl font-semibold hover:bg-blue-50 transition-colors">
                <ClipboardList size={16} /> Coaches Report
              </a>
              <button onClick={emailCoachReports} disabled={coachEmailBusy}
                className="inline-flex items-center gap-2 px-6 py-3 border border-[#0b5cd6] text-[#0b5cd6] rounded-xl font-semibold hover:bg-blue-50 transition-colors disabled:opacity-50">
                <Mail size={16} /> {coachEmailBusy ? "Sending…" : "Email reports to coaches"}
              </button>
              <button onClick={exportTeamSheet}
                className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors">
                <Download size={16} /> Export Team Sheets CSV
              </button>
              <button onClick={openNotify}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-xl font-semibold hover:shadow-lg transition-shadow">
                <Mail size={16} /> Notify players of teams
              </button>
            </div>
          </div>
        )}

        {/* Notify-parents modal */}
        {showNotify && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowNotify(false)}>
            <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center gap-2 mb-1"><Mail size={18} className="text-[#0b5cd6]" /><h3 className="text-lg font-bold text-gray-900">Notify players of their team</h3></div>
              {notifyResult ? (
                <div className="text-center py-4">
                  <p className="font-semibold text-gray-900 mb-1">{notifyResult.success ? `Sent to ${notifyResult.sent} famil${notifyResult.sent === 1 ? "y" : "ies"}` : "Failed to send"}</p>
                  {notifyResult.skipped > 0 && <p className="text-xs text-gray-400">{notifyResult.skipped} skipped (no parent email)</p>}
                  <button onClick={() => { setShowNotify(false); setNotifyResult(null); }} className="mt-4 px-5 py-2 bg-[#0b5cd6] text-white rounded-lg text-sm font-medium">Done</button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-500 mb-4">Each family gets their child's team. Edit the message below — <code className="text-xs bg-gray-100 px-1 rounded">{"{player}"}</code> and <code className="text-xs bg-gray-100 px-1 rounded">{"{team}"}</code> fill in per player. The team name is also shown in its own card in the email.</p>
                  <textarea value={notifyMsg} onChange={e => setNotifyMsg(e.target.value)} rows={6}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6] leading-relaxed" />
                  <p className="text-xs text-gray-400 mt-2">Tip: add a line like "Stay tuned for your TeamLinkt invite." if you want.</p>
                  <div className="flex items-center justify-between gap-3 mt-5">
                    <span className="text-xs text-gray-500">Will email <b className="text-gray-800">{notifyRecipients}</b> famil{notifyRecipients === 1 ? "y" : "ies"}.</span>
                    <div className="flex gap-2">
                      <button onClick={() => setShowNotify(false)} className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium">Cancel</button>
                      <button onClick={sendNotify} disabled={notifyBusy || !notifyMsg.trim() || !notifyRecipients} className="px-5 py-2.5 bg-[#0b5cd6] text-white rounded-lg text-sm font-semibold disabled:opacity-50">{notifyBusy ? "Sending…" : "Send to families"}</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TeamsPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div data-theme="premium" className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>}>
        <TeamGeneratorInner />
      </Suspense>
    </QueryClientProvider>
  );
}
