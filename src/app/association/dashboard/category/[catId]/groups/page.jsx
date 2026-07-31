"use client";

import { useState, useRef, Suspense, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ArrowLeft, Users, Shuffle, Check, AlertCircle,
  GripVertical, ChevronRight, Copy, ExternalLink, RefreshCw, Download, Printer
} from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";
import GroupEmailDialog from "@/components/GroupEmailDialog";

const qc = new QueryClient();

// "Email Parents · Session Details" used to live here. It duplicated the group
// email — same recipients, same group-specific date/time/rink — but with no
// preview of who was about to receive what, no delivery tracking, no calendar
// link, and only a browser confirm() before it sent to every parent. Its one
// good idea, the "previous session complete" framing, now lives in
// groupAssignmentHtml, so GroupEmailDialog is the single send path.

const POSITION_COLORS = {
  forward: "bg-blue-100 text-blue-700",
  defense: "bg-purple-100 text-purple-700",
  goalie: "bg-amber-100 text-amber-700",
};
const POSITION_SHORT = { forward: "F", defense: "D", goalie: "G" };

// The green/red movement arrow — click it for a brief explanation of why the
// player is flagged (hover still shows it as a title too).
// Priority tiers for a movement flag, from strongest signal to weakest.
// high   — a full SD past the group mean AND already crossing the boundary player
// medium — a full SD past the mean, boundary not yet crossed
// watch  — flagged on trajectory alone (climbing, but not yet statistically clear)
const PRI_META = {
  high:   { tag: "High",  head: "High priority",         cls: "bg-amber-500 text-white" },
  medium: { tag: "Med",   head: "Medium priority",       cls: "bg-amber-200 text-amber-900" },
  watch:  { tag: "Watch", head: "Low — but worth a look", cls: "bg-gray-200 text-gray-600" },
};

function FlagInfo({ dir, why, priority }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const meta = PRI_META[priority];
  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const below = r.bottom + 110 < window.innerHeight;
      setPos({
        top: below ? r.bottom + 6 : r.top - 6,
        left: Math.max(8, Math.min(r.left, window.innerWidth - 268)),
        below,
      });
    }
    setOpen(o => !o);
  };
  return (
    <span className="flex-shrink-0 inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        title={meta ? `${meta.head} — ${why}` : why}
        onClick={toggle}
        className={`font-bold text-sm leading-none cursor-help ${dir === "up" ? "text-green-500" : "text-red-400"}`}
        aria-label="Why is this player flagged?"
      >
        {dir === "up" ? "↑" : "↓"}
      </button>
      {meta && (
        <span className={`text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded leading-none ${meta.cls}`}>
          {meta.tag}
        </span>
      )}
      {/* Fixed-position tooltip so the group card's overflow-hidden can't clip it. */}
      {open && pos && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <span className="fixed z-50 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl leading-snug font-normal normal-case"
            style={{ left: pos.left, ...(pos.below ? { top: pos.top } : { bottom: window.innerHeight - pos.top }) }}>
            {meta && <span className="block font-bold mb-1">{meta.head}</span>}
            {why}
          </span>
        </>
      )}
    </span>
  );
}

function GroupsManagerInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const catId = params.catId;
  const orgId = searchParams.get("org");
  const queryClient = useQueryClient();
  const [theme, toggleTheme] = useTheme();

  const initialSession = searchParams.get("session") ? parseInt(searchParams.get("session")) : null;
  const [selectedSession, setSelectedSession] = useState(initialSession);
  const [dragging, setDragging] = useState(null); // { athleteId, fromGroupId }
  const [dragOver, setDragOver] = useState(null); // groupId
  const [message, setMessage] = useState(null);
  const [promoteN, setPromoteN] = useState(3);
  const [showAnchorPanel, setShowAnchorPanel] = useState(false);
  const [sdThreshold, setSdThreshold] = useState(1.0); // players beyond X std devs from group mean are candidates
  const [promotePlan, setPromotePlan] = useState(null); // [{from, to, athlete}]
  const [showReview, setShowReview] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [jerseyMode, setJerseyMode] = useState(false); // show per-player colour switches

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
  const lockedAt = groupsData?.locked_at || null;
  const locked = !!lockedAt;
  const currentSession = sessions.find(s => s.session_number === selectedSession);
  const exportCSV = () => {
    const rows = [['Group','Date','Time','Location','Last Name','First Name','ID','Position']];
    for (const group of groups) {
      const players = assignments.filter(a => a.session_group_id === group.id);
      const sample = players[0];
      const date = sample?.scheduled_date ? new Date(String(sample.scheduled_date).slice(0, 10) + 'T00:00:00').toLocaleDateString() : '';
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
    let html = '<html><head><title>' + catName + ' - ' + sessionName + '</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#111}h1{font-size:20px;margin-bottom:4px}.subtitle{font-size:13px;color:#555;margin-bottom:24px}.group{margin-bottom:28px;page-break-inside:avoid}.group-header{background:#0b5cd6;color:white;padding:8px 14px;border-radius:6px 6px 0 0;font-size:14px;font-weight:bold}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f3f4f6;padding:7px 10px;text-align:left;font-size:12px;border-bottom:1px solid #e5e7eb}td{padding:7px 10px;border-bottom:1px solid #f3f4f6}</style></head><body>';
    html += '<h1>' + catName + ' — ' + sessionName + '</h1><div class="subtitle">Generated ' + new Date().toLocaleDateString() + '</div>';
    for (const group of groups) {
      const players = assignments.filter(a => a.session_group_id === group.id);
      const sample = players[0];
      const date = sample?.scheduled_date ? new Date(String(sample.scheduled_date).slice(0, 10) + 'T00:00:00').toLocaleDateString() : '';
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
    if (locked) { showMsg("Groups are locked — unlock to make changes.", "error"); return; }
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



  // Always-on movement flags: the data highlights who could move up/down without
  // forcing anything. A player scoring well above their group's mean (top of a
  // lower group) is a move-up candidate; well below (bottom of an upper group) a
  // move-down candidate. Trend (improving/sliding rank) nudges borderline cases.
  // Sensitivity comes from the same threshold control. Recomputes live as the
  // director drags, so a moved player re-evaluates against their new group.
  const movement = useMemo(() => {
    const up = new Set(), down = new Set(), why = {}, pri = {};
    if (groups.length < 2) return { up, down, why, pri };
    const sorted = [...groups].sort((a, b) => a.group_number - b.group_number);
    const score = {}, delta = {};
    rankedAthletes.forEach(a => {
      if (a.weighted_total != null) score[String(a.id)] = a.weighted_total;
      const h = a.rank_history || []; const last = h.length ? h[h.length - 1] : null;
      delta[String(a.id)] = last == null ? 0 : (last - a.rank); // + climbed spots, − slipped
    });
    const stats = {};
    for (const g of sorted) {
      const ps = (groupPlayers[g.id] || []).map(p => score[String(p.athlete_id)]).filter(s => s != null);
      if (!ps.length) { stats[g.id] = { mean: 0, sd: 0 }; continue; }
      const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
      const sd = Math.sqrt(ps.reduce((s, v) => s + (v - mean) ** 2, 0) / ps.length);
      stats[g.id] = { mean, sd };
    }
    const nm = (p) => p ? `${p.first_name} ${(p.last_name || "")[0] || ""}.` : "";
    const spots = (n) => `${Math.abs(n)} spot${Math.abs(n) === 1 ? "" : "s"}`;
    for (let i = 0; i < sorted.length - 1; i++) {
      const U = sorted[i], L = sorted[i + 1];
      const uPlayers = groupPlayers[U.id] || [], lPlayers = groupPlayers[L.id] || [];
      const weakUp = uPlayers[uPlayers.length - 1];       // bottom of the upper group
      const strongLo = lPlayers[0];                        // top of the lower group
      const weakUpScore = weakUp ? score[String(weakUp.athlete_id)] : null;
      const strongLoScore = strongLo ? score[String(strongLo.athlete_id)] : null;

      uPlayers.forEach(p => {
        const id = String(p.athlete_id), sc = score[id]; if (sc == null || stats[U.id].sd <= 0) return;
        const z = (sc - stats[U.id].mean) / stats[U.id].sd, d = delta[id] || 0;
        if (!(z < -sdThreshold || (d < 0 && z < -0.5))) return;
        down.add(id);
        const crossed = strongLoScore != null && String(strongLo.athlete_id) !== id && sc <= strongLoScore;
        pri[id] = z < -sdThreshold ? (crossed ? "high" : "medium") : "watch";
        const parts = [`Scores ${sc.toFixed(1)} — ${(stats[U.id].mean - sc).toFixed(1)} below Group ${U.group_number}'s ${stats[U.id].mean.toFixed(1)} average`];
        if (strongLoScore != null && String(strongLo.athlete_id) !== id) parts.push(sc <= strongLoScore
          ? `now behind the top of Group ${L.group_number} (${nm(strongLo)}, ${strongLoScore.toFixed(1)})`
          : `right at the Group ${L.group_number} line (${strongLoScore.toFixed(1)})`);
        if (d < 0) parts.push(`down ${spots(d)} since last session`);
        why[id] = parts.join("; ") + `. Could drop to Group ${L.group_number}.`;
      });

      lPlayers.forEach(p => {
        const id = String(p.athlete_id), sc = score[id]; if (sc == null || stats[L.id].sd <= 0) return;
        const z = (sc - stats[L.id].mean) / stats[L.id].sd, d = delta[id] || 0;
        if (!(z > sdThreshold || (d > 0 && z > 0.5))) return;
        up.add(id);
        const crossed = weakUpScore != null && String(weakUp.athlete_id) !== id && sc >= weakUpScore;
        pri[id] = z > sdThreshold ? (crossed ? "high" : "medium") : "watch";
        const parts = [`Scores ${sc.toFixed(1)} — ${(sc - stats[L.id].mean).toFixed(1)} above Group ${L.group_number}'s ${stats[L.id].mean.toFixed(1)} average`];
        if (weakUpScore != null && String(weakUp.athlete_id) !== id) parts.push(sc >= weakUpScore
          ? `outscoring the bottom of Group ${U.group_number} (${nm(weakUp)}, ${weakUpScore.toFixed(1)})`
          : `within reach of the Group ${U.group_number} cut (${weakUpScore.toFixed(1)})`);
        if (d > 0) parts.push(`up ${spots(d)} since last session`);
        why[id] = parts.join("; ") + `. Could move up to Group ${U.group_number}.`;
      });
    }
    return { up, down, why, pri };
  }, [groups, groupPlayers, rankedAthletes, sdThreshold]);

  // "Changes you made" — players whose current group differs from the system's
  // auto-assigned group (captured at auto-assign time).
  const changes = useMemo(() => {
    const numById = {}; groups.forEach(g => { numById[g.id] = g.group_number; });
    const out = [];
    assignments.forEach(a => {
      const cur = numById[a.session_group_id];
      if (cur == null || a.auto_group_number == null) return;
      if (a.auto_group_number !== cur) out.push({ id: a.athlete_id, name: `${a.first_name} ${a.last_name}`, from: a.auto_group_number, to: cur });
    });
    return out.sort((a, b) => a.to - b.to || a.name.localeCompare(b.name));
  }, [assignments, groups]);

  const setColor = async (athleteId, scheduleId, color) => {
    if (!scheduleId) { showMsg("This group has no scheduled ice time yet — add the schedule first.", "error"); return; }
    try {
      await fetch(`/api/categories/${catId}/groups`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_color", athlete_id: athleteId, schedule_id: scheduleId, color }) });
      refetch();
    } catch { showMsg("Couldn't update colour.", "error"); }
  };

  const setJerseyNumber = async (athleteId, scheduleId, num) => {
    if (!scheduleId) { showMsg("This group has no scheduled ice time yet — add the schedule first.", "error"); return; }
    try {
      await fetch(`/api/categories/${catId}/groups`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_jersey_number", athlete_id: athleteId, schedule_id: scheduleId, jersey_number: num }) });
      refetch();
    } catch { showMsg("Couldn't save jersey number.", "error"); }
  };

  const setLock = async (lock) => {
    setFinalizeBusy(true);
    try {
      await fetch(`/api/categories/${catId}/groups`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: lock ? "lock_groups" : "unlock_groups", session_number: selectedSession }) });
      await refetch();
      setShowReview(false);
      showMsg(lock ? "Groups locked — ready to send to parents." : "Groups unlocked — you can edit again.");
    } catch { showMsg("Something went wrong.", "error"); }
    finally { setFinalizeBusy(false); }
  };

  const rankMap = {};
  rankedAthletes.forEach(a => { rankMap[String(a.id)] = { rank: a.rank, total: a.weighted_total }; });
  // Goalies carry their own (goalie-pool) ranking too — shown on their names like skaters.
  (rankingsData?.goalies || []).forEach(a => { rankMap[String(a.id)] = { rank: a.rank, total: a.weighted_total, goalie: true }; });

  return (
    <div data-theme={theme} className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-start justify-between gap-4">
            <a href={`/association/dashboard/category/${catId}?org=${orgId}`}
              className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 transition-opacity mb-2">
              <ArrowLeft size={13} /> Back to rankings
            </a>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
          <div className="flex items-end gap-4 flex-wrap -mt-1">
            <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">Groups</h1>
          </div>
          {(sessions.length > 0 || assignments.length > 0) && (
            <div className="flex items-center gap-2 mt-3 flex-wrap text-sm text-gray-500 font-medium">
              {sessions.length > 0 && <span><b className="text-ink">{sessions.length}</b> {sessions.length === 1 ? "session" : "sessions"}</span>}
              {sessions.length > 0 && assignments.length > 0 && <span className="text-gray-300">·</span>}
              {assignments.length > 0 && <span><b className="text-ink">{assignments.length}</b> athletes</span>}
              {assignments.length > 0 && groups.length > 0 && <span className="text-gray-300">·</span>}
              {groups.length > 0 && <span><b className="text-ink">{groups.length}</b> groups</span>}
            </div>
          )}
          <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
            <div />
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => refetch()} className="p-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors"><RefreshCw size={15} /></button>
              {calibrationEnabled && groups.length > 1 && (
                <button onClick={() => setShowAnchorPanel(!showAnchorPanel)} className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium ${showAnchorPanel ? "bg-amber-100 border-amber-300 text-amber-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  ⚓ Anchor Players {anchors.filter(a=>a.session_number===selectedSession).length > 0 ? `(${anchors.filter(a=>a.session_number===selectedSession).length})` : ""}
                </button>
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
                    ? "border-[#0b5cd6] text-[#0b5cd6]"
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
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow"
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0b5cd6] mx-auto mb-3" />
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
          <>
          {/* Movement flags meter + lock banner — sit right above the groups */}
          {groups.length > 1 && (
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-4 flex-wrap text-sm">
                <div className="flex items-center gap-2" title="Players near a group boundary who the data says could move">
                  <span className="text-gray-600 font-medium">Movement flags:</span>
                  <span className="inline-flex items-center gap-1 font-semibold"><span className="text-green-600">↑ {movement.up.size} up</span><span className="text-gray-300">·</span><span className="text-red-500">↓ {movement.down.size} down</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Sensitivity</span>
                  <select value={sdThreshold} onChange={e => setSdThreshold(parseFloat(e.target.value))} disabled={locked} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:opacity-50">
                    <option value="0.75">Sensitive</option>
                    <option value="1.0">Balanced</option>
                    <option value="1.5">Strict</option>
                  </select>
                  <span className="text-xs text-gray-400 italic max-w-[18rem] hidden sm:block">
                    {sdThreshold <= 0.75 ? "Sensitive — flags anyone even a little above/below their group (more suggestions)"
                      : sdThreshold >= 1.5 ? "Strict — flags only the clearest cases (fewest suggestions)"
                      : "Balanced — flags players who clearly stand out from their group"}
                  </span>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer" title="Optional — assign each player's jersey NUMBER here; it carries through to check-in. (Colours you can switch any time by clicking a jersey.)">
                <button type="button" onClick={() => setJerseyMode(v => !v)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${jerseyMode ? "bg-[#0b5cd6]" : "bg-gray-200"}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${jerseyMode ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
                <span className="text-xs text-gray-600 font-medium">Pre-assign jersey numbers</span>
              </label>
            </div>
          )}
          {locked && (
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <span className="text-sm text-green-700 font-medium">🔒 Groups locked & finalized. Unlock to make changes.</span>
              <button onClick={() => setLock(false)} disabled={finalizeBusy} className="text-xs px-3 py-1.5 border border-green-300 text-green-700 rounded-lg font-semibold hover:bg-green-100 disabled:opacity-50">Unlock to edit</button>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {groups.map(group => {
              const players = groupPlayers[group.id] || [];
              const groupSchedule = assignments.find(a => a.session_group_id === group.id);
              const checkinCode = groupSchedule?.checkin_code;
              const scheduleId = groupSchedule?.schedule_id;
              const isDropTarget = dragOver === group.id;
              // F/D breakdown per jersey colour, so the director can even out the
              // two teams within a group (switch colours as needed).
              const teamStats = { White: { F: 0, D: 0, G: 0 }, Dark: { F: 0, D: 0, G: 0 } };
              players.forEach(p => {
                const t = p.team_color === "White" ? "White" : p.team_color === "Dark" ? "Dark" : null;
                if (!t) return;
                const pos = p.position === "defense" ? "D" : p.position === "goalie" ? "G" : "F";
                teamStats[t][pos]++;
              });
              const hasColors = Object.values(teamStats).some(s => s.F + s.D + s.G > 0);

              return (
                <div
                  key={group.id}
                  onDragOver={e => onDragOver(e, group.id)}
                  onDrop={e => onDrop(e, group.id)}
                  onDragLeave={() => setDragOver(null)}
                  className={`bg-white border-2 rounded-2xl overflow-hidden transition-all ${
                    isDropTarget
                      ? "border-[#0b5cd6] shadow-lg shadow-orange-100"
                      : "border-gray-200"
                  }`}
                >
                  {/* Group header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0b5cd6] to-[#3b82f6] flex items-center justify-center text-white text-sm font-bold">
                        {group.group_number}
                      </div>
                      <div>
                        <div className="font-semibold text-sm" style={{ color: "#111827" }}>{group.name || `Group ${group.group_number}`}</div>
                        <div className="text-xs" style={{ color: "#6b7280" }}>{players.length} players</div>
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
                              className="p-1 text-[#0b5cd6] hover:text-[#0F4FCC] rounded"
                              title="Open check-in">
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Colour balance — F/D per team, so directors can even the split */}
                  {hasColors && (() => {
                    const uneven = teamStats.White.D !== teamStats.Dark.D || teamStats.White.F !== teamStats.Dark.F;
                    const chip = (label, dotStyle, s) => (
                      <span className="inline-flex items-center gap-1.5 text-ink">
                        <span className="w-2.5 h-2.5 rounded-full border border-black/25" style={dotStyle} />
                        <span className="font-bold">{label}</span>
                        <span className="font-medium">{s.F}F · {s.D}D{s.G ? ` · ${s.G}G` : ""}</span>
                      </span>
                    );
                    return (
                      <div className="px-4 py-2 flex items-center gap-4 flex-wrap text-xs" style={{ background: "#d4af37" }}>
                        {chip("White", { background: "#ffffff" }, teamStats.White)}
                        {chip("Dark", { background: "#1f2937" }, teamStats.Dark)}
                        {uneven && <span className="text-ink font-bold ml-auto">⚠ uneven — click a jersey to switch colours</span>}
                      </div>
                    );
                  })()}

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
                          } ${player.checked_in ? "bg-green-50/30" : ""} ${movement.up.has(String(player.athlete_id)) ? "border-l-4 border-l-green-400" : movement.down.has(String(player.athlete_id)) ? "border-l-4 border-l-red-400" : "border-l-4 border-l-transparent"}`}
                        >
                          <GripVertical size={13} className="text-gray-300 flex-shrink-0" />
                          {movement.up.has(String(player.athlete_id)) && <FlagInfo dir="up" why={movement.why[String(player.athlete_id)]} priority={movement.pri[String(player.athlete_id)]} />}
                          {movement.down.has(String(player.athlete_id)) && <FlagInfo dir="down" why={movement.why[String(player.athlete_id)]} priority={movement.pri[String(player.athlete_id)]} />}

                          {/* Jersey colour indicator — click any time to switch White/Dark (balance the teams) */}
                          <div
                            onClick={(e) => { e.stopPropagation(); setColor(player.athlete_id, player.schedule_id, player.team_color === "White" ? "Dark" : "White"); }}
                            title="Click to switch jersey colour (White / Dark)"
                            style={player.team_color === "White"
                              ? { background: "#ffffff", color: "#111827", border: "2px solid #d1d5db" }
                              : player.team_color === "Dark"
                              ? { background: "#1f2937", color: "#ffffff", border: "2px solid #d1d5db" }
                              : { background: "#f3f4f6", color: "#4b5563", border: "2px solid #e5e7eb" }}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-[#0b5cd6]/50">
                            {player.jersey_number || (idx + 1)}
                          </div>
                          {/* Jersey NUMBER input — only in pre-assign mode; carries to check-in */}
                          {jerseyMode && (
                            <input
                              type="number" min="0" max="99"
                              key={`jn-${player.athlete_id}-${player.jersey_number ?? ""}`}
                              defaultValue={player.jersey_number ?? ""}
                              onMouseDown={e => e.stopPropagation()}
                              onClick={e => e.stopPropagation()}
                              onBlur={e => { const v = e.target.value.trim(); if (v !== String(player.jersey_number ?? "")) setJerseyNumber(player.athlete_id, player.schedule_id, v); }}
                              onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                              placeholder="#"
                              title="Jersey number (carries to check-in)"
                              className="w-11 px-1 py-0.5 border border-gray-200 rounded text-xs text-center flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30"
                            />
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {player.last_name}, {player.first_name}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {(() => { const rm = rankMap[String(player.athlete_id)]; return rm ? <span className="text-xs font-bold text-[#0b5cd6]">#{rm.rank}{rm.total ? <span className="text-gray-400 font-normal ml-1">{rm.total.toFixed(1)}</span> : null}</span> : null; })()}
                              {player.external_id && <span className="text-xs text-gray-300 ml-1">{player.external_id}</span>}
                            </div>
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
                      <div className="py-2 text-center text-xs text-[#0b5cd6] bg-orange-50 font-medium">
                        Drop to add to this group
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}

        {/* Goalie Assignment Panel */}
        {goalies.length > 0 && (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-amber-800 mb-1">
              🥅 Unassigned Goalies ({goalies.length})
            </h3>
            <p className="text-xs text-amber-600 mb-4">In scrimmage sessions, auto-assign spreads goalies evenly across the groups by ranking. Any left here (or in the goalie skills session) can be dragged into a group or assigned with the buttons below.</p>
            <div className="flex flex-wrap gap-3">
              {goalies.map(g => (
                <div key={g.id} className="bg-white border border-amber-200 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-gray-900">{g.last_name}, {g.first_name}</div>
                    {(() => { const rm = rankMap[String(g.id)]; return rm ? <span className="text-xs font-bold text-[#0b5cd6]">#{rm.rank}{rm.total ? <span className="text-gray-400 font-normal ml-1">{rm.total.toFixed(1)}</span> : null}</span> : null; })()}
                  </div>
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

        {/* Finalize bar — review your changes, confirm & lock, then send to parents */}
        {groups.length > 0 && assignments.length > 0 && selectedSession && (
          <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">Finalize {currentSession?.name || `Session ${selectedSession}`}</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {changes.length > 0
                  ? <>You've moved <b className="text-gray-600">{changes.length}</b> player{changes.length === 1 ? "" : "s"} from the auto-assigned groups.</>
                  : "No changes from the auto-assigned groups yet."}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {changes.length > 0 && (
                <button onClick={() => setShowReview(true)} className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50">Review changes ({changes.length})</button>
              )}
              {!locked ? (
                <button onClick={() => setLock(true)} disabled={finalizeBusy} className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0b5cd6] text-white rounded-lg text-sm font-semibold hover:bg-[#0F4FCC] disabled:opacity-50">{finalizeBusy ? "Locking…" : "Confirm & lock groups"}</button>
              ) : (
                <>
                  <span className="text-sm text-green-700 font-medium inline-flex items-center gap-1">🔒 Locked</span>
                  <GroupEmailDialog catId={catId} sessionNumber={selectedSession} unassignedCount={unassigned.length} />
                </>
              )}
            </div>
          </div>
        )}

        {/* Review-changes modal */}
        {showReview && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowReview(false)}>
            <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[85vh] overflow-y-auto">
              <h3 className="text-lg font-bold text-gray-900 mb-1">Changes you made</h3>
              <p className="text-sm text-gray-500 mb-4">Moves from the groups the system auto-assigned by ranking.</p>
              {changes.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No changes — the groups match the auto-assignment.</p>
              ) : (
                <div className="divide-y divide-gray-100 mb-5">
                  {changes.map(c => (
                    <div key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="font-medium text-gray-900">{c.name}</span>
                      <span className="inline-flex items-center gap-1.5 text-gray-500">
                        <span className="px-2 py-0.5 bg-gray-100 rounded">Group {c.from}</span>
                        <span className="text-gray-400">→</span>
                        <span className={`px-2 py-0.5 rounded font-semibold ${c.to < c.from ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>Group {c.to}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowReview(false)} className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-xl text-sm font-medium">Close</button>
                {!locked && <button onClick={() => setLock(true)} disabled={finalizeBusy} className="flex-1 py-2.5 bg-[#0b5cd6] text-white rounded-xl text-sm font-semibold disabled:opacity-50">{finalizeBusy ? "Locking…" : "Confirm & lock"}</button>}
              </div>
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
        <div data-theme="premium" className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" />
        </div>
      }>
        <GroupsManagerInner />
      </Suspense>
    </QueryClientProvider>
  );
}
