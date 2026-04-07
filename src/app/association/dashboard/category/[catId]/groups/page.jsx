"use client";

import { useState, useRef, Suspense, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ArrowLeft, Users, Shuffle, Check, AlertCircle,
  GripVertical, ChevronRight, Copy, ExternalLink, RefreshCw, Download, Printer
} from "lucide-react";

const qc = new QueryClient();

const POSITION_COLORS = {
  forward: "bg-blue-100 text-blue-700",
  defense: "bg-purple-100 text-purple-700",
  goalie: "bg-amber-100 text-amber-700",
};
const POSITION_SHORT = { forward: "F", defense: "D", goalie: "G" };

function GroupsManagerInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const catId = params.catId;
  const orgId = searchParams.get("org");
  const queryClient = useQueryClient();

  const initialSession = searchParams.get("session") ? parseInt(searchParams.get("session")) : null;
  const [selectedSession, setSelectedSession] = useState(initialSession);
  const [dragging, setDragging] = useState(null); // { athleteId, fromGroupId }
  const [dragOver, setDragOver] = useState(null); // groupId
  const [message, setMessage] = useState(null);
  const [promoteN, setPromoteN] = useState(3);
  const [showAnchorPanel, setShowAnchorPanel] = useState(false);
  const [sdThreshold, setSdThreshold] = useState(1.0); // players beyond X std devs from group mean are candidates
  const [promotePlan, setPromotePlan] = useState(null); // [{from, to, athlete}]

  // Get sessions
  const { data: setupData } = useQuery({
    queryKey: ["category-setup", catId],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/setup`);
      return res.json();
    },
  });

  // Get groups + assignments for selected session
  const { data: groupsData, isLoading: groupsLoading, refetch } = useQuery({
    queryKey: ["groups", catId, selectedSession],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/groups?session=${selectedSession}`);
      return res.json();
    },
    enabled: !!selectedSession,
    refetchInterval: 15000,
  });

  const { data: rankingsData } = useQuery({
    queryKey: ["groups-rankings", catId],
    queryFn: async () => { const res = await fetch(`/api/categories/${catId}/rankings`); return res.json(); },
    enabled: !!catId,
  });
  const rankedAthletes = rankingsData?.athletes || [];

  const { data: anchorData, refetch: refetchAnchors } = useQuery({
    queryKey: ["anchors", catId, selectedSession],
    queryFn: async () => { const res = await fetch(`/api/categories/${catId}/anchors?session=${selectedSession}`); return res.json(); },
    enabled: !!catId && !!selectedSession,
  });
  const anchors = anchorData?.anchors || [];
  const calibrationEnabled = anchorData?.calibration_enabled || false;
  const anchorIds = new Set(anchors.filter(a => a.session_number === selectedSession).map(a => a.athlete_id));

  const sessions = setupData?.sessions || [];
  const groups = groupsData?.groups || [];
  const assignments = groupsData?.assignments || [];

  // Auto-select first session
  useEffect(() => {
    if (sessions.length && !selectedSession) setSelectedSession(sessions[0].session_number);
  }, [sessions]);

  // Build group -> players map
  const groupPlayers = groups.reduce((acc, g) => {
    acc[g.id] = assignments.filter(a => a.session_group_id === g.id)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    return acc;
  }, {});

  const unassigned = assignments.filter(a => !groups.find(g => g.id === a.session_group_id));
  const goalies = groupsData?.goalies || [];
  const currentSession = sessions.find(s => s.session_number === selectedSession);
  const exportCSV = () => {
    const rows = [['Group','Date','Time','Location','Last Name','First Name','ID','Position']];
    for (const group of groups) {
      const players = assignments.filter(a => a.session_group_id === group.id);
      const sample = players[0];
      const date = sample?.scheduled_date ? new Date(sample.scheduled_date).toLocaleDateString() : '';
      const time = sample?.start_time && sample?.end_time ? sample.start_time + ' - ' + sample.end_time : (sample?.start_time || '');
      const loc = sample?.location || '';
      for (const player of players) {
        rows.push(['Group ' + group.group_number, date, time, loc, player.last_name, player.first_name, player.external_id || '', player.position || '']);
      }
    }
    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = (currentSession?.name || 'Session ' + selectedSession) + '_groups.csv';
    a.click();
  };
  const exportPrint = () => {
    const sessionName = currentSession?.name || 'Session ' + selectedSession;
    const catName = setupData?.category?.name || '';
    let html = '<html><head><title>' + catName + ' - ' + sessionName + '</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#111}h1{font-size:20px;margin-bottom:4px}.subtitle{font-size:13px;color:#555;margin-bottom:24px}.group{margin-bottom:28px;page-break-inside:avoid}.group-header{background:#1A6BFF;color:white;padding:8px 14px;border-radius:6px 6px 0 0;font-size:14px;font-weight:bold}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f3f4f6;padding:7px 10px;text-align:left;font-size:12px;border-bottom:1px solid #e5e7eb}td{padding:7px 10px;border-bottom:1px solid #f3f4f6}</style></head><body>';
    html += '<h1>' + catName + ' — ' + sessionName + '</h1><div class="subtitle">Generated ' + new Date().toLocaleDateString() + '</div>';
    for (const group of groups) {
      const players = assignments.filter(a => a.session_group_id === group.id);
      const sample = players[0];
      const date = sample?.scheduled_date ? new Date(sample.scheduled_date).toLocaleDateString() : '';
      const time = sample?.start_time && sample?.end_time ? sample.start_time + ' - ' + sample.end_time : '';
      const loc = sample?.location || '';
      html += '<div class="group"><div class="group-header">Group ' + group.group_number + ([date,time,loc].filter(Boolean).length ? ' | ' + [date,time,loc].filter(Boolean).join(' · ') : '') + '</div>';
      html += '<table><thead><tr><th>#</th><th>Last Name</th><th>First Name</th><th>ID</th><th>Position</th></tr></thead><tbody>';
      players.forEach((pl,i) => { html += '<tr><td>'+(i+1)+'</td><td>'+pl.last_name+'</td><td>'+pl.first_name+'</td><td>'+(pl.external_id||'-')+'</td><td>'+(pl.position||'-')+'</td></tr>'; });
      html += '</tbody></table></div>';
    }
    html += '</body></html>';
    const w = window.open('','_blank'); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 500);
  };

  const showMsg = (text, type = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const autoAssign = async (method, position_balanced = false) => {
    const res = await fetch(`/api/categories/${catId}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auto_assign", session_number: selectedSession, method, position_balanced }),
    });
    const data = await res.json();
    if (data.success) {
      showMsg(`Assigned ${data.assigned} athletes across ${data.groups} groups`);
      refetch();
    } else {
      showMsg(data.error, "error");
    }
  };

  const movePlayer = async (athleteId, fromGroupId, toGroupId) => {
    if (fromGroupId === toGroupId) return;
    const toGroup = groups.find(g => g.id === toGroupId);
    const currentPlayers = groupPlayers[toGroupId] || [];

    const res = await fetch(`/api/categories/${catId}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "move_player",
        athlete_id: athleteId,
        from_group_id: fromGroupId,
        to_group_id: toGroupId,
        display_order: currentPlayers.length,
      }),
    });
    const data = await res.json();
    if (data.success) {
      refetch();
    } else {
      showMsg(data.error, "error");
    }
  };

  // Z-score based movement: candidates are players > sdThreshold SDs from their group mean
  const buildPromotePlan = () => {
    const sortedGroups = [...groups].sort((a, b) => a.group_number - b.group_number);
    const plan = [];
    const stats = {}; // per group: mean, sd, scores

    // Build score map from rankings data
    const scoreMap = {};
    rankedAthletes.forEach(a => { scoreMap[a.id] = a.weighted_total; });

    // Calculate mean and SD per group
    for (const group of sortedGroups) {
      const players = groupPlayers[group.id] || [];
      const scores = players.map(p => scoreMap[p.athlete_id]).filter(s => s != null);
      if (!scores.length) { stats[group.id] = { mean: 0, sd: 0, scores }; continue; }
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const sd = Math.sqrt(scores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / scores.length);
      stats[group.id] = { mean, sd, scores };
    }

    // Find candidates at each group boundary
    for (let i = 0; i < sortedGroups.length - 1; i++) {
      const upperGroup = sortedGroups[i];
      const lowerGroup = sortedGroups[i + 1];
      const upperStats = stats[upperGroup.id];
      const lowerStats = stats[lowerGroup.id];
      const upperPlayers = groupPlayers[upperGroup.id] || [];
      const lowerPlayers = groupPlayers[lowerGroup.id] || [];

      // Candidates to move DOWN: bottom of upper group, score < mean - sdThreshold*sd
      const demoteCandidates = upperPlayers
        .map(p => ({ ...p, score: scoreMap[p.athlete_id], zScore: upperStats.sd > 0 ? (scoreMap[p.athlete_id] - upperStats.mean) / upperStats.sd : 0 }))
        .filter(p => p.score != null && p.zScore < -sdThreshold)
        .sort((a, b) => a.zScore - b.zScore) // most negative first
        .slice(0, promoteN);

      // Candidates to move UP: top of lower group, score > mean + sdThreshold*sd
      const promoteCandidates = lowerPlayers
        .map(p => ({ ...p, score: scoreMap[p.athlete_id], zScore: lowerStats.sd > 0 ? (scoreMap[p.athlete_id] - lowerStats.mean) / lowerStats.sd : 0 }))
        .filter(p => p.score != null && p.zScore > sdThreshold)
        .sort((a, b) => b.zScore - a.zScore) // most positive first
        .slice(0, promoteN);

      demoteCandidates.forEach(p => plan.push({
        athlete: p, fromGroup: upperGroup, toGroup: lowerGroup, direction: "down",
        score: p.score, zScore: p.zScore, groupMean: upperStats.mean, groupSd: upperStats.sd
      }));
      promoteCandidates.forEach(p => plan.push({
        athlete: p, fromGroup: lowerGroup, toGroup: upperGroup, direction: "up",
        score: p.score, zScore: p.zScore, groupMean: lowerStats.mean, groupSd: lowerStats.sd
      }));
    }
    setPromotePlan(plan);
  };

  const applyPromotePlan = async () => {
    for (const move of promotePlan) {
      await movePlayer(move.athlete.athlete_id, move.fromGroup.id, move.toGroup.id);
    }
    setPromotePlan(null);
    showMsg('Groups updated with forced movement', 'success');
  };

  // Drag handlers
  const onDragStart = (e, athleteId, fromGroupId) => {
    setDragging({ athleteId, fromGroupId });
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e, groupId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(groupId);
  };

  const onDrop = (e, toGroupId) => {
    e.preventDefault();
    if (dragging && dragging.fromGroupId !== toGroupId) {
      movePlayer(dragging.athleteId, dragging.fromGroupId, toGroupId);
    }
    setDragging(null);
    setDragOver(null);
  };

  const selectedSessionData = sessions.find(s => s.session_number === selectedSession);
  const checkedInCount = assignments.filter(a => a.checked_in).length;

  const promotePlanUpIds = new Set((promotePlan || []).filter(m => m.direction === "up").map(m => m.athlete.athlete_id));
  const promotePlanDownIds = new Set((promotePlan || []).filter(m => m.direction === "down").map(m => m.athlete.athlete_id));

  const rankMap = {};
  rankedAthletes.forEach(a => { rankMap[a.id] = { rank: a.rank, total: a.weighted_total }; });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <a href={`/association/dashboard/category/${catId}?org=${orgId}`}
            className="inline-flex items-center gap-1.5 text-gray-500 hover:text-[#1A6BFF] mb-4 text-sm font-medium transition-colors">
            <ArrowLeft size={15} /> Back to Category
          </a>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Group Management</h1>
              <p className="text-sm text-gray-400 mt-0.5">Assign athletes to groups · drag and drop to move players</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => refetch()} className="p-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors"><RefreshCw size={15} /></button>
              {calibrationEnabled && groups.length > 1 && (
                <button onClick={() => setShowAnchorPanel(!showAnchorPanel)} className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium ${showAnchorPanel ? "bg-amber-100 border-amber-300 text-amber-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  ⚓ Anchor Players {anchors.filter(a=>a.session_number===selectedSession).length > 0 ? `(${anchors.filter(a=>a.session_number===selectedSession).length})` : ""}
                </button>
              )}
              {groups.length > 1 && (
                <div className="flex items-center gap-2">
                  <select value={sdThreshold} onChange={e => setSdThreshold(parseFloat(e.target.value))} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300">
                    <option value="0.75">Aggressive</option>
                    <option value="1.0">Moderate</option>
                    <option value="1.5">Conservative</option>
                  </select>
                  {promotePlan === null ? (
                    <button onClick={buildPromotePlan} className="inline-flex items-center gap-1.5 px-3 py-2 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-100">⇕ Forced Movement</button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-purple-600 font-medium">{promotePlan.length} move{promotePlan.length !== 1 ? "s" : ""} flagged</span>
                      <button onClick={() => setPromotePlan(null)} className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50">Cancel</button>
                      <button onClick={applyPromotePlan} disabled={promotePlan.length === 0} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 disabled:opacity-40">{promotePlan.length === 0 ? "No moves" : "Apply Moves"}</button>
                    </div>
                  )}
                </div>
              )}
              {groups.length > 0 && assignments.length > 0 && (<><button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50"><Download size={14} /> CSV</button><button onClick={exportPrint} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50"><Printer size={14} /> Print / PDF</button></>)}
            </div>
          </div>
        </div>

        {/* Session selector */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto">
            {sessions.map(s => (
              <button key={s.session_number}
                onClick={() => setSelectedSession(s.session_number)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  selectedSession === s.session_number
                    ? "border-[#1A6BFF] text-[#1A6BFF]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                Session {s.session_number}
                <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${
                  s.session_type === "testing" ? "bg-blue-100 text-blue-600" :
                  s.session_type === "skills" ? "bg-purple-100 text-purple-600" :
                  "bg-green-100 text-green-600"
                }`}>{s.session_type}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Message */}
        {calibrationEnabled && showAnchorPanel && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-amber-900 text-sm">⚓ Anchor Player Calibration</h3>
                <p className="text-xs text-amber-700 mt-0.5">Flag 2-3 players who will skate in adjacent groups this session. Their scores create a calibration bridge to normalize evaluator bias across groups. Max 3 per session.</p>
              </div>
              <button onClick={async () => {
                const res = await fetch(`/api/categories/${catId}/anchors`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"calculate", session_number: selectedSession }) });
                const data = await res.json();
                if (data.success) { showMsg(`Calibration calculated using ${data.anchor_count} anchor(s)`, "success"); refetchAnchors(); }
                else showMsg(data.error, "error");
              }} disabled={anchors.filter(a=>a.session_number===selectedSession).length < 2} className="text-xs px-3 py-2 bg-amber-600 text-white rounded-lg font-medium disabled:opacity-40 hover:bg-amber-700">
                Calculate Correction
              </button>
            </div>
            {anchors.filter(a=>a.session_number===selectedSession).length === 0 ? (
              <p className="text-xs text-amber-600 italic">No anchors flagged yet — click "Set Anchor" on a player card below</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {anchors.filter(a=>a.session_number===selectedSession).map(a => (
                  <div key={a.id} className="flex items-center gap-2 bg-white border border-amber-300 rounded-lg px-3 py-1.5">
                    <span className="text-sm font-medium text-gray-900">{a.last_name}, {a.first_name}</span>
                    {a.raw_scores && <span className="text-xs text-amber-600">Groups: {Object.entries(JSON.parse(a.raw_scores||'{}')).map(([g,v])=>`G${g}:${Number(v).toFixed(1)}`).join(', ')}</span>}
                    <button onClick={async () => {
                      await fetch(`/api/categories/${catId}/anchors`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"unflag", athlete_id: a.athlete_id, session_number: selectedSession }) });
                      refetchAnchors();
                    }} className="text-xs text-red-400 hover:text-red-600">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {message && (
          <div className={`mb-4 p-3 rounded-xl flex items-center gap-2 text-sm font-medium ${
            message.type === "error"
              ? "bg-red-50 border border-red-200 text-red-700"
              : "bg-green-50 border border-green-200 text-green-700"
          }`}>
            {message.type === "error" ? <AlertCircle size={15} /> : <Check size={15} />}
            {message.text}
          </div>
        )}

        {/* Controls */}
        {selectedSession && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{assignments.length}</span> athletes ·{" "}
                <span className="font-semibold text-gray-900">{groups.length}</span> groups ·{" "}
                <span className="font-semibold text-green-600">{checkedInCount}</span> checked in
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => autoAssign("alphabetical", false)}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <Shuffle size={14} /> A–Z
              </button>
              <button
                onClick={() => autoAssign("ranking", false)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow"
              >
                <Shuffle size={14} /> By Ranking
              </button>
              <button
                onClick={() => autoAssign("ranking", true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow"
              >
                <Shuffle size={14} /> Position Balanced (3:2 F:D)
              </button>
            </div>
          </div>
        )}

        {groupsLoading ? (
          <div className="py-12 text-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1A6BFF] mx-auto mb-3" />
            Loading groups...
          </div>
        ) : groups.length === 0 ? (
          <div className="py-16 text-center bg-white border border-dashed border-gray-200 rounded-2xl">
            <Users size={48} className="mx-auto text-gray-200 mb-4" />
            <h3 className="font-semibold text-gray-700 mb-2">No groups for this session</h3>
            <p className="text-sm text-gray-400 mb-1">Groups are created automatically when you upload a schedule.</p>
            <p className="text-sm text-gray-400">Make sure your schedule CSV includes group numbers for Session {selectedSession}.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {groups.map(group => {
              const players = groupPlayers[group.id] || [];
              const groupSchedule = assignments.find(a => a.session_group_id === group.id);
              const checkinCode = groupSchedule?.checkin_code;
              const scheduleId = groupSchedule?.schedule_id;
              const isDropTarget = dragOver === group.id;

              return (
                <div
                  key={group.id}
                  onDragOver={e => onDragOver(e, group.id)}
                  onDrop={e => onDrop(e, group.id)}
                  onDragLeave={() => setDragOver(null)}
                  className={`bg-white border-2 rounded-2xl overflow-hidden transition-all ${
                    isDropTarget
                      ? "border-[#1A6BFF] shadow-lg shadow-orange-100"
                      : "border-gray-200"
                  }`}
                >
                  {/* Group header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-center text-white text-sm font-bold">
                        {group.group_number}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 text-sm">{group.name || `Group ${group.group_number}`}</div>
                        <div className="text-xs text-gray-400">{players.length} players</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {checkinCode && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                            {checkinCode}
                          </span>
                          <button
                            onClick={() => navigator.clipboard.writeText(checkinCode)}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded"
                            title="Copy code"
                          >
                            <Copy size={11} />
                          </button>
                          {scheduleId && (
                            <a href={`/checkin/${scheduleId}`} target="_blank"
                              className="p-1 text-[#1A6BFF] hover:text-[#0F4FCC] rounded"
                              title="Open check-in">
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Check-in progress */}
                  {players.some(p => p.checked_in !== null) && (
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-500">Check-in</span>
                        <span className="font-medium text-gray-700">
                          {players.filter(p => p.checked_in).length}/{players.length}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${players.length ? (players.filter(p => p.checked_in).length / players.length) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Player list */}
                  <div className="divide-y divide-gray-50">
                    {players.length === 0 ? (
                      <div className={`py-8 text-center text-xs text-gray-400 ${isDropTarget ? "bg-orange-50" : ""}`}>
                        {isDropTarget ? "Drop player here" : "No players assigned"}
                      </div>
                    ) : (
                      players.map((player, idx) => (
                        <div
                          key={player.athlete_id}
                          draggable
                          onDragStart={e => onDragStart(e, player.athlete_id, group.id)}
                          className={`flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-grab active:cursor-grabbing transition-colors ${
                            dragging?.athleteId === player.athlete_id ? "opacity-50" : ""
                          } ${player.checked_in ? "bg-green-50/30" : ""} ${promotePlanUpIds.has(player.athlete_id) ? "border-l-4 border-l-green-400 bg-green-50/50" : promotePlanDownIds.has(player.athlete_id) ? "border-l-4 border-l-red-400 bg-red-50/30" : "border-l-4 border-l-transparent"}`}
                        >
                          <GripVertical size={13} className="text-gray-300 flex-shrink-0" />
                          {promotePlanUpIds.has(player.athlete_id) && <span className="text-green-500 font-bold text-sm leading-none flex-shrink-0">↑</span>}
                          {promotePlanDownIds.has(player.athlete_id) && <span className="text-red-400 font-bold text-sm leading-none flex-shrink-0">↓</span>}

                          {/* Jersey/color indicator */}
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            player.team_color === "White"
                              ? "bg-white border-2 border-gray-300 text-gray-700"
                              : player.team_color === "Dark"
                              ? "bg-gray-800 text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}>
                            {player.jersey_number || (idx + 1)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {player.last_name}, {player.first_name}
                              {rankMap[player.athlete_id]?.rank != null && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-[#1A6BFF]">#{rankMap[player.athlete_id].rank}</span>
                                  {rankMap[player.athlete_id].total != null && <span className="text-xs text-gray-400">{rankMap[player.athlete_id].total.toFixed(1)}</span>}
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-gray-400">{player.external_id || ""}</div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {player.position && (
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${POSITION_COLORS[player.position] || "bg-gray-100 text-gray-600"}`}>
                                {POSITION_SHORT[player.position] || player.position}
                              </span>
                            )}
                            {player.checked_in && (
                              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                                <Check size={10} className="text-white" />
                              </div>
                            )}
                            {calibrationEnabled && showAnchorPanel && (
                              <button onClick={async (e) => {
                                e.stopPropagation();
                                const isAnchor = anchorIds.has(player.athlete_id);
                                await fetch(`/api/categories/${catId}/anchors`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action: isAnchor ? "unflag" : "flag", athlete_id: player.athlete_id, session_number: selectedSession }) });
                                refetchAnchors();
                              }} className={`text-xs px-1.5 py-0.5 rounded font-medium ${anchorIds.has(player.athlete_id) ? "bg-amber-400 text-white" : "bg-gray-100 text-gray-500 hover:bg-amber-100 hover:text-amber-700"}`}>
                                {anchorIds.has(player.athlete_id) ? "⚓" : "anchor"}
                              </button>
                            )}
                            {player.team_color && (
                              <span className="text-xs text-gray-400">{player.team_color}</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}

                    {/* Drop zone indicator */}
                    {isDropTarget && players.length > 0 && (
                      <div className="py-2 text-center text-xs text-[#1A6BFF] bg-orange-50 font-medium">
                        Drop to add to this group
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Goalie Assignment Panel */}
        {goalies.length > 0 && (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-amber-800 mb-1">
              🥅 Unassigned Goalies ({goalies.length})
            </h3>
            <p className="text-xs text-amber-600 mb-4">Goalies are not included in auto-assign. Drag them into a group or use the buttons below.</p>
            <div className="flex flex-wrap gap-3">
              {goalies.map(g => (
                <div key={g.id} className="bg-white border border-amber-200 rounded-xl px-3 py-2">
                  <div className="text-sm font-medium text-gray-900">{g.last_name}, {g.first_name}</div>
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {groups.map(group => (
                      <button
                        key={group.id}
                        onClick={async () => {
                          await fetch(`/api/categories/${catId}/groups`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "assign_goalie", athlete_id: g.id, group_id: group.id }),
                          });
                          refetch();
                        }}
                        className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 font-medium"
                      >
                        → G{group.group_number}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GroupsPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" />
        </div>
      }>
        <GroupsManagerInner />
      </Suspense>
    </QueryClientProvider>
  );
}
