"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Download, Users, Shuffle, ChevronDown, ChevronUp } from "lucide-react";

const qc = new QueryClient();

const POSITION_COLORS = {
  forward: "bg-blue-100 text-blue-700",
  defense: "bg-purple-100 text-purple-700",
  goalie: "bg-amber-100 text-amber-700",
};
const POSITION_SHORT = { forward: "F", defense: "D", goalie: "G" };

function TeamGeneratorInner() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org");
  const catId = typeof window !== "undefined" ? window.location.pathname.split("/")[4] : null;

  const [step, setStep] = useState("setup"); // setup | review
  const [teamConfig, setTeamConfig] = useState([
    { name: "Team A", size: 16 },
    { name: "Team B", size: 16 },
  ]);
  const [method, setMethod] = useState("straight");
  const [useRange, setUseRange] = useState(false);
  const [snakeRange, setSnakeRange] = useState({ from: 1, to: 32 });
  const [positionBalanced, setPositionBalanced] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [dragPlayer, setDragPlayer] = useState(null);

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
        snake_range: useRange ? snakeRange : null,
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <a href={`/association/dashboard/category/${catId}?org=${orgId}`}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
                <ArrowLeft size={16} /> Back
              </a>
              <div className="w-px h-5 bg-gray-200" />
              <div>
                <h1 className="text-lg font-bold text-gray-900">Team Generation</h1>
                <p className="text-xs text-gray-400">{category?.name} · {ranked.length} athletes · {ranked.filter(a => a.position !== 'goalie').length} skaters · {ranked.filter(a => a.position === 'goalie').length} goalies</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <input
                      type="text"
                      value={team.name}
                      onChange={e => updateTeam(i, "name", e.target.value)}
                      placeholder="Team name"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={team.size}
                        onChange={e => updateTeam(i, "size", e.target.value)}
                        min={1}
                        className="w-16 px-3 py-2 border border-gray-200 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]"
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
                  className={`p-4 rounded-xl border-2 text-left transition-all ${method === "straight" ? "border-[#1A6BFF] bg-orange-50" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <div className="font-semibold text-gray-900 text-sm mb-1">Straight Cut</div>
                  <div className="text-xs text-gray-400">Top N to Team 1, next N to Team 2, etc. Creates tiered teams (AA, A, BB...)</div>
                </button>
                <button
                  onClick={() => setMethod("snake")}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${method === "snake" ? "border-[#1A6BFF] bg-orange-50" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <div className="font-semibold text-gray-900 text-sm mb-1">Snake Draft</div>
                  <div className="text-xs text-gray-400">1→2→3→3→2→1 pick order. Creates balanced teams of equal caliber.</div>
                </button>
              </div>

              {/* Range selector */}
              <div className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-medium text-gray-700">Apply to specific range only</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {useRange
                        ? `${method === "snake" ? "Snake" : "Straight cut"} picks ${snakeRange.from}–${snakeRange.to}, remaining players straight cut`
                        : `${method === "snake" ? "Snake" : "Straight cut"} applies to all ${totalAthletes} skaters`}
                    </div>
                  </div>
                  <button
                    onClick={() => setUseRange(!useRange)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${useRange ? "bg-[#1A6BFF]" : "bg-gray-200"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${useRange ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
                {useRange && (
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">From pick</span>
                      <input type="number" value={snakeRange.from} min={1} max={totalAthletes}
                        onChange={e => setSnakeRange(r => ({ ...r, from: parseInt(e.target.value) || 1 }))}
                        className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">to pick</span>
                      <input type="number" value={snakeRange.to} min={1} max={totalAthletes}
                        onChange={e => setSnakeRange(r => ({ ...r, to: parseInt(e.target.value) || totalAthletes }))}
                        className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]" />
                    </div>
                    <span className="text-xs text-gray-400">of {totalAthletes}</span>
                  </div>
                )}
              </div>

              {/* Position balancing */}
              <div className="flex items-center justify-between border border-gray-200 rounded-xl p-4">
                <div>
                  <div className="text-sm font-medium text-gray-700">Position Balanced</div>
                  <div className="text-xs text-gray-400 mt-0.5">Fill Forward and Defense slots separately using 3:2 F:D ratio. Goalies assigned manually.</div>
                </div>
                <button
                  onClick={() => setPositionBalanced(!positionBalanced)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${positionBalanced ? "bg-[#1A6BFF]" : "bg-gray-200"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${positionBalanced ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>}

            <button
              onClick={generate}
              disabled={generating || !teamConfig.length}
              className="w-full py-3.5 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-xl font-semibold text-base disabled:opacity-50 hover:shadow-lg transition-shadow flex items-center justify-center gap-2"
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
                <p className="text-xs text-gray-400 mt-0.5">Drag players between teams to adjust. Goalies assigned separately.</p>
              </div>
              <button onClick={() => setStep("setup")}
                className="text-sm text-[#1A6BFF] hover:underline">← Back to Setup</button>
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
                    <div className="px-4 py-3 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-white">{team.name}</h3>
                        <span className="text-xs text-white/70">{players.length} / {team.size} players</span>
                      </div>
                      <Users size={16} className="text-white/70" />
                    </div>
                    <div className="divide-y divide-gray-50">
                      {players.map((p, i) => (
                        <div key={p.athlete_id}
                          draggable
                          onDragStart={e => e.dataTransfer.setData("text/plain", JSON.stringify({ athleteId: p.athlete_id, fromTeamId: team.id }))}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-grab active:cursor-grabbing"
                        >
                          <span className="text-xs text-gray-300 w-5 text-right">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-900">{p.last_name}, {p.first_name}</span>
                          </div>
                          {p.position && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${POSITION_COLORS[p.position] || "bg-gray-100 text-gray-600"}`}>
                              {POSITION_SHORT[p.position] || p.position}
                            </span>
                          )}
                          <span className="text-xs text-gray-300 font-mono">{p.external_id || ""}</span>
                        </div>
                      ))}
                      {players.length === 0 && (
                        <div className="px-4 py-8 text-center text-xs text-gray-300">Drop players here</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Goalie assignment */}
            {goalies.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-amber-800 mb-1">🥅 Unassigned Goalies ({goalies.length})</h3>
                <p className="text-xs text-amber-600 mb-4">Goalies are not included in auto-generation. Assign them manually.</p>
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

            {/* Export */}
            <div className="flex justify-end">
              <button onClick={exportTeamSheet}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-xl font-semibold hover:shadow-lg transition-shadow">
                <Download size={16} /> Export Team Sheets CSV
              </button>
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
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" /></div>}>
        <TeamGeneratorInner />
      </Suspense>
    </QueryClientProvider>
  );
}
