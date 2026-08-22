"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useParams } from "next/navigation";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Mic, MicOff, ArrowLeft, WifiOff, ChevronLeft, ChevronRight, ChevronDown, X, RotateCcw, RefreshCw, BookOpen, Settings as SettingsIcon, Send } from "lucide-react";
import { findBestCategoryMatch, extractCandidates, buildAliasLookup, normalizeForMatch, normalizeSpokenNumbers } from "@/lib/voiceMatch";
import { isCapacitorApp, createNativeContinuousRecognizer, isAppleSpeechFlaky } from "@/lib/speechAdapter";
import { useTrackPageView, logClientEvent } from "@/lib/useAnalytics";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";
import SessionRosterModal from "@/components/SessionRosterModal";

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

// ── Audio feedback (Web Audio API — works through Bluetooth) ──────────────
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playTone(freq, duration = 0.12, type = "sine") {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {}
}
// Short rising chirp — score saved
function beepScoreSaved() { playTone(880, 0.08); setTimeout(() => playTone(1320, 0.1), 80); }
// Two quick tones — player selected
function beepPlayerSelected() { playTone(660, 0.06); setTimeout(() => playTone(880, 0.06), 70); }
// Ascending triple — notes mode started
function beepNotesStart() { playTone(523, 0.08); setTimeout(() => playTone(659, 0.08), 90); setTimeout(() => playTone(784, 0.1), 180); }
// Descending triple — notes mode ended
function beepNotesEnd() { playTone(784, 0.08); setTimeout(() => playTone(659, 0.08), 90); setTimeout(() => playTone(523, 0.1), 180); }
// Low buzz — not understood
function beepError() { playTone(220, 0.15, "square"); }
function beepEdge() { playTone(440, 0.1); }

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
  const [viewMode, setViewMode] = useState("card"); // "card" | "grid" | "numpad"
  const [calibration, setCalibration] = useState(null);
  const [calibrationDismissed, setCalibrationDismissed] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareCount, setCompareCount] = useState(0);
  const [scores, setScores] = useState({});
  const [pending, setPending] = useState({});
  const [online, setOnline] = useState(true);
  const [voiceOn, setVoiceOn] = useState(false);
  const [showConsensus, setShowConsensus] = useState(false);
  const [consensusData, setConsensusData] = useState(null);
  const [consensusLoading, setConsensusLoading] = useState(false);
  const [reviewedFlags, setReviewedFlags] = useState(new Set());
  const [consensusEvalFilter, setConsensusEvalFilter] = useState("");
  const [closing, setClosing] = useState(false);
  const [excusalNeeded, setExcusalNeeded] = useState(null); // [{athlete_id, name, position}] awaiting a reason
  const [excusals, setExcusals] = useState({});             // { athlete_id: 'absent' | 'injured' }
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceMode, setVoiceMode] = useState('checking'); // checking | live | degraded | unavailable
  const [notesMode, setNotesMode] = useState(false);
  const [teamFilter, setTeamFilter] = useState("all");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [jerseySearch, setJerseySearch] = useState("");
  const [showRoster, setShowRoster] = useState(false);
  const [showPings, setShowPings] = useState(false);
  const [pingText, setPingText] = useState("");
  const [pingSending, setPingSending] = useState(false);
  const [lastSeenPingId, setLastSeenPingId] = useState(0);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [addPlayerForm, setAddPlayerForm] = useState({ first_name: "", last_name: "", jersey_number: "", team_color: "White" });
  const [addPlayerSaving, setAddPlayerSaving] = useState(false);
  const [addPlayerError, setAddPlayerError] = useState("");
  const [collapseList, setCollapseList] = useState(false); // hide player grid while scoring a selected player
  const [viewerKind, setViewerKind] = useState(null); // 'goalie' | 'coach' | 'standard' — scopes the roster
  const [listExpanded, setListExpanded] = useState(false); // temporary re-open of the grid when collapsed
  const [syncStatus, setSyncStatus] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [theme, toggleTheme] = useTheme();

  // Refs for voice callbacks (avoid stale closures)
  const notesModeRef = useRef(false);
  const selectedRef = useRef(null);
  const scoresRef = useRef({});
  const athletesRef = useRef([]);
  const scoringCatsRef = useRef([]);
  const scaleRef = useRef(10);
  const incrementRef = useRef(1);
  const recRef = useRef(null);
  const syncTimerRef = useRef({}); // per-athlete debounce timers (keyed by athlete id)
  const aliasLookupRef = useRef({});
  // Dedup ref for parseVoice — Android Chrome's continuous recognizer
  // re-emits the same final transcript when it cycles a session, which
  // doubled the success chime. Suppress repeats within a 1200ms window.
  const lastVoiceRef = useRef({ text: "", ts: 0 });
  const deviceChangeRef = useRef(null);

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

  // Load offline data on mount — only after we know who the user is.
  // This runs immediately so the page is usable offline; the server-hydrate
  // query below will then merge in anything newer from the server.
  useEffect(() => {
    if (!currentUserId) return;
    const saved = loadLocal(scheduleId, currentUserId);
    const { _saved, _scheduleId, ...athleteScores } = saved;
    if (Object.keys(athleteScores).length) {
      setScores(athleteScores);
      // Treat everything on the device as pending → the flush loop re-syncs it so
      // a reload can never orphan a score that hadn't reached the server yet
      // (server upsert is idempotent, so re-syncing already-saved scores is safe).
      setPending(p => { const n = { ...p }; for (const id of Object.keys(athleteScores)) n[id] = true; return n; });
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

  // Online/offline. Fire analytics on transitions so we can answer 'how
  // often does the connection drop during scoring?' — a major perf signal.
  useEffect(() => {
    const go = () => { setOnline(true); logClientEvent("offline.recovered", { metadata: { scheduleId } }); };
    const stop = () => { setOnline(false); logClientEvent("offline.entered", { metadata: { scheduleId } }); };
    window.addEventListener("online", go);
    window.addEventListener("offline", stop);
    setOnline(navigator.onLine);
    return () => { window.removeEventListener("online", go); window.removeEventListener("offline", stop); };
  }, [scheduleId]);

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

  // When a new build's service worker takes control, reload ONCE to a clean,
  // consistent build — prevents stale page / mismatched-chunk states after a
  // deploy (scores are safe in localStorage and re-hydrate on reload).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let refreshing = false;
    const onChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
  }, []);

  const { data: sessionData, isLoading, refetch: refetchSession } = useQuery({
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

  // Scope the roster to this evaluator's kind: goalie evaluators only see goalies,
  // skater evaluators only see skaters (goalies are graded separately).
  useEffect(() => {
    if (!catId) return;
    fetch(`/api/evaluator/kind?cat=${catId}`)
      .then(r => r.json())
      .then(d => setViewerKind(d.kind || "standard"))
      .catch(() => setViewerKind("standard"));
  }, [catId]);
  // Time spent in a scoring session — fires once on unmount with duration_ms.
  // Metadata is read from a ref at flush time so the catId/scheduleId are
  // current even though the hook bound on first mount.
  useTrackPageView("session.scoring", { catId, scheduleId });
  // Hide athlete names from evaluators when the category opts in (default
  // true). Evaluators see jersey color + number, matching the Buttons /
  // Numpad views and removing identity bias from scoring. Default true while
  // catData is still loading so we never accidentally flash names first.
  const helmetMode = !!sessionData?.helmet_mode;
  // Helmet mode forces anonymous display — evaluators see the sticker #, never names.
  const isAnon = helmetMode || (catData?.category?.evaluators_anonymous ?? true);
  const teamLabel = (a) => a?.team_color === "Dark" ? "Dark" : "Light";
  // What the evaluator sees for a player: helmet sticker # in helmet mode, else jersey #.
  const idOf = (a) => helmetMode ? (a?.helmet_number || "?") : (a?.jersey_number ?? "?");
  const anonLabel = (a) => `${teamLabel(a)} ${idOf(a)}`;
  const scheduleData = sessionData?.schedule;
  // Read-only when this evaluator has closed (locked) their own session. The
  // server also rejects edits — this just keeps the UI honest.
  const readOnly = !!scheduleData?.my_closed;

  // ── Cross-device hydrate ─────────────────────────────────────────────
  // Pull this evaluator's existing scores + notes for THIS session from the
  // server. Without this query, switching devices (phone -> tablet, dead
  // battery -> backup) shows an empty scoring screen because localStorage
  // is per-device. React Query's default refetchOnWindowFocus also picks up
  // edits made on another device while this tab is open.
  const hydrateEnabled = !!(currentUserId && catId && scheduleData?.session_number);
  const { data: hydrateData } = useQuery({
    queryKey: ["score-hydrate", scheduleId, catId, scheduleData?.session_number, currentUserId],
    queryFn: async () => {
      const params = new URLSearchParams({
        schedule_id: scheduleId,
        category_id: String(catId),
        session_number: String(scheduleData.session_number),
        hydrate: "1",
      });
      const res = await fetch(`/api/evaluator/scores?${params}`);
      if (!res.ok) throw new Error("hydrate failed");
      return res.json();
    },
    enabled: hydrateEnabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Real-time min/max of other evaluators' scores ("Room") was removed on
  // request -- showing evaluators the live spread of everyone else's scores
  // while they're still scoring creates anchoring/groupthink pressure to
  // converge instead of scoring independently. Cross-evaluator disagreement
  // is handled the right way already: the Consensus review below, which
  // compares independently-entered scores AFTER the fact and flags real
  // outliers for discussion, rather than nudging live scores toward a group
  // average before they're even entered.

  // Cross-group floor: lowest score any athlete got in a group that went BEFORE
  // this one, THIS session. Groups within a session never play each other, but
  // all get pooled into one ranking -- this is the "score above group 1's floor"
  // signal a director asked for so group 2+ evaluators don't undercut someone
  // who's clearly better than the weakest player already scored.
  const { data: floorData } = useQuery({
    queryKey: ["session-floor", catId, scheduleData?.session_number, scheduleData?.group_number],
    queryFn: async () => {
      const params = new URLSearchParams({
        category_id: String(catId),
        session_number: String(scheduleData.session_number),
        group_number: String(scheduleData.group_number),
      });
      const res = await fetch(`/api/evaluator/session-floor?${params}`);
      if (!res.ok) throw new Error("floor fetch failed");
      return res.json();
    },
    enabled: !!(catId && scheduleData?.session_number && scheduleData?.group_number > 1 && online),
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });

  // Every group's score range for this session (not just earlier ones) --
  // group-level calibration, never a per-player flag, so it can't anchor an
  // evaluator's opinion of any one kid the way naming a "bubble" player would.
  const [showRanges, setShowRanges] = useState(false);
  const { data: rangesData } = useQuery({
    queryKey: ["session-ranges", catId, scheduleData?.session_number],
    queryFn: async () => {
      const params = new URLSearchParams({ category_id: String(catId), session_number: String(scheduleData.session_number) });
      const res = await fetch(`/api/evaluator/session-ranges?${params}`);
      if (!res.ok) throw new Error("ranges fetch failed");
      return res.json();
    },
    enabled: !!(catId && scheduleData?.session_number && showRanges && online),
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });

  // Quick live pings between the evaluators actually on this session --
  // "running late", "anyone see a black #23?" -- polled regardless of
  // whether the panel is open so the unread badge stays live while scoring.
  const { data: pingsData, refetch: refetchPings } = useQuery({
    queryKey: ["session-pings", scheduleId],
    queryFn: async () => {
      const res = await fetch(`/api/evaluator/session-pings?schedule_id=${scheduleId}`);
      if (!res.ok) throw new Error("pings fetch failed");
      return res.json();
    },
    enabled: !!scheduleId && online && !readOnly,
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
  });
  const pings = pingsData?.pings || [];
  useEffect(() => {
    if (!scheduleId) return;
    const saved = parseInt(localStorage.getItem(`ar_pings_seen_${scheduleId}`) || "0");
    setLastSeenPingId(saved);
  }, [scheduleId]);
  const unreadPings = pings.filter(p => p.id > lastSeenPingId).length;
  // Small pop-up notification when a new ping arrives from someone else while
  // the panel's closed -- the badge alone only shows once you open Settings,
  // which defeats "quickly tell the group something" if nobody's looking.
  // lastToastedPingId starts at null so the very first load just sets a
  // baseline instead of toasting the whole existing history at once.
  const [pingToast, setPingToast] = useState(null);
  const [lastToastedPingId, setLastToastedPingId] = useState(null);
  useEffect(() => {
    if (!pingsData) return;
    const maxId = pings.reduce((m, p) => Math.max(m, p.id), 0);
    if (lastToastedPingId === null) { setLastToastedPingId(maxId); return; }
    if (maxId > lastToastedPingId) {
      const newest = pings.find(p => p.id === maxId);
      if (newest && newest.user_id !== pingsData.meUserId && !showPings) {
        setPingToast(newest);
        setTimeout(() => setPingToast(t => (t?.id === newest.id ? null : t)), 6000);
      }
      setLastToastedPingId(maxId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pingsData]);
  const markPingsSeen = () => {
    const maxId = pings.reduce((m, p) => Math.max(m, p.id), 0);
    if (maxId > lastSeenPingId) {
      setLastSeenPingId(maxId);
      try { localStorage.setItem(`ar_pings_seen_${scheduleId}`, String(maxId)); } catch {}
    }
  };
  const sendPing = async (text) => {
    const msg = text.trim();
    if (!msg || pingSending) return;
    setPingSending(true);
    try {
      await fetch("/api/evaluator/session-pings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule_id: scheduleId, message: msg }),
      });
      setPingText("");
      await refetchPings();
    } catch { /* transient network failure -- the input just stays filled to retry */ }
    setPingSending(false);
  };
  // Keep the unread count at zero while the panel's actually open, including
  // pings that arrive mid-conversation via the 8s poll.
  useEffect(() => { if (showPings) markPingsSeen(); }, [showPings, pings.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scoring guide: "what does a 0 look like, what does a 10 look like" per skill,
  // for the age tier this category belongs to. Reference content, not calibration
  // data, so it's fetched once and doesn't need polling.
  const [guideOpen, setGuideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data: guideData } = useQuery({
    queryKey: ["scoring-rubrics", catId],
    queryFn: async () => {
      const res = await fetch(`/api/scoring-rubrics?category_id=${catId}`);
      if (!res.ok) throw new Error("guide fetch failed");
      return res.json();
    },
    enabled: !!catId,
    staleTime: 5 * 60_000,
  });
  const hasGuideContent = (guideData?.guide || []).some(g => g.bands.length > 0);

  // Merge server scores into local state + write merged result back to
  // localStorage so the next offline reload has the server's data too.
  //
  // INITIAL hydrate (first time the query resolves for this session): server
  // wins on overlap — this is the cross-device case where Device B opens a
  // session Device A has been scoring; we want everything from the server.
  //
  // SUBSEQUENT hydrates (window-focus refetches): LOCAL wins on overlap.
  // Server only fills in cells the local evaluator hasn't touched yet. This
  // prevents a stale background refetch from clobbering a score the user
  // just typed but hasn't synced yet.
  const initialHydrateDoneRef = useRef(false);
  useEffect(() => {
    if (!hydrateData?.scores || !currentUserId) return;
    const serverScores = hydrateData.scores;
    const isInitial = !initialHydrateDoneRef.current;

    if (!Object.keys(serverScores).length) {
      initialHydrateDoneRef.current = true;
      return;
    }

    setScores(prev => {
      const merged = { ...prev };
      let changed = 0;
      for (const [aidStr, srv] of Object.entries(serverScores)) {
        const aid = aidStr;
        const local = merged[aid] || { cats: {}, notes: "" };
        // ALWAYS local-wins on overlap — a score typed on this device must never
        // be silently overwritten by an older server value (that was a data-loss
        // path). Server still fills in cells this device hasn't touched (which also
        // recovers scores made on another device / before a reload).
        const mergedCats = { ...srv.cats, ...local.cats };
        // Notes: prefer the longer string (typed offline continuations beat
        // a stale short server note; on initial hydrate this also recovers
        // a long note from another device).
        const mergedNotes = (srv.notes || "").length > (local.notes || "").length
          ? (srv.notes || "")
          : (local.notes || "");
        const before = JSON.stringify(local);
        const after = JSON.stringify({ cats: mergedCats, notes: mergedNotes });
        if (before !== after) changed++;
        merged[aid] = { cats: mergedCats, notes: mergedNotes };
      }
      saveLocal(scheduleId, currentUserId, merged);
      if (changed > 0 && isInitial) {
        setSyncStatus(`Loaded ${changed} athlete${changed === 1 ? "" : "s"} from server ✓`);
        setTimeout(() => setSyncStatus(""), 3500);
      }
      return merged;
    });

    initialHydrateDoneRef.current = true;
  }, [hydrateData, currentUserId, scheduleId]);

  // Fetch calibration data (previous session comparison)
  useEffect(() => {
    if (!catId || !scheduleData?.session_number) return;
    fetch(`/api/evaluator/calibration?category_id=${catId}&session_number=${scheduleData.session_number}`)
      .then(r => r.json())
      .then(d => { if (d.calibration) setCalibration(d.calibration); })
      .catch(() => {});
  }, [catId, scheduleData?.session_number]);


  // Precache all session assets while online so the page works in dead-wifi rinks
  // Fires once when both session data and category data have loaded successfully
  useEffect(() => {
    if (!sessionData?.schedule || !catData?.scoringCategories) return;
    if (!navigator.onLine) return;
    if (!('serviceWorker' in navigator)) return;
    if (!sessionData?.schedule?.category_id) return;
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

  // Roster scoping. Goalie evaluators ONLY ever see goalies. Player evaluators
  // see skaters and — only if the category toggles it on — goalies too (the odd
  // case where a player evaluator also grades goalies; off by default).
  const isGoalieEvaluator = viewerKind === "goalie";
  const allowPlayerGoalies = !!catData?.category?.players_eval_goalies;
  const inRosterScope = (a) => {
    if (viewerKind == null) return true; // until kind loads
    const isG = (a.position || "").toLowerCase() === "goalie";
    if (isGoalieEvaluator) return isG;
    return isG ? allowPlayerGoalies : true;
  };
  const athletes = (sessionData?.athletes || []).filter(a => a.checked_in && inRosterScope(a));
  const teamColors = sessionData?.checkinSession?.team_colors || ["White", "Dark"];
  // Categories follow the active position: the selected athlete when one is picked,
  // else the roster composition. Goalies → goalie categories; skaters → skater ones.
  const activeIsGoalie = selected
    ? (selected.position || "").toLowerCase() === "goalie"
    : isGoalieEvaluator || (athletes.length > 0 && athletes.every(a => (a.position || "").toLowerCase() === "goalie"));
  // The goalie skills session (the goalie equivalent of testing) is scored on its
  // own drill categories (applies_to='goalie_skills'); scrimmages use the standard
  // goalie categories. Identify the current session's type from the setup config.
  const currentSessionType = (catData?.sessions || []).find(s => Number(s.session_number) === Number(scheduleData?.session_number))?.session_type;
  const hasGoalieSkillsCats = (catData?.scoringCategories || []).some(c => c.applies_to === "goalie_skills");
  // Goalies do their skills drills in the session-1 slot — whether it's typed
  // 'goalie_skills' or the players' 'testing' session (goalies don't run timed testing).
  const isGoalieSkillsSession = (currentSessionType === "goalie_skills" || currentSessionType === "testing") && hasGoalieSkillsCats;
  const scoringCats = (catData?.scoringCategories || []).filter(c => {
    if (activeIsGoalie) {
      // Skills session → the four drills; scrimmages → standard goalie categories
      // (falling back to shared 'all' categories when no goalie set is defined).
      return isGoalieSkillsSession ? c.applies_to === "goalie_skills" : (c.applies_to === "goalies" || c.applies_to === "all");
    }
    // Skaters never see the goalie or goalie-skills sets.
    return c.applies_to !== "goalies" && c.applies_to !== "goalie_skills";
  });
  // Goalies can be graded on their own scale/increment (set in Goalie Scoring);
  // fall back to the skater scale when no goalie-specific value is configured.
  const goalieCfg = catData?.category?.goalie_config || null;
  const scale = (activeIsGoalie && goalieCfg?.scale) || catData?.category?.scoring_scale || 10;
  const increment = (activeIsGoalie && goalieCfg?.increment) || catData?.category?.scoring_increment || 1;
  const totalCats = scoringCats.length;

  useEffect(() => { athletesRef.current = athletes; }, [athletes]);
  useEffect(() => { scoringCatsRef.current = scoringCats; }, [scoringCats]);
  useEffect(() => {
    aliasLookupRef.current = buildAliasLookup(scoringCats.map(c => c.name));
  }, [scoringCats]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { incrementRef.current = increment; }, [increment]);

  const jq = jerseySearch.trim().toLowerCase();
  const matchesSearch = (a) => {
    if (!jq) return true;
    if (String(idOf(a) ?? "").toLowerCase().includes(jq)) return true;
    if (!isAnon) return `${a.first_name || ""} ${a.last_name || ""}`.toLowerCase().includes(jq);
    return false;
  };
  const sortKey = (a) => (helmetMode ? (parseInt(a.helmet_number) || 9999) : (a.jersey_number || 999));
  const filtered = (teamFilter === "all" ? athletes : athletes.filter(a => a.team_color === teamFilter))
    .filter(a => !hideCompleted || getStatus(a.id, scores, totalCats) !== "complete")
    .filter(matchesSearch)
    .sort((a,b) => sortKey(a) - sortKey(b));

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

  // Debounced auto-sync — waits 3s after the last tap, PER ATHLETE. A separate
  // timer per athlete means scoring athlete B never cancels athlete A's pending
  // sync (the old single shared timer dropped A's scores on the floor). The
  // periodic flush below is the safety net that guarantees eventual delivery.
  const debouncedSync = useCallback((athleteId, currentScores) => {
    if (!online) return;
    clearTimeout(syncTimerRef.current[athleteId]);
    syncTimerRef.current[athleteId] = setTimeout(async () => {
      setSyncStatus("Syncing...");
      const ok = await syncToServer(athleteId, currentScores);
      setSyncStatus(ok ? "Saved ✓" : "Sync failed — saved locally");
      setTimeout(() => setSyncStatus(""), 2000);
    }, 3000);
  }, [online, syncToServer]);

  // Safety net: while online, retry ANY still-pending athlete every 12s using the
  // latest local scores. Guarantees a score reaches the server even if its debounce
  // was cancelled, a single sync failed, or the tab was reloaded (pending is
  // restored from localStorage on mount). Idempotent upsert on the server.
  useEffect(() => {
    if (!online) return;
    const iv = setInterval(() => {
      const ids = Object.keys(pending);
      if (!ids.length) return;
      ids.forEach(id => syncToServer(parseInt(id), scoresRef.current));
    }, 12000);
    return () => clearInterval(iv);
  }, [online, pending, syncToServer]);

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

  // Manual "push everything now" — for the rare case auto-sync didn't fire.
  const resyncNow = useCallback(async () => {
    const ids = Object.keys(pending);
    if (!ids.length) { setSyncStatus("Nothing to sync — all saved ✓"); setTimeout(() => setSyncStatus(""), 2500); return; }
    if (!online) { setSyncStatus("You're offline — scores are safe on this device and will sync when you reconnect."); setTimeout(() => setSyncStatus(""), 4000); return; }
    setSyncStatus(`Syncing ${ids.length}…`);
    let ok = 0;
    for (const id of ids) { if (await syncToServer(parseInt(id), scoresRef.current)) ok++; }
    setSyncStatus(ok === ids.length ? "All synced ✓" : `${ok}/${ids.length} synced — the rest are still saved on this device.`);
    setTimeout(() => setSyncStatus(""), 4000);
  }, [pending, online, syncToServer]);

  // Last-resort recovery: export this device's saved scores to a CSV the evaluator
  // can hand to the director/SP if sync never lands. Pure client-side — works offline.
  const downloadBackup = useCallback(() => {
    const cats = scoringCatsRef.current || [];
    const aths = athletesRef.current || [];
    const showName = !isAnon;
    const header = ["Jersey", ...(showName ? ["Name"] : []), "Team", ...cats.map(c => c.name), "Notes"];
    const rows = [header];
    for (const a of aths) {
      const s = scoresRef.current[a.id];
      if (!s || (!Object.keys(s.cats || {}).length && !(s.notes || "").trim())) continue;
      rows.push([
        a.jersey_number ?? "",
        ...(showName ? [`${a.first_name || ""} ${a.last_name || ""}`.trim()] : []),
        a.team_color || "",
        ...cats.map(c => (s.cats?.[c.id] ?? "")),
        (s.notes || "").replace(/[\r\n]+/g, " "),
      ]);
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `scores_session_${scheduleId}_${new Date().toISOString().slice(0, 10)}.csv`;
    el.click();
    URL.revokeObjectURL(url);
    setSyncStatus("Downloaded a copy to this device ✓");
    setTimeout(() => setSyncStatus(""), 3000);
  }, [isAnon, scheduleId]);

  // Restorable JSON backup — can be loaded back into this session on ANY device
  // (see restoreFromFile). The escape hatch for the rare "scored offline, device
  // died before syncing" case; on a new device, Restore → it then syncs normally.
  const downloadBackupJson = useCallback(() => {
    const payload = { version: 1, scheduleId, exported_at: new Date().toISOString(), scores: scoresRef.current };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `scores_backup_session_${scheduleId}.json`;
    el.click();
    URL.revokeObjectURL(url);
    setSyncStatus("Backup file saved ✓");
    setTimeout(() => setSyncStatus(""), 3000);
  }, [scheduleId]);

  const restoreFromFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = parsed?.scores && typeof parsed.scores === "object" ? parsed.scores : parsed;
      if (parsed?.scheduleId && String(parsed.scheduleId) !== String(scheduleId)) {
        if (!confirm("This backup is from a different session. Restore into this one anyway?")) return;
      }
      let count = 0;
      const restoredIds = [];
      setScores(prev => {
        const merged = { ...prev };
        for (const [aid, val] of Object.entries(incoming)) {
          if (aid.startsWith("_") || !val || typeof val !== "object" || !("cats" in val)) continue;
          const local = merged[aid] || { cats: {}, notes: "" };
          merged[aid] = {
            cats: { ...local.cats, ...(val.cats || {}) },
            notes: (val.notes || "").length > (local.notes || "").length ? (val.notes || "") : (local.notes || ""),
          };
          restoredIds.push(aid);
          count++;
        }
        saveLocal(scheduleId, currentUserId, merged);
        return merged;
      });
      // Mark restored athletes pending so they sync to the server next chance
      setPending(p => { const n = { ...p }; restoredIds.forEach(id => { n[id] = true; }); return n; });
      setSyncStatus(count ? `Restored ${count} athlete${count === 1 ? "" : "s"} from backup ✓` : "No scores found in that file.");
      setTimeout(() => setSyncStatus(""), 4000);
    } catch {
      setSyncStatus("Couldn't read that backup file.");
      setTimeout(() => setSyncStatus(""), 3000);
    }
  }, [scheduleId, currentUserId]);

  // ── Core score setter ─────────────────────────────────────────────────────
  // allowToggle=true (default, used by tap UI): tapping a button that's
  //   already at this value clears it — convenient for "I clicked the wrong
  //   one, tap to undo."
  // allowToggle=false (used by voice): always set the value as given.
  //   Android Chrome's continuous recognizer occasionally emits the same
  //   final transcript twice when a recognition session restarts; with
  //   toggling on, the duplicate call would clear a just-spoken score.
  const updateScore = useCallback((athleteId, catId, value, { allowToggle = true } = {}) => {
    if (readOnly) return;
    setScores(prev => {
      const existing = prev[athleteId]?.cats?.[catId];
      const newVal = allowToggle && existing === value ? null : value;
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
    if (readOnly) return;
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

  // ── Auto-advance (Buttons mode) ────────────────────────────────────────────
  // After scoring category `i`, gently scroll the next still-unscored category
  // into view so the evaluator's eyes/thumb land on it. APPEARANCE only — no
  // scores are read or written here. Skips when the tap CLEARED a value
  // (toggle-off) and when every category is now scored.
  const advanceToNextUnscored = useCallback((i, wasToggleOff) => {
    if (wasToggleOff) return; // tapping the same value clears it — don't advance
    setTimeout(() => {
      const cats = scoringCatsRef.current || [];
      const sel = selectedRef.current;
      if (!sel) return;
      const filled = scoresRef.current[sel.id]?.cats || {};
      let nextIdx = -1;
      for (let j = i + 1; j < cats.length; j++) {
        const v = filled[cats[j].id];
        if (v === null || v === undefined) { nextIdx = j; break; }
      }
      // wrap to any earlier unscored category if everything after i is filled
      if (nextIdx === -1) {
        for (let j = 0; j < i; j++) {
          const v = filled[cats[j].id];
          if (v === null || v === undefined) { nextIdx = j; break; }
        }
      }
      if (nextIdx === -1) return; // all scored — do nothing
      document.querySelector('[data-catblock="' + nextIdx + '"]')
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 0);
  }, []);

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigate = useCallback((dir) => {
    const current = selectedRef.current;
    const list = filtered;
    if (!current) { if (list.length) setSelected(list[0]); return; }
    const idx = list.findIndex(a => a.id === current.id);
    const next = list[idx + dir];
    if (next) { setSelected(next); }
    else { setVoiceStatus(dir > 0 ? "End of list" : "Start of list"); beepEdge(); }
  }, [filtered]);

  // ── Voice ─────────────────────────────────────────────────────────────────
  const parseVoice = useCallback((text) => {
    // Drop duplicate emissions of the same final transcript inside a short
    // window. Android Chrome's continuous recognizer fires the same final
    // twice on session rollover, which previously produced a double chime
    // (and before the toggle fix, also wiped just-set scores).
    const now = Date.now();
    if (lastVoiceRef.current.text === text && now - lastVoiceRef.current.ts < 1200) {
      return;
    }
    lastVoiceRef.current = { text, ts: now };

    // ── Number normalization ─────────────────────────────────
    let normalized = normalizeSpokenNumbers(text);
    const corrected = normalized.replace(/\bfuck\s+skills?/gi, "puck skills").replace(/\bfuck(?=\s)/gi, "puck");
    const t = corrected.trim().toLowerCase();
    setVoiceStatus(`"${text}"${normalized !== text.trim().toLowerCase() ? ' → ' + normalized : ''}`);

    // ── Mic off ──────────────────────────────────────────
    if (/^(mic off|microphone off|stop listening|turn off mic)$/i.test(t)) {
      stopVoice();
      return;
    }

    // ── Finish/stop notes ─────────────────────────────────
    if (/^(finish notes?|stop notes?|end notes?|done notes?|done|close notes?|save notes?|that's it|that is it)$/i.test(t)) {
      setNotesMode(false);
      setVoiceStatus("Notes mode off");
      beepNotesEnd();
      return;
    }

    // ── Notes dictation mode — append everything ──────────
    if (notesModeRef.current) {
      const a = selectedRef.current;
      if (a) {
        setScores(prev => {
          const existing = prev[a.id]?.notes || "";
          let newNotes;

          if (!existing) {
            newNotes = text;
          } else {
            // Android's recognizer splits dictation into multiple sessions and returns
            // CUMULATIVE text each time ("quick" → "quick skeeter" → "quick skeeter and").
            // Compare against just the last segment (after final ". "), then merge smart:
            //   - exact same → skip
            //   - new extends last → replace last with new (it's the grown version)
            //   - last extends new → skip (we already have the longer version)
            //   - genuinely new → append with ". " separator
            const lastSepIdx = existing.lastIndexOf(". ");
            const lastSegment = lastSepIdx >= 0 ? existing.slice(lastSepIdx + 2) : existing;
            const prefix = lastSepIdx >= 0 ? existing.slice(0, lastSepIdx + 2) : "";
            const lastLower = lastSegment.trim().toLowerCase();
            const textLower = text.trim().toLowerCase();

            if (textLower === lastLower) {
              return prev;
            } else if (textLower.startsWith(lastLower) && lastLower.length > 0) {
              newNotes = prefix + text;
            } else if (lastLower.startsWith(textLower) && textLower.length > 0) {
              return prev;
            } else {
              newNotes = existing + ". " + text;
            }
          }

          const updated = {
            ...prev,
            [a.id]: { cats: prev[a.id]?.cats || {}, notes: newNotes }
          };
          saveLocal(scheduleId, currentUserId, updated);
          return updated;
        });
        setVoiceStatus(`Note added ✓`);
      }
      return;
    }

    // ── Start notes ───────────────────────────────────────
    if (/^(start notes?|notes?|add notes?|take notes?|begin notes?|open notes?|record notes?)$/i.test(t)) {
      if (!selectedRef.current) { setVoiceStatus("Select a player first"); beepError(); return; }
      setNotesMode(true);
      setVoiceStatus("Notes mode — speak freely, say 'finish notes' to stop");
      beepNotesStart();
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
        x => x.team_color?.toLowerCase() === color.toLowerCase() && (x.jersey_number === jersey || String(x.helmet_number) === String(jersey))
      );
      if (a) { setSelected(a); setVoiceStatus(isAnon ? `Selected: ${color} #${jersey}` : `Selected: ${color} #${jersey} — ${a.last_name}`); beepPlayerSelected(); }
      else { setVoiceStatus(`${color} #${jersey} not found`); beepError(); }
      return;
    }

    // ── Just a jersey number ──────────────────────────────
    if (/^\d+$/.test(t)) {
      const jersey = parseInt(t);
      const a = athletesRef.current.find(x => x.jersey_number === jersey || String(x.helmet_number) === String(jersey));
      if (a) { setSelected(a); setVoiceStatus(isAnon ? `Selected: #${jersey}` : `Selected: #${jersey} ${a.last_name}`); beepPlayerSelected(); }
      else { setVoiceStatus(`No player with jersey #${jersey}`); beepError(); }
      return;
    }

    // ── Score categories: "skating 8" / "puck skills 7" / "skating 8 puck skills 7" ──
    const cats = scoringCatsRef.current;
    const sel = selectedRef.current;
    if (cats.length) {
      let rangeError = null;
      let scored = 0;
      for (const cat of cats) {
        const catName = cat.name.toLowerCase();
        // Try full name first, then each individual word (for multi-word categories like "Hockey IQ")
        const words = catName.split(/[\s/]+/).filter(w => w.length >= 2);
        const keywords = [
          catName.replace(/[^a-z0-9]/g, "\\s*"), // full name flexible spacing
          ...words,                                // each word individually
        ];
        for (const keyword of keywords) {
          const pattern = new RegExp(keyword + "\\s+(\\d+(?:[.]\\d+)?)", "i");
          const m = t.match(pattern);
          if (m) {
            const val = parseFloat(m[1]);
            const inc = parseFloat(incrementRef.current) || 1;
            const max = parseFloat(scaleRef.current) || 10;
            if (val >= inc && val <= max) {
              if (sel) { updateScore(sel.id, cat.id, val, { allowToggle: false }); scored++; break; }
              else { setVoiceStatus("Select a player first"); beepError(); break; }
            } else if (!rangeError) {
              rangeError = { cat: cat.name, val, inc, max };
            }
          }
        }
      }
      if (scored > 0) { setVoiceStatus(`${scored} score${scored > 1 ? "s" : ""} saved ✓`); beepScoreSaved(); return; }

      // ── Phase 2: Fuzzy fallback when exact matching fails ──
      if (scored === 0 && sel) {
        const candidates = extractCandidates(t);
        const fuzzyMatches = [];
        for (const { phrase, value } of candidates) {
          const inc = parseFloat(incrementRef.current) || 1;
          const max = parseFloat(scaleRef.current) || 10;
          if (value >= inc && value <= max) {
            const result = findBestCategoryMatch(phrase, cats, aliasLookupRef.current);
            if (result) {
              const cat = cats.find(c => normalizeForMatch(c.name) === normalizeForMatch(result.match));
              if (cat) {
                updateScore(sel.id, cat.id, value, { allowToggle: false });
                scored++;
                fuzzyMatches.push({ cat: cat.name, value, heard: phrase, method: result.method });
              }
            }
          } else if (!rangeError) {
            const result = findBestCategoryMatch(phrase, cats, aliasLookupRef.current);
            if (result) rangeError = { cat: result.match, val: value, inc, max };
          }
        }
        if (scored > 0) {
          const parts = fuzzyMatches.map(m =>
            m.method === "alias"
              ? `${m.cat} → ${m.value} ✓`
              : `~${m.cat} → ${m.value} (heard '${m.heard}')`
          );
          setVoiceStatus(parts.join(" · "));
          beepScoreSaved();
          return;
        }
      }
      if (scored === 0 && rangeError) {
        setVoiceStatus(`${rangeError.cat}: ${rangeError.val} out of range (${rangeError.inc}–${rangeError.max})`);
        beepError();
        return;
      }
    }

    // ── Navigation ────────────────────────────────────────
    if (/^next$/.test(t)) { navigate(1); return; }
    if (/^(prev|previous|back)$/.test(t)) { navigate(-1); return; }

    setVoiceStatus(`Not understood: "${text}"`);
    // No buzz on fall-through. Random transcription chatter (single words,
    // partial commands, throat clears) hits this branch constantly and
    // beeping every time was unbearable. Specific failure branches above
    // (player not found, no player selected) still buzz so real command
    // misses get audible feedback.

  }, [scheduleId, updateScore, navigate]);

  const loadConsensus = async () => {
    setConsensusLoading(true);
    const res = await fetch(`/api/categories/${catId}/consensus?schedule_id=${scheduleId}&session=${scheduleData?.session_number}`);
    const data = await res.json();
    setConsensusData(data);
    setConsensusLoading(false);
  };

  // After the lock is set, run the existing consensus/flag-review notify and leave.
  const finishClose = async () => {
    const flagged = consensusData?.athletes?.filter(a => a.flagged) || [];
    const unreviewed = flagged.filter(a => !reviewedFlags.has(a.athlete_id));
    try {
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
    } catch { /* integrity notify is best-effort; the lock is already set */ }
    window.location.href = "/evaluator/dashboard";
  };

  // Server-authoritative close: it tells us if any checked-in player is neither
  // scored nor excused. If so, we prompt for a reason (absent/injured); once
  // every player is scored-or-excused, it locks the session.
  const attemptClose = async (exc) => {
    setClosing(true);
    try {
      const source = exc || excusals;
      const excArr = Object.entries(source).map(([athlete_id, reason]) => ({ athlete_id: Number(athlete_id), reason }));
      const res = await fetch("/api/evaluator/close-session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule_id: scheduleId, excusals: excArr }),
      });
      const d = await res.json();
      if (d.need_marking?.length) { setExcusalNeeded(d.need_marking); setClosing(false); return; }
      if (!res.ok || !d.success) { alert(d.error || "Couldn't close the session. Please try again."); setClosing(false); return; }
      setExcusalNeeded(null);
      await finishClose();
    } catch { alert("Couldn't close — check your connection and try again."); setClosing(false); }
  };

  // Entry point from the consensus modal's "Close Session" button.
  const closeSession = async () => {
    if (!confirm("Save and close this session? Once closed you won't be able to edit it unless your SP or association reopens it.")) return;
    await attemptClose();
  };

  const stopVoice = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setVoiceOn(false);
    setVoiceStatus("");
    setNotesMode(false);
  }, []);

  const restartVoice = useCallback(() => {
    if (recRef.current) {
      recRef.current.stop(); // onend handler auto-restarts
      setVoiceStatus("Mic restarted");
    }
  }, []);

  const toggleVoice = useCallback(async () => {
    if (voiceOn) {
      recRef.current?.stop();
      recRef.current = null;
      setVoiceOn(false);
      setVoiceStatus("");
      setNotesMode(false);
      // Clean up device change listener
      if (deviceChangeRef.current) {
        navigator.mediaDevices?.removeEventListener('devicechange', deviceChangeRef.current);
        deviceChangeRef.current = null;
      }
      logClientEvent("voice.toggled", { metadata: { state: "off", scheduleId } });
      return;
    }
    // ── Native app: use Capacitor speech plugin ──────────
    if (isCapacitorApp()) {
      const nativeRec = createNativeContinuousRecognizer({
        onResult: (text) => parseVoice(text.toLowerCase()),
        onPartial: (text) => setVoiceStatus(`"${text}"...`),
        onError: (err) => setVoiceStatus(typeof err === "string" ? err : "Voice error"),
      });
      recRef.current = nativeRec;
      nativeRec.start();
      setVoiceOn(true);
      setVoiceStatus("Listening (native)...");
      logClientEvent("voice.toggled", { metadata: { state: "on", platform: "native", scheduleId } });
      return;
    }

    // ── Browser: use Web Speech API ─────────────────────
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || voiceMode === 'unavailable') { setVoiceStatus("Voice unavailable offline — tap to score"); return; }

    // Probe audio device — forces OS to route current default (helps Bluetooth on iOS)
    try {
      const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
      stream?.getTracks().forEach(t => t.stop());
    } catch {}

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    const rec = new SR();
    rec.continuous = !isIOS;
    rec.interimResults = true;
    rec.lang = "en-US";
    recRef.current = rec;

    rec.onresult = e => {
      const lastResult = e.results[e.results.length - 1];
      if (lastResult.isFinal) {
        const t = lastResult[0].transcript.trim();
        parseVoice(t.toLowerCase());
      } else {
        setVoiceStatus(`"${lastResult[0].transcript.trim()}"...`);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "service-not-allowed" || e.error === "not-allowed") {
        setVoiceStatus("Voice blocked — open in Safari browser (not PWA). Check mic permissions in Settings.");
        stopVoice();
        return;
      }
      if (e.error !== "no-speech" && e.error !== "aborted") {
        setVoiceStatus(`Error: ${e.error}`);
      }
    };
    rec.onend = () => {
      // Re-arm while voice is still on. Safari/iOS auto-stops after each phrase and
      // has no real continuous mode, so this restart is what keeps it listening.
      // Guarded by recRef identity so a stopped/replaced recognizer never re-arms.
      if (recRef.current !== rec) return;
      const tryStart = (retried) => {
        if (recRef.current !== rec) return; // toggled off / replaced in the meantime
        try {
          rec.start();
        } catch {
          // Safari throws if start() is called before the previous session fully tears
          // down. Back off once and retry rather than dropping voice silently.
          if (!retried) setTimeout(() => tryStart(true), 300);
        }
      };
      setTimeout(() => tryStart(false), isIOS ? 100 : 0);
    };

    // Restart recognition when audio device changes (Bluetooth connect/disconnect)
    const onDeviceChange = () => {
      if (recRef.current) {
        setVoiceStatus("Audio device changed — reconnecting...");
        recRef.current.stop();
      }
    };
    navigator.mediaDevices?.addEventListener('devicechange', onDeviceChange);
    deviceChangeRef.current = onDeviceChange;

    rec.start();
    setVoiceOn(true);
    setVoiceStatus("Listening...");
    logClientEvent("voice.toggled", { metadata: { state: "on", platform: "web", scheduleId } });
  }, [voiceOn, parseVoice, voiceMode, scheduleId]);

  // Stats
  const complete = athletes.filter(a => getStatus(a.id, scores, totalCats) === "complete").length;
  const partial = athletes.filter(a => getStatus(a.id, scores, totalCats) === "partial").length;
  const remaining = athletes.length - complete - partial;

  const selectedIdx = selected ? filtered.findIndex(a => a.id === selected.id) : -1;

  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
    {/* Centers the whole scoring UI to a mobile/tablet-width column on desktop
        instead of stretching edge-to-edge — fixed-position children (modals,
        the voice bar) are unaffected since `fixed` positions relative to the
        viewport, not this wrapper. */}
    <div className="max-w-2xl mx-auto bg-gray-50 text-ink flex flex-col min-h-screen" style={{ paddingBottom: "80px" }}>

      {readOnly && (
        <div className="bg-green-600 text-white text-center text-xs sm:text-sm font-semibold px-3 py-2">
          ✓ Session closed — read-only. Ask your SP or association to reopen it to make changes.
        </div>
      )}

      {/* ── Top bar ────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center justify-between px-3 py-3">
          <a href="/evaluator/dashboard" className="p-1.5 text-gray-500 hover:text-ink rounded-lg">
            <ArrowLeft size={20} />
          </a>
          <div className="text-center flex-1 mx-2">
            <div className="flex items-center justify-center gap-1.5">
              {/* Connection dot — moved inline with the title so status is a
                  glance, not its own row */}
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-500 ${
                  online ? 'bg-green-500 shadow-[0_0_6px_#4ade80]' : Object.keys(pending).length > 0 ? 'bg-amber-400 animate-pulse' : 'bg-red-500'
                }`}
                title={online ? 'Connected' : Object.keys(pending).length > 0 ? `${Object.keys(pending).length} pending sync` : 'Offline'}
              />
              <span className="text-sm font-bold font-display text-ink leading-tight">
                {sessionData?.schedule?.org_name} · S{sessionData?.schedule?.session_number} G{sessionData?.schedule?.group_number}
              </span>
            </div>
            <div className="flex items-center justify-center gap-3 mt-1">
              <span className="text-xs text-green-600 font-semibold">{complete} ✓</span>
              <span className="text-xs text-amber-500 font-semibold">{partial} partial</span>
              <span className="text-xs text-gray-400">{remaining} left</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Transient "just happened" message — auto-clears in a couple seconds */}
            {syncStatus && (
              <span className={`text-xs px-2 py-1 rounded-lg ${
                syncStatus.includes('✓') ? 'text-green-600' :
                syncStatus.includes('fail') || syncStatus.includes('Error') ? 'text-red-500' :
                'text-amber-500'
              }`}>{syncStatus}</span>
            )}
            {/* The connection dot next to the title is the save indicator now --
                green = connected, red = save manually via Settings > Backup.
                This pill said the same thing with more words. */}
            {/* Everything else (scoring guide, floor/room calibration, layout,
                consensus, backup, theme) lives behind this one button now — the
                header was showing too much at once. */}
            <button onClick={() => setSettingsOpen(true)} className="p-1.5 text-gray-500 hover:text-ink rounded-lg" title="Settings">
              <SettingsIcon size={20} />
            </button>
          </div>
        </div>

        {/* Calibration check banner */}
        {calibration && !calibrationDismissed && (
          <div className="mx-3 mt-2 bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-accent-soft">
              <span className="text-xs font-semibold text-accent">📊 Session {calibration.prev_session} Review</span>
              <button onClick={() => setCalibrationDismissed(true)} className="text-xs text-gray-400 hover:text-ink">Dismiss</button>
            </div>
            <div className="px-4 py-2 border-b border-gray-200">
              <p className="text-[11px] text-gray-500 leading-relaxed">Quick look at how your rankings compared to the group last session. This isn't about right or wrong — it's about awareness. If you ranked a player very differently from the group, keep an eye on them today.</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-4">
                <div className="text-center" title="How often your ranking order matched the group's order">
                  <div className={`text-lg font-bold font-display ${calibration.rank_match >= 85 ? "text-green-600" : calibration.rank_match >= 70 ? "text-amber-500" : "text-red-500"}`}>{calibration.rank_match}%</div>
                  <div className="text-[10px] text-gray-400">Ranking alignment</div>
                </div>
                <div className="text-center" title="How many points of the scoring scale you used (higher = better differentiation)">
                  <div className="text-lg font-bold font-display text-ink">{calibration.spread}</div>
                  <div className="text-[10px] text-gray-400">Score range</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold font-display text-ink">{calibration.athletes_scored}</div>
                  <div className="text-[10px] text-gray-400">Athletes</div>
                </div>
              </div>
              {calibration.disagreements?.length > 0 && (
                <div>
                  <div className="text-[10px] text-gray-400 mb-1">Players you ranked differently from the group — worth a closer look today:</div>
                  {calibration.disagreements.slice(0, 3).map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                      <span className="text-ink flex-1">{d.name}</span>
                      <span className="text-gray-500">You: #{d.your_rank}</span>
                      <span className="text-gray-500">Group: #{d.group_rank}</span>
                      <span className={`font-bold ${d.diff >= 5 ? "text-red-500" : "text-amber-500"}`}>±{d.diff}</span>
                    </div>
                  ))}
                </div>
              )}
              {Object.keys(calibration.category_bias || {}).length > 0 && (
                <div>
                  <div className="text-[10px] text-gray-400 mb-1">Your avg vs group avg per category (+ means you scored higher, - means lower):</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(calibration.category_bias).map(([cat, bias]) => (
                      <span key={cat} className={`text-[10px] px-1.5 py-0.5 rounded ${Math.abs(bias) > 0.5 ? "bg-amber-50 text-amber-600 border border-amber-200" : "bg-gray-100 text-gray-500"}`}>
                        {cat.split(/[\s/]/)[0]}: {bias > 0 ? "+" : ""}{bias}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setCalibrationDismissed(true)} className="w-full py-2 text-xs font-semibold text-accent bg-accent-soft hover:opacity-90 border-t border-accent/20">
              Got it — Start Scoring
            </button>
          </div>
        )}

        {/* Team filter tabs */}
        <div className="flex border-t border-gray-200">
          {["all", ...teamColors].map(t => (
            <button key={t} onClick={() => setTeamFilter(t)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors capitalize ${
                teamFilter === t
                  ? "text-accent border-b-2 border-accent"
                  : "text-gray-400 border-b-2 border-transparent"
              }`}>
              {t === "all" ? `All (${athletes.length})` : `${t} (${athletes.filter(a => a.team_color === t).length})`}
            </button>
          ))}
        </div>
          <div className="flex items-center justify-center gap-2 mt-1 mx-3 mb-1 flex-wrap">
            <button onClick={() => setHideCompleted(h => !h)} className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${hideCompleted ? "bg-green-600 border-green-500 text-white" : "bg-gray-100 border-gray-300 text-gray-500"}`}>
              {hideCompleted ? "✓ Hiding" : "Hide done"}
            </button>
            {viewMode !== "grid" && (
              <button
                onClick={() => { setCollapseList(v => !v); setListExpanded(false); }}
                title="When on, the player grid collapses after you pick someone so the score inputs are right at the top — no scrolling."
                className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${collapseList ? "bg-accent border-accent text-white" : "bg-gray-100 border-gray-300 text-gray-500"}`}
              >
                {collapseList ? "✓ Compact" : "Compact"}
              </button>
            )}
            {!readOnly && (
              <button onClick={async () => { setShowConsensus(true); logClientEvent("consensus.opened", { metadata: { catId, scheduleId } }); await loadConsensus(); }} className="px-3 py-1 text-xs font-semibold rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
                Consensus
              </button>
            )}
            {Object.keys(pending).length > 0 && (
              <button onClick={resyncNow} className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-accent/40 text-accent hover:bg-accent-soft">
                Resync now
              </button>
            )}
          </div>
      </div>

      {/* Scoring guide modal — "what does a 0 look like, what does a 10 look
          like" reference, per skill, for this category's age tier.
          Rendered here, outside the sticky top-bar, so its z-50 competes at
          the page's top-level stacking order — nested inside a `position:
          sticky` ancestor with its own z-index, it was getting capped to
          that ancestor's context and losing to the Grid view's own sticky
          z-10 header. */}
      {guideOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center" onClick={() => setGuideOpen(false)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <h3 className="font-display font-bold text-ink flex items-center gap-1.5"><BookOpen size={17} className="text-accent" /> Scoring guide {guideData?.age_tier && guideData.age_tier !== "ALL" ? `— ${guideData.age_tier}` : ""}</h3>
              <button onClick={() => setGuideOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-5">
              {(guideData?.guide || []).filter(g => g.bands.length > 0).map(g => (
                <div key={g.scoring_category_id}>
                  <h4 className="text-sm font-bold text-ink mb-1.5">{g.name}</h4>
                  <div className="space-y-1">
                    {g.bands.map((b, i) => (
                      <div key={i} className="flex gap-2 text-xs">
                        <span className="font-mono font-bold text-accent flex-shrink-0 w-10">{b.band_min}–{b.band_max}</span>
                        <span className="text-gray-600 leading-snug">{b.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Settings — everything that isn't needed at a glance while scoring
          lives here now: scoring guide, calibration numbers, layout, consensus,
          backup/recovery, appearance. Keeps the header down to just player
          counts, the team filter, and the save indicator. Same top-level
          placement reasoning as the guide modal above. */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center" onClick={() => setSettingsOpen(false)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <h3 className="font-display font-bold text-ink flex items-center gap-1.5"><SettingsIcon size={17} className="text-accent" /> Settings</h3>
              <button onClick={() => setSettingsOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-5">
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Find a player</h4>
                <div className="relative">
                  <input
                    value={jerseySearch}
                    onChange={e => { setJerseySearch(e.target.value); setSettingsOpen(false); }}
                    inputMode="numeric"
                    placeholder={isAnon ? "Find #" : "Find # or name"}
                    autoFocus
                    className="w-full pl-3 pr-8 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                  {jerseySearch && (
                    <button onClick={() => setJerseySearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-base leading-none">×</button>
                  )}
                </div>
              </div>

              {!readOnly && (
                <button onClick={() => { setSettingsOpen(false); setAddPlayerError(""); setAddPlayerOpen(true); }} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-ink hover:bg-gray-100">
                  <span>+ Add player (on ice, not checked in)</span>
                  <ChevronRight size={15} className="text-gray-400" />
                </button>
              )}

              <button onClick={() => { setSettingsOpen(false); setShowRoster(true); }} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-ink hover:bg-gray-100">
                <span>Who's evaluating with me</span>
                <ChevronRight size={15} className="text-gray-400" />
              </button>

              {!readOnly && (
                <button onClick={() => { setSettingsOpen(false); setShowPings(true); markPingsSeen(); }} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-ink hover:bg-gray-100">
                  <span className="flex items-center gap-2">
                    Team ping
                    {unreadPings > 0 && <span className="w-5 h-5 flex items-center justify-center rounded-full bg-accent text-white text-[10px] font-bold">{unreadPings}</span>}
                  </span>
                  <ChevronRight size={15} className="text-gray-400" />
                </button>
              )}

              {hasGuideContent && (
                <button onClick={() => { setSettingsOpen(false); setGuideOpen(true); }} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-ink hover:bg-gray-100">
                  <span className="flex items-center gap-2"><BookOpen size={15} className="text-accent" /> Scoring guide</span>
                  <ChevronRight size={15} className="text-gray-400" />
                </button>
              )}

              <button onClick={() => { setSettingsOpen(false); setShowRanges(true); }} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-ink hover:bg-gray-100">
                <span>Ranges</span>
                <ChevronRight size={15} className="text-gray-400" />
              </button>

              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Layout</h4>
                <div className="flex bg-gray-100 rounded-lg border border-gray-300 overflow-hidden">
                  {[
                    { id: "card", label: "Buttons" },
                    { id: "numpad", label: "Numpad" },
                    { id: "grid", label: "Grid" },
                  ].map(m => (
                    <button key={m.id} onClick={() => { if (viewMode !== m.id) logClientEvent("viewmode.toggled", { metadata: { from: viewMode, to: m.id, scheduleId } }); setViewMode(m.id); }}
                      className={`flex-1 px-2.5 py-2 text-xs font-semibold transition-colors ${viewMode === m.id ? "bg-accent text-white" : "text-gray-500"}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Backup</h4>
                <div className="space-y-1">
                  <button onClick={() => downloadBackup()} className="block w-full text-left px-3 py-2 text-sm text-ink hover:bg-gray-50 rounded-lg border border-gray-200">Download CSV (readable)</button>
                  <button onClick={() => downloadBackupJson()} className="block w-full text-left px-3 py-2 text-sm text-ink hover:bg-gray-50 rounded-lg border border-gray-200">Download backup file</button>
                  <label className="block w-full text-left px-3 py-2 text-sm text-ink hover:bg-gray-50 rounded-lg border border-gray-200 cursor-pointer">
                    Restore from file…
                    <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; setSettingsOpen(false); restoreFromFile(f); }} />
                  </label>
                  <p className="px-1 pt-1 text-xs text-gray-400 leading-snug">Emergency use — your scores already save to this device and sync automatically.</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Appearance</h4>
                <ThemeToggle theme={theme} onToggle={toggleTheme} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add an on-ice player who was never checked in — creates the athlete
          (if new), drops them into this game's group, and checks them in via
          the same add_player action the volunteer check-in screen uses, so
          they show up in the roster immediately, ready to score. */}
      {addPlayerOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center" onClick={() => !addPlayerSaving && setAddPlayerOpen(false)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <h3 className="font-display font-bold text-ink">Add player</h3>
              <button onClick={() => setAddPlayerOpen(false)} disabled={addPlayerSaving} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-40"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-400">For a player who's on the ice but never got checked in — adds them to this roster and checks them in so they're ready to score.</p>
              <div className="grid grid-cols-2 gap-2">
                <input value={addPlayerForm.first_name} onChange={e => setAddPlayerForm(f => ({ ...f, first_name: e.target.value }))} placeholder="First name" autoFocus className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={addPlayerForm.last_name} onChange={e => setAddPlayerForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Last name" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={addPlayerForm.jersey_number} onChange={e => setAddPlayerForm(f => ({ ...f, jersey_number: e.target.value.replace(/\D/g, "") }))} inputMode="numeric" placeholder="Jersey #" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <select value={addPlayerForm.team_color} onChange={e => setAddPlayerForm(f => ({ ...f, team_color: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/30">
                  {teamColors.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {addPlayerError && <p className="text-xs text-red-500">{addPlayerError}</p>}
              <button
                disabled={addPlayerSaving || !addPlayerForm.first_name.trim() || !addPlayerForm.last_name.trim()}
                onClick={async () => {
                  setAddPlayerSaving(true); setAddPlayerError("");
                  try {
                    const res = await fetch(`/api/checkin/${scheduleId}`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "add_player",
                        first_name: addPlayerForm.first_name.trim(),
                        last_name: addPlayerForm.last_name.trim(),
                        jersey_number: addPlayerForm.jersey_number ? parseInt(addPlayerForm.jersey_number) : null,
                        team_color: addPlayerForm.team_color,
                      }),
                    });
                    const d = await res.json();
                    if (!res.ok || !d.success) { setAddPlayerError(d.error || "Couldn't add player — try again."); setAddPlayerSaving(false); return; }
                    await refetchSession();
                    setAddPlayerForm({ first_name: "", last_name: "", jersey_number: "", team_color: "White" });
                    setAddPlayerOpen(false);
                  } catch { setAddPlayerError("Network error — try again."); }
                  setAddPlayerSaving(false);
                }}
                className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-40">
                {addPlayerSaving ? "Adding…" : "Add & check in"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pingToast && (
        <div className="fixed top-2 left-2 right-2 z-[70] flex justify-center pointer-events-none">
          <button
            onClick={() => { setPingToast(null); setShowPings(true); markPingsSeen(); }}
            className="pointer-events-auto max-w-sm w-full bg-ink text-white rounded-xl shadow-lg px-4 py-3 flex items-start gap-2.5 text-left hover:opacity-95"
          >
            <span className="text-lg leading-none flex-shrink-0">💬</span>
            <span className="min-w-0">
              <span className="block text-xs font-bold uppercase tracking-wide text-white/60">{pingToast.name}</span>
              <span className="block text-sm truncate">{pingToast.message}</span>
            </span>
          </button>
        </div>
      )}

      {showRoster && <SessionRosterModal scheduleId={scheduleId} onClose={() => setShowRoster(false)} />}

      {/* Team ping — a quick shared board for the evaluators actually signed
          up to THIS session, for exactly the kind of thing that comes up
          mid-session: "running late", "anyone see a black #23?". Not a
          general chat and not tied to the SP<->evaluator messages inbox. */}
      {showPings && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center" onClick={() => setShowPings(false)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
              <h3 className="font-display font-bold text-ink">Team ping</h3>
              <button onClick={() => setShowPings(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {pings.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">No pings yet — say hi to whoever else is on this session.</div>
              ) : (
                [...pings].reverse().map(p => (
                  <div key={p.id} className={`rounded-xl px-3 py-2 max-w-[85%] ${p.user_id === pingsData?.meUserId ? "ml-auto bg-accent text-white" : "bg-gray-100 text-ink"}`}>
                    {p.user_id !== pingsData?.meUserId && <div className="text-[10px] font-bold uppercase tracking-wide opacity-60 mb-0.5">{p.name}</div>}
                    <div className="text-sm break-words">{p.message}</div>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-gray-100 flex-shrink-0 space-y-2">
              <div className="flex gap-1.5 flex-wrap">
                {["Running late", "Taking a quick break", "Anyone see a black #?"].map(canned => (
                  <button key={canned} disabled={pingSending} onClick={() => sendPing(canned)} className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-full text-gray-600 hover:bg-gray-50 disabled:opacity-50">{canned}</button>
                ))}
              </div>
              <form onSubmit={e => { e.preventDefault(); sendPing(pingText); }} className="flex items-center gap-2">
                <input
                  value={pingText}
                  onChange={e => setPingText(e.target.value)}
                  placeholder="Message the group…"
                  maxLength={200}
                  className="flex-1 min-w-0 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                <button type="submit" disabled={!pingText.trim() || pingSending} className="p-2.5 bg-accent text-white rounded-full disabled:opacity-40 flex-shrink-0"><Send size={16} /></button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Ranges — every group's score range for this session so far (not just
          earlier ones), so an evaluator who thinks a player deserves to beat
          another group's top score knows exactly what number that takes.
          Group-level only, never names a player. */}
      {showRanges && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center" onClick={() => setShowRanges(false)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <h3 className="font-display font-bold text-ink">Ranges — Session {scheduleData?.session_number}</h3>
              <button onClick={() => setShowRanges(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-4">
              <p className="text-xs text-gray-400 mb-3">Lowest-to-highest average score each group has landed so far, out of {scale}. If a player in front of you deserves to beat a group's top score, that's the number to give them.</p>
              {!rangesData ? (
                <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
              ) : rangesData.ranges.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">No groups set up yet for this session.</div>
              ) : (
                <div className="space-y-1.5">
                  {rangesData.ranges.map(r => (
                    <div key={r.group_number} className={`flex items-center justify-between rounded-lg px-3 py-2 ${r.group_number === scheduleData?.group_number ? "bg-accent-soft border border-accent/30" : "bg-gray-50"}`}>
                      <span className="text-sm font-semibold text-ink">Group {r.group_number}{r.group_number === scheduleData?.group_number ? " (you)" : ""}</span>
                      {r.floor != null ? (
                        <span className="text-sm font-mono font-bold text-amber-600">{r.ceiling}–{r.floor} <span className="text-xs text-gray-400 font-normal">({r.athletes_counted})</span></span>
                      ) : (
                        <span className="text-xs text-gray-300 italic">not scored yet</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Jersey grid ────────────────────────────────────── */}
      {/* Pending sync banner */}
      {!online && Object.keys(pending).length > 0 && (
        <div className="mx-3 mt-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-700">{Object.keys(pending).length} score{Object.keys(pending).length !== 1 ? 's' : ''} saved locally</p>
            <p className="text-xs text-amber-600 mt-0.5">Will sync automatically when wifi returns. Keep this tab open.</p>
          </div>
        </div>
      )}
      {/* ── Grid View (spreadsheet mode) ──────────────────── */}
      {viewMode === "grid" && (
        <div className="flex-1 overflow-auto px-2 pt-2 pb-20">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50">
                <th className="text-left py-2 px-2 text-xs text-gray-600 font-medium sticky left-0 bg-gray-50 min-w-[140px]">Name</th>
                {scoringCats.map(cat => (
                  <th key={cat.id} className="text-center py-2 px-1 text-xs text-gray-600 font-medium min-w-[60px]">{cat.name.split(/[\s/]/)[0]}</th>
                ))}
                <th className="text-center py-2 px-1 text-xs text-gray-600 font-medium min-w-[40px]">✓</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((athlete, r) => {
                const status = getStatus(athlete.id, scores, totalCats);
                const athleteScores = scores[athlete.id]?.cats || {};
                const isSel = selected?.id === athlete.id;
                return (
                  <tr key={athlete.id} className={`border-b border-gray-200 ${isSel ? "ring-2 ring-inset ring-accent" : ""} ${status === "complete" ? "bg-green-50" : status === "partial" ? "bg-amber-50" : ""}`}>
                    <td className="py-1.5 px-2 text-xs text-ink font-medium sticky left-0 bg-white whitespace-nowrap">
                      {/* Bracket (arbitrary-value) classes on purpose -- same reason as
                          the big jersey circle below: [data-theme="premium"] remaps
                          .bg-white to --p-card (#1a1a1a), which repainted the "Light"
                          dot near-black and left it indistinguishable from bg-gray-800
                          (#1f2937) at 8px. Bracket classes aren't in that override. */}
                      <span className={`inline-block w-3 h-3 rounded-full mr-1.5 border ${athlete.team_color === "Dark" ? "bg-[#111827] border-[#374151]" : "bg-[#ffffff] border-[#9ca3af]"}`} />
                      {isAnon
                        ? anonLabel(athlete)
                        : <>{athlete.last_name}, {athlete.first_name?.[0]}.{athlete.jersey_number && <span className="text-gray-500 ml-1">#{athlete.jersey_number}</span>}</>}
                    </td>
                    {scoringCats.map((cat, c) => {
                      const val = athleteScores[cat.id];
                      return (
                        <td key={cat.id} className="text-center py-1 px-1">
                          <input
                            type="number"
                            inputMode="decimal"
                            step={increment}
                            min={0}
                            max={scale}
                            value={val ?? ""}
                            data-cell={`${r}-${c}`}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => {
                              // Enter / arrows jump to the next cell so you can score
                              // down a row without looking for the next box.
                              const go = (rr, cc) => {
                                const el = document.querySelector(`[data-cell="${rr}-${cc}"]`);
                                if (el) { e.preventDefault(); el.focus(); }
                              };
                              const lastC = scoringCats.length - 1;
                              const lastR = filtered.length - 1;
                              if (e.key === "Enter" || e.key === "ArrowRight") {
                                if (c < lastC) go(r, c + 1); else if (r < lastR) go(r + 1, 0);
                              } else if (e.key === "ArrowLeft") {
                                if (c > 0) go(r, c - 1); else if (r > 0) go(r - 1, lastC);
                              } else if (e.key === "ArrowDown") {
                                if (r < lastR) go(r + 1, c);
                              } else if (e.key === "ArrowUp") {
                                if (r > 0) go(r - 1, c);
                              }
                            }}
                            onChange={e => {
                              const v = e.target.value === "" ? null : parseFloat(e.target.value);
                              if (v !== null && (v < 0 || v > scale)) return;
                              updateScore(athlete.id, cat.id, v);
                            }}
                            className={`w-full bg-transparent text-center text-sm font-mono outline-none rounded py-1 ${
                              val !== null && val !== undefined ? "text-ink" : "text-gray-400"
                            } focus:bg-gray-50 focus:ring-1 focus:ring-accent`}
                            placeholder="–"
                          />
                        </td>
                      );
                    })}
                    <td className="text-center py-1 px-1">
                      {status === "complete" ? <span className="text-green-600 text-xs">✓</span>
                        : status === "partial" ? <span className="text-amber-600 text-xs">◐</span>
                        : <span className="text-gray-400 text-xs">○</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Compact mode: grid collapsed to a slim bar while a player is selected */}
      {(viewMode === "card" || viewMode === "numpad") && collapseList && selected && !listExpanded && (
        <div className="px-3 pt-3 pb-1">
          <button onClick={() => setListExpanded(true)} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:border-gray-300">
            <ChevronDown size={15} /> Show all players ({filtered.length})
          </button>
        </div>
      )}
      {(viewMode === "card" || viewMode === "numpad") && !(collapseList && selected && !listExpanded) && (<div className="px-3 pt-3 pb-2">
        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 px-1">
          {[
            { color: "bg-gray-300", label: "Not started" },
            { color: "bg-amber-400", label: "Partial" },
            { color: "bg-green-500", label: "Complete" },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${l.color}`} />
              <span className="text-xs text-gray-600">{l.label}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))" }}>
          {filtered.map(athlete => {
            const status = getStatus(athlete.id, scores, totalCats);
            const isActive = selected?.id === athlete.id;
            const isDark = athlete.team_color === "Dark";

            return (
              <button
                key={athlete.id}
                onClick={() => { setSelected(isActive ? null : athlete); if (collapseList) setListExpanded(false); }}
                className="relative flex items-center justify-center select-none transition-transform"
                style={{ minHeight: "52px" }}
              >
                <div className="relative">
                  {/* Identifier (jersey or helmet #) in a team-colored circle -- White
                      vs Dark at a glance. Colors use bracket (arbitrary-value) classes
                      on purpose, not bg-white/text-gray-900/bg-gray-900/text-white:
                      globals.css's [data-theme="premium"] override remaps those exact
                      utility classes for the dark evaluator theme, which was turning
                      the "White" jersey circle into a dark circle with light text --
                      the opposite of what a literal jersey color should ever do.
                      Bracket classes aren't in that override list, so these stay true
                      white/black in both themes. */}
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center font-display font-extrabold leading-none transition-all ${String(idOf(athlete)).length > 2 ? "text-sm" : "text-lg"} ${
                    isDark ? "bg-[#111827] text-[#ffffff]" : "bg-[#ffffff] border-2 border-[#d1d5db] text-[#111827]"
                  } ${isActive ? "ring-4 ring-accent/50 scale-110" : ""}`}>
                    {idOf(athlete)}
                  </div>
                  {/* Done = small green check; partial = amber dot */}
                  {status === "complete" && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-white text-white text-[9px] font-black flex items-center justify-center leading-none">✓</span>
                  )}
                  {status === "partial" && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-white" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>)}

      {/* ── Score panel (card view only) ──────────────────── */}
      {selected && (viewMode === "card" || viewMode === "numpad") && (
        <div className="mx-3 mb-3 bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Player header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
            <button onClick={() => navigate(-1)} disabled={selectedIdx <= 0}
              className="p-1.5 text-gray-400 hover:text-ink disabled:opacity-30 rounded-lg">
              <ChevronLeft size={18} />
            </button>
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-2">
                <div className={`w-5 h-5 rounded-full border-2 ${selected.team_color === "Dark" ? "bg-[#111827] border-[#374151]" : "bg-[#ffffff] border-[#9ca3af]"}`} />
                <span className="font-bold font-display text-ink">#{idOf(selected)}</span>
              </div>
              {selected.position && (
                <div className="text-xs text-gray-600 mt-0.5 font-medium">{selected.position}</div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => {
                  const opening = !showCompare;
                  setShowCompare(opening);
                  if (opening) {
                    setCompareCount(c => c + 1);
                    // Log compare usage for evaluator scorecard tracking
                    fetch(`/api/evaluator/scores`, { method: "OPTIONS" }).catch(() => {}); // lightweight ping
                    if (currentUserId && catId) {
                      fetch(`/api/categories/${catId}/audit`, { method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "compare_used", athlete_id: selected?.id }),
                      }).catch(() => {});
                    }
                  }
                }}
                className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors ${showCompare ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500 hover:text-ink"}`}>
                ⚖
              </button>
              <button onClick={() => navigate(1)} disabled={selectedIdx >= filtered.length - 1}
                className="p-1.5 text-gray-400 hover:text-ink disabled:opacity-30 rounded-lg">
                <ChevronRight size={18} />
              </button>
              <button onClick={() => { setSelected(null); setShowCompare(false); }}
                className="p-1.5 text-gray-400 hover:text-ink rounded-lg">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Scoring categories */}
          <div className="px-4 py-3 space-y-4">
            {viewMode === "numpad" ? (
              /* ── Numpad mode: compact inline inputs ── */
              scoringCats.map((cat, i) => {
                const current = scores[selected.id]?.cats?.[cat.id];
                return (
                  <div key={cat.id} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 flex-1">{cat.name}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step={increment}
                      min={0}
                      max={scale}
                      data-cat={i}
                      value={current ?? ""}
                      onChange={e => {
                        const v = e.target.value === "" ? null : parseFloat(e.target.value);
                        if (v !== null && (v < 0 || v > scale)) return;
                        updateScore(selected.id, cat.id, v);
                      }}
                      onFocus={e => e.target.select()}
                      onKeyDown={e => {
                        // Enter = advance to next category input (Tab stays native).
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const next = document.querySelector('[data-cat="' + (i + 1) + '"]');
                        if (next) next.focus();
                        else e.target.blur(); // last category — done
                      }}
                      placeholder="—"
                      className={`w-20 py-3 text-center text-lg font-bold rounded-xl border-2 outline-none transition-colors ${
                        current !== null && current !== undefined
                          ? "bg-accent-soft border-accent text-ink"
                          : "bg-white border-gray-300 text-gray-600"
                      }`}
                    />
                  </div>
                );
              })
            ) : (
              /* ── Button mode: tappable score buttons ── */
              scoringCats.map((cat, i) => {
                const current = scores[selected.id]?.cats?.[cat.id];
                return (
                  <div key={cat.id} data-catblock={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold text-gray-700">{cat.name}</span>
                      {current !== null && current !== undefined && (
                        <button onClick={() => updateScore(selected.id, cat.id, null)}
                          className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                          <RotateCcw size={11} /> Clear
                        </button>
                      )}
                    </div>
                    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(scoreValues.length, 10)}, 1fr)` }}>
                      {scoreValues.map(v => (
                        <button key={v} onClick={() => { updateScore(selected.id, cat.id, v); advanceToNextUnscored(i, v === current); }}
                          className={`py-2 md:py-3.5 rounded text-xs md:text-base font-bold transition-all ${
                            current === v
                              ? "bg-accent text-white shadow-md"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-accent active:text-white"
                          }`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                );
            })
            )}

            {/* Notes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">Notes</span>
                {notesMode && <span className="text-xs text-green-600 font-medium animate-pulse">● Recording</span>}
              </div>
              <textarea
                value={scores[selected.id]?.notes || ""}
                onChange={e => updateNotes(selected.id, e.target.value)}
                placeholder={voiceOn ? `Voice active — say "Notes" to dictate, or type here` : "Type notes here, or use voice..."}
                rows={3}
                className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-ink placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
              />
            </div>

            {/* Sync status for this player */}
            {pending[selected.id] && (
              <div className="flex items-center gap-2 text-xs text-amber-600">
                <WifiOff size={12} />
                {online ? "Syncing..." : "Saved locally — will sync when online"}
              </div>
            )}

            {/* Compare panel — find athletes I've rated with the same overall score.
                "Overall" matches the rest of the app: mean of category scores
                rounded to one decimal. Only my own scores are used; we
                deliberately don't peek at other evaluators' ratings here. */}
            {showCompare && selected && (() => {
              const myScores = scores[selected.id]?.cats || {};
              const myFilled = Object.values(myScores).filter(v => v !== null && v !== undefined);
              const totalCats = scoringCats.length;
              if (myFilled.length < totalCats) {
                return <div className="text-xs text-gray-400 mt-3">Score every category for this player to compare overall.</div>;
              }
              const myOverall = Math.round((myFilled.reduce((a, b) => a + b, 0) / myFilled.length) * 10) / 10;

              const same = athletes.filter(a => {
                if (a.id === selected.id) return false;
                const theirCats = scores[a.id]?.cats || {};
                const theirFilled = Object.values(theirCats).filter(v => v !== null && v !== undefined);
                if (theirFilled.length < totalCats) return false; // only fully-rated peers
                const theirOverall = Math.round((theirFilled.reduce((a, b) => a + b, 0) / theirFilled.length) * 10) / 10;
                return theirOverall === myOverall;
              }).map(a => (helmetMode || a.jersey_number) ? `${a.team_color === "Dark" ? "D" : "L"}${idOf(a)}` : (isAnon ? `${teamLabel(a)} ?` : `${a.last_name}, ${a.first_name?.[0]}.`));

              return (
                <div className="mt-3 bg-purple-50 border border-purple-200 rounded-xl p-3">
                  <div className="text-xs font-semibold text-purple-700 mb-2">⚖ Same Overall Score — Are these players equal?</div>
                  {same.length === 0 ? (
                    <div className="text-xs text-gray-400">No other player you've rated has an overall of {myOverall}.</div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-gray-500 w-16 flex-shrink-0">Overall: {myOverall}</span>
                        {same.map((label, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{label}</span>
                        ))}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1">If not equal, adjust to differentiate.</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {athletes.length === 0 && !isLoading && (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm px-8 text-center">
          No checked-in players yet. Check players in first, then come back to score.
        </div>
      )}

      {athletes.length > 0 && !selected && (viewMode === "card" || viewMode === "numpad") && (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          Tap a jersey to score
        </div>
      )}

      {/* ── Consensus overlay ─────────────────────────────────── */}
      {showConsensus && (
        <div className="fixed inset-0 z-30 bg-black/40 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-6">
            <div className="bg-white rounded-2xl border border-gray-200 px-4 py-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-ink">Consensus Review</h2>
                <p className="text-xs text-gray-500 mt-0.5">Do evaluators rank athletes in the same tier?</p>
              </div>
              <button onClick={() => setShowConsensus(false)} className="p-2 text-gray-400 hover:text-ink rounded-lg hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>

            {consensusLoading ? (
              <div className="text-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto" /></div>
            ) : !consensusData?.athletes?.length ? (
              <div className="text-center py-20 text-gray-500 text-sm">No scores submitted yet</div>
            ) : (
              <>
                {/* Evaluator filter — narrow the discussion list to just one
                    evaluator's disagreements, useful when several evaluators
                    are reviewing together and want to focus on one at a time. */}
                {(() => {
                  const evalNames = [...new Set(consensusData.athletes.flatMap(a => (a.per_evaluator || []).map(e => e.evaluator_name)).filter(Boolean))].sort();
                  return evalNames.length > 1 ? (
                    <div className="mb-4">
                      <select value={consensusEvalFilter} onChange={e => setConsensusEvalFilter(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/30">
                        <option value="">All evaluators</option>
                        {evalNames.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  ) : null;
                })()}

                {/* Summary */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-center">
                    <div className="text-xl font-bold text-ink">{consensusData.athletes.length}</div>
                    <div className="text-[10px] text-gray-500">Athletes</div>
                  </div>
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-center">
                    <div className={`text-xl font-bold ${consensusData.flagged_count > 0 ? "text-amber-600" : "text-green-600"}`}>{consensusData.flagged_count}</div>
                    <div className="text-[10px] text-gray-500">Need Discussion</div>
                  </div>
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-center">
                    <div className="text-xl font-bold text-green-600">{consensusData.athletes.length - consensusData.flagged_count}</div>
                    <div className="text-[10px] text-gray-500">Agreed</div>
                  </div>
                </div>

                {/* Tier info */}
                {consensusData.tier_info && (
                  <div className="flex items-center gap-2 mb-4 text-[10px] text-gray-500">
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">Top {consensusData.tier_info.top}</span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded">Middle</span>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Bottom {consensusData.tier_info.total - consensusData.tier_info.bottom + 1}</span>
                    <span className="text-gray-400">of {consensusData.tier_info.total} athletes</span>
                  </div>
                )}

                {/* Flagged athletes — tier splits */}
                {consensusData.flagged_count > 0 && (
                  <div className="mb-5">
                    <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Needs Discussion — Evaluators Ranked in Different Tiers</div>
                    <div className="space-y-2">
                      {consensusData.athletes.filter(a => a.flagged && (!consensusEvalFilter || a.per_evaluator?.some(ev => ev.evaluator_name === consensusEvalFilter))).map(a => (
                        <div key={a.athlete_id} className={`bg-white border rounded-xl p-4 ${reviewedFlags.has(a.athlete_id) ? "border-green-200" : a.severity === "critical" ? "border-red-200" : "border-amber-200"}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${a.severity === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                                {a.severity === "critical" ? "TOP↔BOTTOM" : "TIER SPLIT"}
                              </span>
                              <span className="text-sm font-semibold text-ink">{a.first_name} {a.last_name}</span>
                              {a.jersey_number && <span className="text-xs text-gray-500">#{a.jersey_number}</span>}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  const ath = (sessionData?.athletes || []).find(x => x.id === a.athlete_id);
                                  if (ath) { setSelected(ath); setShowConsensus(false); logClientEvent("consensus.fix_score_clicked", { metadata: { catId, athleteId: a.athlete_id } }); }
                                }}
                                className="text-xs px-2.5 py-1 bg-accent-soft text-accent rounded-lg hover:opacity-90 font-semibold">Fix score →</button>
                              {!reviewedFlags.has(a.athlete_id) ? (
                                <button onClick={() => { setReviewedFlags(prev => new Set([...prev, a.athlete_id])); logClientEvent("consensus.flag_resolved", { metadata: { catId, athleteId: a.athlete_id, severity: a.severity } }); }} className="text-xs px-2.5 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">Discussed ✓</button>
                              ) : (
                                <span className="text-xs text-green-600">✓ Done</span>
                              )}
                            </div>
                          </div>

                          {/* Per-evaluator rankings */}
                          <div className="space-y-1.5">
                            {a.per_evaluator?.map(ev => (
                              <div key={ev.evaluator_id} className={`flex items-center gap-2 ${consensusEvalFilter && ev.evaluator_name === consensusEvalFilter ? "bg-accent-soft rounded-lg px-1.5 py-0.5 -mx-1.5" : ""}`}>
                                <span className="text-xs text-gray-600 w-28 truncate">{ev.evaluator_name}</span>
                                <span className={`text-xs font-bold w-8 text-center ${ev.tier === "top" ? "text-green-600" : ev.tier === "bottom" ? "text-amber-600" : "text-gray-700"}`}>#{ev.rank}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${ev.tier === "top" ? "bg-green-100 text-green-700" : ev.tier === "bottom" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{ev.tier}</span>
                                <span className="text-xs text-gray-400 ml-auto">avg {ev.avg_score}</span>
                              </div>
                            ))}
                          </div>

                          {/* Category detail */}
                          <div className="mt-3 pt-2 border-t border-gray-200">
                            <div className="flex flex-wrap gap-3">
                              {a.categories?.map(cat => (
                                <div key={cat.name} className="text-xs">
                                  <span className="text-gray-500">{cat.name}: </span>
                                  <span className="text-ink font-mono">{cat.avg}</span>
                                  {cat.spread > 0 && <span className={`ml-1 ${cat.spread > 2 ? "text-red-600" : cat.spread > 1 ? "text-amber-600" : "text-gray-500"}`}>(±{cat.spread})</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Agreed athletes */}
                {consensusData.athletes.filter(a => !a.flagged && (!consensusEvalFilter || a.per_evaluator?.some(ev => ev.evaluator_name === consensusEvalFilter))).length > 0 && (
                  <div className="mb-5">
                    <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">All Evaluators Agree on Tier — No Discussion Needed</div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                      <div className="grid grid-cols-2 gap-1">
                        {consensusData.athletes.filter(a => !a.flagged && (!consensusEvalFilter || a.per_evaluator?.some(ev => ev.evaluator_name === consensusEvalFilter))).map(a => (
                          <div key={a.athlete_id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-100">
                            <span className="text-xs text-gray-700">{a.first_name} {a.last_name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${a.unique_tiers?.[0] === "top" ? "bg-green-100 text-green-700" : a.unique_tiers?.[0] === "bottom" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{a.unique_tiers?.[0]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Close Session */}
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-xs text-gray-500 mb-3">
                    {consensusData.flagged_count > 0 && [...reviewedFlags].length < consensusData.flagged_count
                      ? `Discuss ${consensusData.flagged_count - [...reviewedFlags].length} remaining athlete(s) before closing, or they'll be reported as unreviewed.`
                      : "All flagged athletes reviewed. Ready to close."}
                  </p>
                  <button onClick={closeSession} disabled={closing}
                    className="w-full py-3 bg-accent text-white rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-50">
                    {closing ? "Closing..." : "Close Session"}
                  </button>
                </div>
              </>
            )}
            </div>
          </div>
        </div>
      )}

      {/* ── Excusal step: mark unscored players absent/injured before closing ── */}
      {excusalNeeded && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: "85vh" }}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-display font-extrabold text-ink text-lg leading-tight">Before you close</h3>
              <p className="text-xs text-gray-500 mt-1">
                {excusalNeeded.length} player{excusalNeeded.length === 1 ? "" : "s"} {excusalNeeded.length === 1 ? "has" : "have"} no score. Mark why for each — that's the only way to close a player out without scoring them.
              </p>
            </div>
            <div className="overflow-y-auto px-5 py-2 flex-1 divide-y divide-gray-50">
              {excusalNeeded.map(a => (
                <div key={a.athlete_id} className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-900 min-w-0 truncate">{a.name}</span>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {[["absent", "Not here"], ["injured", "Got hurt"]].map(([val, label]) => (
                      <button key={val} onClick={() => setExcusals(e => ({ ...e, [a.athlete_id]: val }))}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium ${excusals[a.athlete_id] === val ? "bg-accent text-white border-accent" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <button onClick={() => setExcusalNeeded(null)} disabled={closing} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium disabled:opacity-50">Back to scoring</button>
              <button onClick={() => attemptClose(excusals)} disabled={closing || excusalNeeded.some(a => !excusals[a.athlete_id])}
                className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-40">
                {closing ? "Closing…" : "Confirm & close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Voice bar — fixed at bottom ─────────────────────── */}
      {!online && voiceMode === 'unavailable' && (
        <div className="fixed bottom-16 left-0 right-0 z-20 px-4 pb-1">
          <div className="max-w-2xl mx-auto bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="text-amber-600 text-xs">⚠️</span>
            <span className="text-xs text-amber-700">Voice unavailable offline — tap to score. Audio feedback still works.</span>
          </div>
        </div>
      )}
      <div className={`fixed bottom-0 left-0 right-0 z-20 border-t transition-colors duration-200 ${
        voiceOn
          ? notesMode
            ? "bg-green-50 border-green-200"
            : "bg-blue-50 border-blue-200"
          : "bg-white border-gray-200"
      }`}>
        <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
          {/* Mic button */}
          <button
            onClick={toggleVoice}
            className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
              voiceOn
                ? notesMode
                  ? "bg-green-500 text-white shadow-md"
                  : "bg-blue-500 text-white shadow-md animate-pulse"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {voiceOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          {/* Status text */}
          <div className="flex-1 min-w-0">
            {voiceOn ? (
              <>
                <div className="text-xs font-medium mb-0.5 truncate" style={{ color: notesMode ? "#15803d" : "#1d4ed8" }}>
                  {notesMode ? "📝 Notes mode — say 'done' to stop" : "🎤 Listening — say 'White 21' · 'Skating 8' · 'Notes'"}
                </div>
                <div className="text-sm text-ink truncate">{voiceStatus}</div>
                {!notesMode && isAppleSpeechFlaky() && (
                  <div className="text-[11px] text-amber-700 leading-snug mt-0.5">
                    Voice on Safari can drop out — tap the mic again if it stops, or use tap scoring.
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-gray-500 leading-snug">
                Voice: "White 21" select · "Skating 8 Puck 7" score · "Notes" dictate · "Next/Back" navigate
              </div>
            )}
          </div>

          {/* Restart mic button (helps with Bluetooth) */}
          {voiceOn && !notesMode && (
            <button
              onClick={restartVoice}
              title="Restart mic (use if Bluetooth changed)"
              className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          )}

          {/* Notes mode done button */}
          {voiceOn && notesMode && (
            <button
              onClick={() => { setNotesMode(false); setVoiceStatus("Listening..."); }}
              className="flex-shrink-0 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold"
            >
              Done Notes
            </button>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}

export default function ScorePage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" />
        </div>
      }>
        <ScoringInterface />
      </Suspense>
    </QueryClientProvider>
  );
}
