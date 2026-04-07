"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useParams } from "next/navigation";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Mic, MicOff, ArrowLeft, WifiOff, ChevronLeft, ChevronRight, X, RotateCcw } from "lucide-react";

const qc = new QueryClient();

// ── Offline storage ────────────────────────────────────────────────────────
const LS_KEY = (scheduleId, userId) => `ar_scores_v2_${scheduleId}_${userId || "anon"}`;

function loadLocal(scheduleId, userId) {
  try { return JSON.parse(localStorage.getItem(LS_KEY(scheduleId, userId)) || "{}"); }
  catch { return {}; }
}

function saveLocal(scheduleId, userId, data) {
  try {
    const withMeta = { ...data, _saved: new Date().toISOString(), _scheduleId: scheduleId };
    localStorage.setItem(LS_KEY(scheduleId, userId), JSON.stringify(withMeta));
    const backupKey = `ar_backup_${scheduleId}_${userId}_${Date.now()}`;
    localStorage.setItem(backupKey, JSON.stringify(withMeta));
    const backupKeys = Object.keys(localStorage).filter(k => k.startsWith(`ar_backup_${scheduleId}_${userId}_`)).sort();
    while (backupKeys.length > 5) localStorage.removeItem(backupKeys.shift());
  } catch {}
}

// ── Status helpers ─────────────────────────────────────────────────────────
function getStatus(athleteId, scores, totalCats) {
  if (!totalCats) return "empty";
  const s = scores[athleteId];
  if (!s) return "empty";
  const filled = Object.values(s.cats || {}).filter(v => v !== null && v !== undefined).length;
  if (filled === 0) return "empty";
  if (filled < totalCats) return "partial";
  return "complete";
}

// ── Main component ─────────────────────────────────────────────────────────
function ScoringInterface() {
  const params = useParams();
  const scheduleId = params.scheduleId;

  const [selected, setSelected] = useState(null);
  const [scores, setScores] = useState({});
  const [pending, setPending] = useState({});
  const [online, setOnline] = useState(true);
  const [voiceOn, setVoiceOn] = useState(false);
  const [showConsensus, setShowConsensus] = useState(false);
  const [consensusData, setConsensusData] = useState(null);
  const [consensusLoading, setConsensusLoading] = useState(false);
  const [reviewedFlags, setReviewedFlags] = useState(new Set());
  const [closing, setClosing] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceMode, setVoiceMode] = useState('checking'); // checking | live | degraded | unavailable
  const [notesMode, setNotesMode] = useState(false);
  const [teamFilter, setTeamFilter] = useState("all");
  const [syncStatus, setSyncStatus] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);

  // Refs for voice callbacks (avoid stale closures)
  const notesModeRef = useRef(false);
  const selectedRef = useRef(null);
  const scoresRef = useRef({});
  const athletesRef = useRef([]);
  const scoringCatsRef = useRef([]);
  const scaleRef = useRef(10);
  const incrementRef = useRef(1);
  const recRef = useRef(null);
  const syncTimerRef = useRef(null);

  useEffect(() => { notesModeRef.current = notesMode; }, [notesMode]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { scoresRef.current = scores; }, [scores]);

  // Fetch current user ID on mount so localStorage is scoped per evaluator
  useEffect(() => {
    fetch("/api/evaluator/status")
      .then(r => r.json())
      .then(d => { if (d.userId) setCurrentUserId(d.userId); })
      .catch(() => {});
  }, []);

  // Load offline data on mount — only after we know who the user is
  useEffect(() => {
    if (!currentUserId) return;
    const saved = loadLocal(scheduleId, currentUserId);
    const { _saved, _scheduleId, ...athleteScores } = saved;
    if (Object.keys(athleteScores).length) {
      setScores(athleteScores);
      setSyncStatus(`Loaded local data from ${_saved ? new Date(_saved).toLocaleTimeString() : "device"}`);
      setTimeout(() => setSyncStatus(""), 3000);
    }
  }, [scheduleId, currentUserId]);

  // Warn before leaving if unsynced scores
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (Object.keys(pending).length > 0) {
        e.preventDefault();
        e.returnValue = "You have unsynced scores. Are you sure you want to leave? Your scores are saved on this device but not yet sent to the server.";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [pending]);

  // Online/offline
  useEffect(() => {
    const go = () => setOnline(true);
    const stop = () => setOnline(false);
    window.addEventListener("online", go);
    window.addEventListener("offline", stop);
    setOnline(navigator.onLine);
    return () => { window.removeEventListener("online", go); window.removeEventListener("offline", stop); };
  }, []);

  // Ask service worker to trigger background sync when we come back online
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handleOnline = async () => {
      const reg = await navigator.serviceWorker.ready;
      if (reg.sync) { try { await reg.sync.register('score-sync'); } catch {} }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Precache all session assets while online so the page works in dead-wifi rinks
  // Fires once when both session data and category data have loaded successfully
  useEffect(() => {
    if (!sessionData?.schedule || !catData?.scoringCategories) return;
    if (!navigator.onLine) return;
    if (!('serviceWorker' in navigator)) return;
    const catId = sessionData.schedule.category_id;
    const urlsToCache = [
      `/api/checkin/${scheduleId}`,
      `/api/categories/${catId}/setup`,
      `/api/evaluator/status`,
      `/evaluator/score/${scheduleId}`,
    ];
    navigator.serviceWorker.ready.then(reg => {
      if (!reg.active) return;
      reg.active.postMessage({ type: 'PRECACHE', urls: urlsToCache });
    });
  }, [sessionData, catData, scheduleId]);

  // Listen for PRECACHE_DONE confirmation from SW
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = e => {
      if (e.data?.type === 'PRECACHE_DONE') {
        setSyncStatus('Session cached ✓');
        setTimeout(() => setSyncStatus(''), 2500);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // Detect voice capability — iOS Safari uses on-device recognition and works offline
  // Chrome/Android streams to Google servers and fails without wifi
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setVoiceMode('unavailable'); return; }
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const worksOffline = isIOS && isSafari;
    const update = () => {
      if (navigator.onLine) { setVoiceMode('live'); return; }
      setVoiceMode(worksOffline ? 'degraded' : 'unavailable');
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  // Data queries
  const { data: sessionData, isLoading } = useQuery({
    queryKey: ["score-session", scheduleId],
    queryFn: async () => {
      const res = await fetch(`/api/checkin/${scheduleId}`);
      return res.json();
    },
  });

  const { data: catData } = useQuery({
    queryKey: ["scoring-cats", sessionData?.schedule?.category_id],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${sessionData.schedule.category_id}/setup`);
      return res.json();
    },
    enabled: !!sessionData?.schedule?.category_id,
  });

  const catId = sessionData?.schedule?.category_id;
  const scheduleData = sessionData?.schedule;

  const athletes = sessionData?.athletes?.filter(a => a.checked_in) || [];
  const teamColors = sessionData?.checkinSession?.team_colors || ["White", "Dark"];
  const scoringCats = catData?.scoringCategories || [];
  const scale = catData?.category?.scoring_scale || 10;
  const increment = catData?.category?.scoring_increment || 1;
  const totalCats = scoringCats.length;

  useEffect(() => { athletesRef.current = athletes; }, [athletes]);
  useEffect(() => { scoringCatsRef.current = scoringCats; }, [scoringCats]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { incrementRef.current = increment; }, [increment]);

  const filtered = teamFilter === "all"
    ? athletes
    : athletes.filter(a => a.team_color === teamFilter);

  // Score values array
  const scoreValues = React.useMemo(() => {
    const inc = parseFloat(increment) || 1;
    const max = parseFloat(scale) || 10;
    const vals = [];
    for (let v = inc; v <= max + 0.001; v = Math.round((v + inc) * 100) / 100) {
      vals.push(parseFloat(v.toFixed(2)));
    }
    return vals;
  }, [increment, scale]);

  // ── Save to server ────────────────────────────────────────────────────────
  const syncToServer = useCallback(async (athleteId, currentScores) => {
    if (!sessionData?.schedule) return false;
    const athlete = athletesRef.current.find(a => a.id === athleteId);
    const s = currentScores[athleteId];
    if (!s || !Object.keys(s.cats || {}).length) return false;

    try {
      const res = await fetch("/api/evaluator/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athlete_id: athleteId,
          category_id: sessionData.schedule.category_id,
          session_number: sessionData.schedule.session_number,
          scores: Object.entries(s.cats || {}).map(([catId, score]) => ({
            scoring_category_id: parseInt(catId), score,
          })),
          notes: s.notes || "",
          jersey_number: athlete?.jersey_number,
          scored_via: "manual",
          schedule_id: parseInt(scheduleId),
        }),
      });
      if (res.ok) {
        setPending(p => { const n = { ...p }; delete n[athleteId]; return n; });
        return true;
      }
    } catch {}
    return false;
  }, [sessionData, scheduleId]);

  // Debounced auto-sync — waits 2s after last tap then syncs
  const debouncedSync = useCallback((athleteId, currentScores) => {
    if (!online) return;
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      setSyncStatus("Syncing...");
      const ok = await syncToServer(athleteId, currentScores);
      setSyncStatus(ok ? "Saved ✓" : "Sync failed — saved locally");
      setTimeout(() => setSyncStatus(""), 2000);
    }, 1500);
  }, [online, syncToServer]);

  // Sync all pending when coming back online
  useEffect(() => {
    if (online && Object.keys(pending).length > 0) {
      const syncAll = async () => {
        setSyncStatus(`Syncing ${Object.keys(pending).length} pending...`);
        for (const id of Object.keys(pending)) {
          await syncToServer(parseInt(id), scoresRef.current);
        }
        setSyncStatus("All synced ✓");
        setTimeout(() => setSyncStatus(""), 2000);
      };
      syncAll();
    }
  }, [online]);

  // ── Core score setter ─────────────────────────────────────────────────────
  const updateScore = useCallback((athleteId, catId, value) => {
    setScores(prev => {
      const existing = prev[athleteId]?.cats?.[catId];
      // Toggle off if same value tapped again
      const newVal = existing === value ? null : value;
      const updated = {
        ...prev,
        [athleteId]: {
          cats: { ...(prev[athleteId]?.cats || {}), [catId]: newVal },
          notes: prev[athleteId]?.notes || "",
          _ts: new Date().toISOString(),
        }
      };
      saveLocal(scheduleId, currentUserId, updated);
      setPending(p => ({ ...p, [athleteId]: true }));
      debouncedSync(athleteId, updated);
      return updated;
    });
  }, [scheduleId, debouncedSync]);

  const updateNotes = useCallback((athleteId, text) => {
    setScores(prev => {
      const updated = {
        ...prev,
        [athleteId]: { cats: prev[athleteId]?.cats || {}, notes: text, _ts: new Date().toISOString() }
      };
      saveLocal(scheduleId, currentUserId, updated);
      debouncedSync(athleteId, updated);
      return updated;
    });
  }, [scheduleId, debouncedSync]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigate = useCallback((dir) => {
    const current = selectedRef.current;
    const list = filtered;
    if (!current) { if (list.length) setSelected(list[0]); return; }
    const idx = list.findIndex(a => a.id === current.id);
    const next = list[idx + dir];
    if (next) setSelected(next);
  }, [filtered]);

  // ── Voice ─────────────────────────────────────────────────────────────────
  const parseVoice = useCallback((text) => {
    const wordNums = {
      'zero':'0','one':'1','two':'2','three':'3','four':'4','five':'5',
      'six':'6','seven':'7','eight':'8','nine':'9','ten':'10',
      'to':'2','too':'2','for':'4','won':'1','ate':'8','nein':'9','tu':'2','fore':'4'
    };
    const normalized = text.trim().toLowerCase().replace(/\b(zero|one|two|to|too|tu|three|four|for|fore|five|six|seven|eight|ate|nine|nein|ten|won)\b/gi, m => wordNums[m.toLowerCase()] || m);
    const t = normalized.trim().toLowerCase();
    setVoiceStatus(`"${text}"${normalized !== text.trim().toLowerCase() ? ' → ' + normalized : ''}`);

    // ── Mic off ──────────────────────────────────────────
    if (/^(mic off|microphone off|stop listening|turn off mic)$/i.test(t)) {
      stopVoice();
      return;
    }

    // ── Finish/stop notes ─────────────────────────────────
    if (/^(finish notes?|stop notes?|end notes?|done notes?|done)$/i.test(t)) {
      setNotesMode(false);
      setVoiceStatus("Notes mode off");
      return;
    }

    // ── Notes dictation mode — append everything ──────────
    if (notesModeRef.current) {
      const a = selectedRef.current;
      if (a) {
        setScores(prev => {
          const existing = prev[a.id]?.notes || "";
          const updated = {
            ...prev,
            [a.id]: { cats: prev[a.id]?.cats || {}, notes: existing ? existing + ". " + text : text }
          };
          saveLocal(scheduleId, currentUserId, updated);
          return updated;
        });
        setVoiceStatus(`Note added ✓`);
      }
      return;
    }

    // ── Start notes ───────────────────────────────────────
    if (/^(start notes?|notes?|add notes?)$/i.test(t)) {
      if (!selectedRef.current) { setVoiceStatus("Select a player first"); return; }
      setNotesMode(true);
      setVoiceStatus("Notes mode — speak freely, say 'finish notes' to stop");
      return;
    }

    // ── Select player: "score white 14" / "white 14" / "score black 14" / "dark 14" ──
    // Also handles "black" as alias for "Dark"
    const playerMatch = t.match(/(?:score\s+)?(white|dark|black|wh|dk|bl)\s+(\d+)/i);
    if (playerMatch) {
      const raw = playerMatch[1].toLowerCase();
      const colorMap = { white: "White", wh: "White", dark: "Dark", black: "Dark", dk: "Dark", bl: "Dark" };
      const color = colorMap[raw] || "White";
      const jersey = parseInt(playerMatch[2]);
      const a = athletesRef.current.find(
        x => x.team_color?.toLowerCase() === color.toLowerCase() && x.jersey_number === jersey
      );
      if (a) { setSelected(a); setVoiceStatus(`Selected: ${color} #${jersey} — ${a.last_name}`); }
      else setVoiceStatus(`${color} #${jersey} not found`);
      return;
    }

    // ── Just a jersey number ──────────────────────────────
    if (/^\d+$/.test(t)) {
      const jersey = parseInt(t);
      const a = athletesRef.current.find(x => x.jersey_number === jersey);
      if (a) { setSelected(a); setVoiceStatus(`Selected: #${jersey} ${a.last_name}`); }
      else setVoiceStatus(`No player with jersey #${jersey}`);
      return;
    }

    // ── Score categories: "skating 8" / "puck skills 7" / "skating 8 puck skills 7" ──
    const cats = scoringCatsRef.current;
    const sel = selectedRef.current;
    if (cats.length) {
      let scored = 0;
      for (const cat of cats) {
        const catName = cat.name.toLowerCase();
        // Try full name first, then first word
        const keywords = [
          catName.replace(/[^a-z0-9]/g, "\\s*"), // full name flexible spacing
          catName.split(/[\s/]/)[0],               // first word only
        ];
        for (const keyword of keywords) {
          const pattern = new RegExp(keyword + "\\s+(\\d+(?:[.]\\d+)?)", "i");
          const m = t.match(pattern);
          if (m) {
            const val = parseFloat(m[1]);
            const inc = parseFloat(incrementRef.current) || 1;
            const max = parseFloat(scaleRef.current) || 10;
            if (val >= inc && val <= max) {
              if (sel) { updateScore(sel.id, cat.id, val); scored++; break; }
              else { setVoiceStatus("Select a player first"); break; }
            }
          }
        }
      }
      if (scored > 0) { setVoiceStatus(`${scored} score${scored > 1 ? "s" : ""} saved ✓`); return; }
    }

    // ── Navigation ────────────────────────────────────────
    if (/^next$/.test(t)) { navigate(1); return; }
    if (/^(prev|previous|back)$/.test(t)) { navigate(-1); return; }

    setVoiceStatus(`Not understood: "${text}"`);

  }, [scheduleId, updateScore, navigate]);

  const loadConsensus = async () => {
    setConsensusLoading(true);
    const res = await fetch(`/api/categories/${catId}/consensus?schedule_id=${scheduleId}&session=${scheduleData?.session_number}`);
    const data = await res.json();
    setConsensusData(data);
    setConsensusLoading(false);
  };

  const closeSession = async () => {
    setClosing(true);
    const flagged = consensusData?.athletes?.filter(a => a.flagged) || [];
    const unreviewed = flagged.filter(a => !reviewedFlags.has(a.athlete_id));
    await fetch(`/api/categories/${catId}/consensus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "close_session",
        schedule_id: scheduleId,
        session_number: scheduleData?.session_number,
        unreviewed_flags: unreviewed.map(a => ({ first_name: a.first_name, last_name: a.last_name, overall_agreement: a.overall_agreement })),
      }),
    });
    setClosing(false);
    alert("Session closed successfully.");
    window.location.href = "/evaluator/dashboard";
  };

  const stopVoice = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setVoiceOn(false);
    setVoiceStatus("");
    setNotesMode(false);
  }, []);

  const toggleVoice = useCallback(() => {
    if (voiceOn) {
      recRef.current?.stop();
      recRef.current = null;
      setVoiceOn(false);
      setVoiceStatus("");
      setNotesMode(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || voiceMode === 'unavailable') { setVoiceStatus("Voice unavailable offline — tap to score"); return; }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    recRef.current = rec;

    rec.onresult = e => {
      const t = e.results[e.results.length - 1][0].transcript.trim();
      parseVoice(t.toLowerCase());
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech") setVoiceStatus(`Error: ${e.error}`);
    };
    rec.onend = () => {
      // Auto-restart to keep listening
      if (recRef.current === rec) {
        try { rec.start(); } catch {}
      }
    };
    rec.start();
    setVoiceOn(true);
    setVoiceStatus("Listening...");
  }, [voiceOn, parseVoice]);

  // Stats
  const complete = athletes.filter(a => getStatus(a.id, scores, totalCats) === "complete").length;
  const partial = athletes.filter(a => getStatus(a.id, scores, totalCats) === "partial").length;
  const remaining = athletes.length - complete - partial;

  const selectedIdx = selected ? filtered.findIndex(a => a.id === selected.id) : -1;

  if (isLoading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col" style={{ paddingBottom: "80px" }}>

      {/* ── Top bar ────────────────────────────────────────── */}
      <div className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="flex items-center justify-between px-3 py-3">
          <a href="/evaluator/dashboard" className="p-1.5 text-gray-400 hover:text-white rounded-lg">
            <ArrowLeft size={20} />
          </a>
          <div className="text-center flex-1 mx-2">
            <div className="text-sm font-bold text-white leading-tight">
              {sessionData?.schedule?.org_name} · S{sessionData?.schedule?.session_number} G{sessionData?.schedule?.group_number}
            </div>
            <div className="flex items-center justify-center gap-3 mt-1">
              <span className="text-xs text-green-400 font-semibold">{complete} ✓</span>
              <span className="text-xs text-amber-400 font-semibold">{partial} partial</span>
              <span className="text-xs text-gray-500">{remaining} left</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Connection dot */}
            <div className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full transition-colors duration-500 ${
                online ? 'bg-green-400 shadow-[0_0_6px_#4ade80]' : Object.keys(pending).length > 0 ? 'bg-amber-400 animate-pulse' : 'bg-red-500'
              }`} />
              <span className={`text-xs font-medium ${
                online ? 'text-green-400' : Object.keys(pending).length > 0 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {online ? 'Live' : Object.keys(pending).length > 0 ? `${Object.keys(pending).length} pending` : 'Offline'}
              </span>
            </div>
            {/* Sync status message */}
            {syncStatus && (
              <span className={`text-xs px-2 py-1 rounded-lg ${
                syncStatus.includes('✓') ? 'text-green-400' :
                syncStatus.includes('fail') || syncStatus.includes('Error') ? 'text-red-400' :
                'text-amber-400'
              }`}>{syncStatus}</span>
            )}
          </div>
        </div>

        {/* Team filter tabs */}
        <div className="flex border-t border-gray-800">
          {["all", ...teamColors].map(t => (
            <button key={t} onClick={() => setTeamFilter(t)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors capitalize ${
                teamFilter === t
                  ? "text-white border-b-2 border-[#1A6BFF]"
                  : "text-gray-500 border-b-2 border-transparent"
              }`}>
              {t === "all" ? `All (${athletes.length})` : `${t} (${athletes.filter(a => a.team_color === t).length})`}
            </button>
          ))}
          <button
            onClick={async () => { setShowConsensus(true); await loadConsensus(); }}
            className="px-3 py-1.5 bg-amber-600/20 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-semibold hover:bg-amber-600/30"
          >
            Consensus
          </button>
        </div>
      </div>

      {/* ── Jersey grid ────────────────────────────────────── */}
      {/* Pending sync banner */}
      {!online && Object.keys(pending).length > 0 && (
        <div className="mx-3 mt-3 flex items-center gap-2 bg-amber-950 border border-amber-700/50 rounded-xl px-3 py-2.5">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-300">{Object.keys(pending).length} score{Object.keys(pending).length !== 1 ? 's' : ''} saved locally</p>
            <p className="text-xs text-amber-500 mt-0.5">Will sync automatically when wifi returns. Keep this tab open.</p>
          </div>
        </div>
      )}
      <div className="px-3 pt-3 pb-2">
        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 px-1">
          {[
            { color: "bg-gray-600", label: "Not started" },
            { color: "bg-amber-400", label: "Partial" },
            { color: "bg-green-500", label: "Complete" },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${l.color}`} />
              <span className="text-xs text-gray-400">{l.label}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))" }}>
          {filtered.map(athlete => {
            const status = getStatus(athlete.id, scores, totalCats);
            const isActive = selected?.id === athlete.id;
            const isDark = athlete.team_color === "Dark";

            return (
              <button
                key={athlete.id}
                onClick={() => setSelected(isActive ? null : athlete)}
                className={`relative flex flex-col items-center justify-center rounded-2xl transition-all select-none
                  ${isActive
                    ? "bg-[#1A6BFF] border-2 border-orange-300 ring-4 ring-[#1A6BFF]/40 scale-105 shadow-xl shadow-orange-900/40"
                    : status === "complete"
                    ? "bg-green-600 border-2 border-green-400"
                    : status === "partial"
                    ? "bg-amber-500 border-2 border-amber-300"
                    : "bg-gray-700 border-2 border-gray-600 hover:border-gray-400"
                  }`}
                style={{ aspectRatio: "1", minHeight: "52px" }}
              >
                {/* Team color dot */}
                <div className={`w-2 h-2 rounded-full mb-0.5 ${isDark ? "bg-gray-900 border border-gray-400" : "bg-white border border-gray-400"}`} />
                <span className="text-sm font-bold leading-none">
                  {athlete.jersey_number ?? "?"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Score panel ─────────────────────────────────────── */}
      {selected && (
        <div className="mx-3 mb-3 bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden">
          {/* Player header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700">
            <button onClick={() => navigate(-1)} disabled={selectedIdx <= 0}
              className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 rounded-lg">
              <ChevronLeft size={18} />
            </button>
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-2">
                <div className={`w-5 h-5 rounded-full border-2 ${selected.team_color === "Dark" ? "bg-gray-800 border-gray-400" : "bg-white border-gray-400"}`} />
                <span className="font-bold text-white">#{selected.jersey_number ?? "?"}</span>
                <span className="text-white font-semibold">{selected.last_name}, {selected.first_name}</span>
              </div>
              {selected.external_id && <div className="text-xs text-gray-400 mt-0.5">{selected.external_id}{selected.position ? ` · ${selected.position}` : ""}</div>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => navigate(1)} disabled={selectedIdx >= filtered.length - 1}
                className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 rounded-lg">
                <ChevronRight size={18} />
              </button>
              <button onClick={() => setSelected(null)}
                className="p-1.5 text-gray-500 hover:text-white rounded-lg">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Scoring categories */}
          <div className="px-4 py-3 space-y-5">
            {scoringCats.map(cat => {
              const current = scores[selected.id]?.cats?.[cat.id];
              return (
                <div key={cat.id}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-200">{cat.name}</span>
                    <div className="flex items-center gap-2">
                      {current !== null && current !== undefined && (
                        <>
                          <span className="text-xl font-bold text-[#1A6BFF]">{current}</span>
                          <button onClick={() => updateScore(selected.id, cat.id, null)}
                            className="text-gray-600 hover:text-gray-400">
                            <RotateCcw size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Slider + manual input */}
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={increment}
                      max={scale}
                      step={increment}
                      value={current ?? 0}
                      onChange={e => updateScore(selected.id, cat.id, parseFloat(e.target.value))}
                      className="flex-1 h-3 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: current
                          ? `linear-gradient(to right, #1A6BFF 0%, #1A6BFF ${((current - increment) / (scale - increment)) * 100}%, #374151 ${((current - increment) / (scale - increment)) * 100}%, #374151 100%)`
                          : "#374151",
                        accentColor: "#1A6BFF"
                      }}
                    />
                    <input
                      type="number"
                      min={increment}
                      max={scale}
                      step={increment}
                      value={current ?? ""}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val >= increment && val <= scale) updateScore(selected.id, cat.id, val);
                      }}
                      placeholder="—"
                      className="w-16 bg-gray-800 border border-gray-600 rounded-xl text-center text-lg font-bold text-white focus:outline-none focus:border-[#1A6BFF] py-2"
                    />
                  </div>
                </div>
              );
            })}

            {/* Notes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-200">Notes</span>
                {notesMode && <span className="text-xs text-green-400 font-medium animate-pulse">● Recording</span>}
              </div>
              <textarea
                value={scores[selected.id]?.notes || ""}
                onChange={e => updateNotes(selected.id, e.target.value)}
                placeholder={voiceOn ? `Voice active — say "Notes" to dictate, or type here` : "Type notes here, or use voice..."}
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#1A6BFF] resize-none"
              />
            </div>

            {/* Sync status for this player */}
            {pending[selected.id] && (
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <WifiOff size={12} />
                {online ? "Syncing..." : "Saved locally — will sync when online"}
              </div>
            )}
          </div>
        </div>
      )}

      {athletes.length === 0 && !isLoading && (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm px-8 text-center">
          No checked-in players yet. Check players in first, then come back to score.
        </div>
      )}

      {athletes.length > 0 && !selected && (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          Tap a jersey to score
        </div>
      )}

      {/* ── Voice bar — fixed at bottom ─────────────────────── */}
      {!online && voiceMode === 'unavailable' && (
        <div className="fixed bottom-16 left-0 right-0 z-20 px-4 pb-1">
          <div className="max-w-2xl mx-auto bg-amber-950 border border-amber-700 rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="text-amber-400 text-xs">⚠️</span>
            <span className="text-xs text-amber-300">Voice unavailable offline — tap to score. Audio feedback still works.</span>
          </div>
        </div>
      )}
      <div className={`fixed bottom-0 left-0 right-0 z-20 border-t transition-colors duration-200 ${
        voiceOn
          ? notesMode
            ? "bg-green-950 border-green-700"
            : "bg-blue-950 border-blue-700"
          : "bg-gray-900 border-gray-800"
      }`}>
        <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
          {/* Mic button */}
          <button
            onClick={toggleVoice}
            className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
              voiceOn
                ? notesMode
                  ? "bg-green-500 text-white shadow-lg shadow-green-900/50"
                  : "bg-blue-500 text-white shadow-lg shadow-blue-900/50 animate-pulse"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {voiceOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          {/* Status text */}
          <div className="flex-1 min-w-0">
            {voiceOn ? (
              <>
                <div className="text-xs font-medium mb-0.5 truncate" style={{ color: notesMode ? "#86efac" : "#93c5fd" }}>
                  {notesMode ? "📝 Notes mode — say 'done' to stop" : "🎤 Listening — say 'White 21' · 'Skating 8' · 'Notes'"}
                </div>
                <div className="text-sm text-white truncate">{voiceStatus}</div>
              </>
            ) : (
              <div className="text-xs text-gray-500 leading-snug">
                Voice: "White 21" select · "Skating 8 Puck 7" score · "Notes" dictate · "Next/Back" navigate
              </div>
            )}
          </div>

          {/* Notes mode done button */}
          {voiceOn && notesMode && (
            <button
              onClick={() => { setNotesMode(false); setVoiceStatus("Listening..."); }}
              className="flex-shrink-0 px-3 py-1.5 bg-green-700 text-green-100 rounded-lg text-xs font-semibold"
            >
              Done Notes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ScorePage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" />
        </div>
      }>
        <ScoringInterface />
      </Suspense>
    </QueryClientProvider>
  );
}
