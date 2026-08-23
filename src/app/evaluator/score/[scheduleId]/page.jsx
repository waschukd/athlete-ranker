"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useParams } from "next/navigation";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Mic, MicOff, ArrowLeft, RefreshCw } from "lucide-react";
import { findBestCategoryMatch, extractCandidates, buildAliasLookup, normalizeForMatch, normalizeSpokenNumbers, stripSentencePunctuation } from "@/lib/voiceMatch";
import { isCapacitorApp, createNativeContinuousRecognizer, isAppleSpeechFlaky } from "@/lib/speechAdapter";
import { useTrackPageView, logClientEvent } from "@/lib/useAnalytics";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";
import SessionRosterModal from "@/components/SessionRosterModal";
import { parseTeamColors, colorFor } from "@/lib/teamColors";
import GuideModal from "@/components/evaluator-scoring/GuideModal";
import RangesModal from "@/components/evaluator-scoring/RangesModal";
import TeamPingModal from "@/components/evaluator-scoring/TeamPingModal";
import PingToast from "@/components/evaluator-scoring/PingToast";
import AddPlayerModal from "@/components/evaluator-scoring/AddPlayerModal";
import SettingsModal from "@/components/evaluator-scoring/SettingsModal";
import ConsensusModal from "@/components/evaluator-scoring/ConsensusModal";
import ExcusalModal from "@/components/evaluator-scoring/ExcusalModal";
import TopBar from "@/components/evaluator-scoring/TopBar";
import GridView from "@/components/evaluator-scoring/GridView";
import NotesSheetModal from "@/components/evaluator-scoring/NotesSheetModal";
import PlayerPool from "@/components/evaluator-scoring/PlayerPool";
import ScorePanel from "@/components/evaluator-scoring/ScorePanel";
import { getStatus } from "@/lib/scoringStatus";

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

// ── Main component ─────────────────────────────────────────────────────────
function ScoringInterface() {
  const params = useParams();
  const scheduleId = params.scheduleId;

  const [selected, setSelected] = useState(null);
  const [viewMode, setViewMode] = useState("card"); // "card" | "grid" | "numpad"
  const [calibration, setCalibration] = useState(null);
  const [calibrationDismissed, setCalibrationDismissed] = useState(false);
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
  // Anonymous mode labels a player by jersey colour + number ("Red 12"). Use the
  // session's real colour name rather than a Light/Dark abstraction the evaluator
  // would have to translate against the jersey actually in front of them.
  const sameTeam = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
  const teamLabel = (a) =>
    colorFor(a?.team_color, parseTeamColors(sessionData?.checkinSession?.team_colors)).name || "Light";
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
  // Grid view has no player panel, so notes were unreachable without switching
  // to card view and back. This holds the athlete whose note sheet is open.
  const [notesForId, setNotesForId] = useState(null);
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
  const teamColors = parseTeamColors(sessionData?.checkinSession?.team_colors);
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
  // Never hide the athlete currently being scored, even once they're
  // "complete" -- e.g. a decimal like "6.5" spoken on the last category can
  // land as a plain "6" if the recognizer's silence-detection finalizes early
  // between "six" and "point five". If hideCompleted yanks the row away the
  // instant that partial score completes them, the evaluator loses the row
  // (grid) or jersey button (pool) they were about to correct mid-sentence.
  const filtered = (teamFilter === "all" ? athletes : athletes.filter(a => sameTeam(a.team_color, teamFilter)))
    .filter(a => !hideCompleted || a.id === selected?.id || getStatus(a.id, scores, totalCats) !== "complete")
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
    const t = stripSentencePunctuation(corrected.trim().toLowerCase());
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

    // ── Select player: "score red 14" / "white 14" / "black 14" ──
    // Colours come from THIS session's palette so "score red 14" works on a
    // Red/Blue session; "black" stays an alias for "Dark" for the default pair.
    const voicePalette = parseTeamColors(sessionData?.checkinSession?.team_colors);
    const voiceAliases = { black: "Dark", wh: "White", dk: "Dark", bl: "Dark" };
    // Escape each word and sort longest-first so "dark" cannot be shadowed by a
    // shorter alternative that happens to prefix it.
    const voiceWords = [...voicePalette.map(c => c.name.toLowerCase()), ...Object.keys(voiceAliases)]
      .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .sort((a, b) => b.length - a.length);
    const playerMatch = t.match(new RegExp(`(?:score\\s+)?(${voiceWords.join("|")})\\s+(\\d+)`, "i"));
    if (playerMatch) {
      const raw = playerMatch[1].toLowerCase();
      const aliased = voiceAliases[raw] || raw;
      const color = voicePalette.find(c => c.name.toLowerCase() === aliased.toLowerCase())?.name
        || colorFor(aliased, voicePalette).name
        || voicePalette[0].name;
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
        // Try full name first, then each individual word (for multi-word categories like "Hockey Sense")
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

      <TopBar
        online={online} pendingCount={Object.keys(pending).length}
        orgName={sessionData?.schedule?.org_name} sessionNumber={sessionData?.schedule?.session_number} groupNumber={sessionData?.schedule?.group_number}
        complete={complete} partial={partial} remaining={remaining}
        syncStatus={syncStatus}
        onOpenSettings={() => setSettingsOpen(true)}
        calibration={calibration} calibrationDismissed={calibrationDismissed} onDismissCalibration={() => setCalibrationDismissed(true)}
        teamColors={teamColors} teamFilter={teamFilter} setTeamFilter={setTeamFilter} athletes={athletes}
        hideCompleted={hideCompleted} setHideCompleted={setHideCompleted}
        viewMode={viewMode} collapseList={collapseList} setCollapseList={setCollapseList} setListExpanded={setListExpanded}
        readOnly={readOnly}
        onOpenConsensus={async () => { setShowConsensus(true); logClientEvent("consensus.opened", { metadata: { catId, scheduleId } }); await loadConsensus(); }}
        onResync={resyncNow}
      />

      {/* Scoring guide modal — "what does a 0 look like, what does a 10 look
          like" reference, per skill, for this category's age tier.
          Rendered here, outside the sticky top-bar, so its z-50 competes at
          the page's top-level stacking order — nested inside a `position:
          sticky` ancestor with its own z-index, it was getting capped to
          that ancestor's context and losing to the Grid view's own sticky
          z-10 header. */}
      {guideOpen && <GuideModal guideData={guideData} onClose={() => setGuideOpen(false)} />}

      {/* Settings — everything that isn't needed at a glance while scoring
          lives here now: scoring guide, calibration numbers, layout, consensus,
          backup/recovery, appearance. Keeps the header down to just player
          counts, the team filter, and the save indicator. Same top-level
          placement reasoning as the guide modal above. */}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          jerseySearch={jerseySearch} setJerseySearch={setJerseySearch} isAnon={isAnon}
          readOnly={readOnly}
          onOpenAddPlayer={() => { setSettingsOpen(false); setAddPlayerOpen(true); }}
          onOpenRoster={() => { setSettingsOpen(false); setShowRoster(true); }}
          onOpenPings={() => { setSettingsOpen(false); setShowPings(true); markPingsSeen(); }}
          unreadPings={unreadPings}
          hasGuideContent={hasGuideContent}
          onOpenGuide={() => { setSettingsOpen(false); setGuideOpen(true); }}
          onOpenRanges={() => { setSettingsOpen(false); setShowRanges(true); }}
          viewMode={viewMode}
          onSetViewMode={(m) => { if (viewMode !== m) logClientEvent("viewmode.toggled", { metadata: { from: viewMode, to: m, scheduleId } }); setViewMode(m); }}
          onDownloadBackup={downloadBackup}
          onDownloadBackupJson={downloadBackupJson}
          onRestoreFromFile={restoreFromFile}
          theme={theme} onToggleTheme={toggleTheme}
        />
      )}

      {addPlayerOpen && (
        <AddPlayerModal
          scheduleId={scheduleId}
          teamColors={teamColors}
          onAdded={refetchSession}
          onClose={() => setAddPlayerOpen(false)}
        />
      )}

      {pingToast && (
        <PingToast toast={pingToast} onClick={() => { setPingToast(null); setShowPings(true); markPingsSeen(); }} />
      )}

      {showRoster && <SessionRosterModal scheduleId={scheduleId} onClose={() => setShowRoster(false)} />}

      {showPings && (
        <TeamPingModal
          pings={pings}
          meUserId={pingsData?.meUserId}
          sending={pingSending}
          text={pingText}
          setText={setPingText}
          onSend={sendPing}
          onClose={() => setShowPings(false)}
        />
      )}

      {showRanges && (
        <RangesModal
          rangesData={rangesData}
          sessionNumber={scheduleData?.session_number}
          groupNumber={scheduleData?.group_number}
          scale={scale}
          onClose={() => setShowRanges(false)}
        />
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
        <GridView
          scoringCats={scoringCats} filtered={filtered} scores={scores} selected={selected} totalCats={totalCats}
          teamColors={teamColors} isAnon={isAnon} anonLabel={anonLabel} increment={increment} scale={scale}
          updateScore={updateScore} setNotesForId={setNotesForId}
        />
      )}

      {notesForId && (
        <NotesSheetModal
          athleteId={notesForId} athletes={athletes} scores={scores}
          isAnon={isAnon} anonLabel={anonLabel} teamColors={teamColors}
          updateNotes={updateNotes} onClose={() => setNotesForId(null)}
        />
      )}

      {(viewMode === "card" || viewMode === "numpad") && (
        <PlayerPool
          filtered={filtered} scores={scores} totalCats={totalCats}
          selected={selected} setSelected={setSelected} teamColors={teamColors}
          idOf={idOf} collapseList={collapseList} listExpanded={listExpanded} setListExpanded={setListExpanded}
        />
      )}

      {/* ── Score panel (card view only) ──────────────────── */}
      {selected && (viewMode === "card" || viewMode === "numpad") && (
        <ScorePanel
          selected={selected} viewMode={viewMode} scoringCats={scoringCats} scores={scores}
          teamColors={teamColors} idOf={idOf}
          navigate={navigate} selectedIdx={selectedIdx} filteredLength={filtered.length} setSelected={setSelected}
          updateScore={updateScore} advanceToNextUnscored={advanceToNextUnscored}
          scoreValues={scoreValues} increment={increment} scale={scale}
          updateNotes={updateNotes} notesMode={notesMode} voiceOn={voiceOn}
          pending={pending} online={online}
          athletes={athletes} isAnon={isAnon} helmetMode={helmetMode} teamLabel={teamLabel}
          currentUserId={currentUserId} catId={catId}
        />
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
        <ConsensusModal
          data={consensusData} loading={consensusLoading}
          evalFilter={consensusEvalFilter} setEvalFilter={setConsensusEvalFilter}
          reviewedFlags={reviewedFlags}
          onDiscussed={(athleteId, severity) => { setReviewedFlags(prev => new Set([...prev, athleteId])); logClientEvent("consensus.flag_resolved", { metadata: { catId, athleteId, severity } }); }}
          isAnon={isAnon} anonLabel={anonLabel} athletes={sessionData?.athletes}
          onFixScore={(athleteId) => {
            const ath = (sessionData?.athletes || []).find(x => x.id === athleteId);
            if (ath) { setSelected(ath); setShowConsensus(false); logClientEvent("consensus.fix_score_clicked", { metadata: { catId, athleteId } }); }
          }}
          closing={closing} onCloseSession={closeSession}
          onClose={() => setShowConsensus(false)}
        />
      )}

      {/* ── Excusal step: mark unscored players absent/injured before closing ── */}
      {excusalNeeded && (
        <ExcusalModal
          needed={excusalNeeded}
          excusals={excusals} setExcusals={setExcusals}
          closing={closing}
          onBack={() => setExcusalNeeded(null)}
          onConfirm={() => attemptClose(excusals)}
        />
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
