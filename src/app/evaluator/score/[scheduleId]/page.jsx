"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useParams } from "next/navigation";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Mic, MicOff, ArrowLeft, WifiOff, ChevronLeft, ChevronRight, X, RotateCcw, RefreshCw } from "lucide-react";
import { findBestCategoryMatch, extractCandidates, buildAliasLookup, normalizeForMatch } from "@/lib/voiceMatch";
import { isCapacitorApp, createNativeContinuousRecognizer } from "@/lib/speechAdapter";

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
  const [closing, setClosing] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceMode, setVoiceMode] = useState('checking'); // checking | live | degraded | unavailable
  const [notesMode, setNotesMode] = useState(false);
  const [teamFilter, setTeamFilter] = useState("all");
  const [hideCompleted, setHideCompleted] = useState(false);
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
  const aliasLookupRef = useRef({});
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

  // Data queries
  const athletes = sessionData?.athletes?.filter(a => a.checked_in) || [];
  const teamColors = sessionData?.checkinSession?.team_colors || ["White", "Dark"];
  const scoringCats = catData?.scoringCategories || [];
  const scale = catData?.category?.scoring_scale || 10;
  const increment = catData?.category?.scoring_increment || 1;
  const totalCats = scoringCats.length;

  useEffect(() => { athletesRef.current = athletes; }, [athletes]);
  useEffect(() => { scoringCatsRef.current = scoringCats; }, [scoringCats]);
  useEffect(() => {
    aliasLookupRef.current = buildAliasLookup(scoringCats.map(c => c.name));
  }, [scoringCats]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { incrementRef.current = increment; }, [increment]);

  const filtered = (teamFilter === "all" ? athletes : athletes.filter(a => a.team_color === teamFilter)).filter(a => !hideCompleted || getStatus(a.id, scores, totalCats) !== "complete").sort((a,b) => (a.jersey_number||999) - (b.jersey_number||999));

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
    }, 3000);
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
    // ── Number normalization ─────────────────────────────────
    const wordNums = {
      'zero':'0','oh':'0',
      'one':'1','won':'1',
      'two':'2','to':'2','too':'2','tu':'2',
      'three':'3','tree':'3',
      'four':'4','for':'4','fore':'4',
      'five':'5','fiver':'5',
      'six':'6','sex':'6','sicks':'6','seeks':'6','sticks':'6','dix':'6','sick':'6','sits':'6',
      'seven':'7','sven':'7',
      'eight':'8','ate':'8','ait':'8',
      'nine':'9','nein':'9','mine':'9',
      'ten':'10',
      'eleven':'11','twelve':'12','thirteen':'13','fourteen':'14',
      'fifteen':'15','sixteen':'16','seventeen':'17','eighteen':'18',
      'nineteen':'19','twenty':'20',
    };
    const compoundNums = {
      'twenty one':'21','twenty two':'22','twenty three':'23','twenty four':'24',
      'twenty five':'25','twenty six':'26','twenty seven':'27','twenty eight':'28',
      'twenty nine':'29','thirty':'30','thirty one':'31','thirty two':'32',
      'thirty three':'33','thirty four':'34','thirty five':'35',
    };
    let normalized = text.trim().toLowerCase();
    // Handle "X and a half" / "X point five" / "X point 5" → X.5
    normalized = normalized.replace(/(\d+)\s+and\s+a\s+half/gi, '$1.5');
    normalized = normalized.replace(/(\d+)\s+point\s+five/gi, '$1.5');
    normalized = normalized.replace(/(\d+)\s+point\s+5/gi, '$1.5');
    normalized = normalized.replace(/(\d+)\s+point\s+(\d)/gi, '$1.$2');
    // Handle compound numbers first (before single-word replacement)
    for (const [words, num] of Object.entries(compoundNums)) {
      normalized = normalized.replace(new RegExp('\\b' + words + '\\b', 'gi'), num);
    }
    // Single word number replacements
    const wordPattern = Object.keys(wordNums).sort((a, b) => b.length - a.length).join('|');
    normalized = normalized.replace(new RegExp('\\b(' + wordPattern + ')\\b', 'gi'), m => wordNums[m.toLowerCase()] || m);
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
        x => x.team_color?.toLowerCase() === color.toLowerCase() && x.jersey_number === jersey
      );
      if (a) { setSelected(a); setVoiceStatus(`Selected: ${color} #${jersey} — ${a.last_name}`); beepPlayerSelected(); }
      else { setVoiceStatus(`${color} #${jersey} not found`); beepError(); }
      return;
    }

    // ── Just a jersey number ──────────────────────────────
    if (/^\d+$/.test(t)) {
      const jersey = parseInt(t);
      const a = athletesRef.current.find(x => x.jersey_number === jersey);
      if (a) { setSelected(a); setVoiceStatus(`Selected: #${jersey} ${a.last_name}`); beepPlayerSelected(); }
      else { setVoiceStatus(`No player with jersey #${jersey}`); beepError(); }
      return;
    }

    // ── Score categories: "skating 8" / "puck skills 7" / "skating 8 puck skills 7" ──
    const cats = scoringCatsRef.current;
    const sel = selectedRef.current;
    if (cats.length) {
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
              if (sel) { updateScore(sel.id, cat.id, val); scored++; break; }
              else { setVoiceStatus("Select a player first"); beepError(); break; }
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
                updateScore(sel.id, cat.id, value);
                scored++;
                fuzzyMatches.push({ cat: cat.name, value, heard: phrase, method: result.method });
              }
            }
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
    }

    // ── Navigation ────────────────────────────────────────
    if (/^next$/.test(t)) { navigate(1); return; }
    if (/^(prev|previous|back)$/.test(t)) { navigate(-1); return; }

    setVoiceStatus(`Not understood: "${text}"`);
    beepError();

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
      if (recRef.current === rec) {
        try { setTimeout(() => rec.start(), isIOS ? 100 : 0); } catch {}
      }
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
  }, [voiceOn, parseVoice, voiceMode]);

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

        {/* Calibration check banner */}
        {calibration && !calibrationDismissed && (
          <div className="mx-3 mt-2 bg-gray-800 border border-blue-800/50 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-blue-900/30">
              <span className="text-xs font-semibold text-blue-300">📊 Session {calibration.prev_session} Review</span>
              <button onClick={() => setCalibrationDismissed(true)} className="text-xs text-gray-500 hover:text-white">Dismiss</button>
            </div>
            <div className="px-4 py-2 border-b border-gray-700/50">
              <p className="text-[11px] text-gray-400 leading-relaxed">Quick look at how your rankings compared to the group last session. This isn't about right or wrong — it's about awareness. If you ranked a player very differently from the group, keep an eye on them today.</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-4">
                <div className="text-center" title="How often your ranking order matched the group's order">
                  <div className={`text-lg font-bold ${calibration.rank_match >= 85 ? "text-green-400" : calibration.rank_match >= 70 ? "text-amber-400" : "text-red-400"}`}>{calibration.rank_match}%</div>
                  <div className="text-[10px] text-gray-500">Ranking alignment</div>
                </div>
                <div className="text-center" title="How many points of the scoring scale you used (higher = better differentiation)">
                  <div className="text-lg font-bold text-white">{calibration.spread}</div>
                  <div className="text-[10px] text-gray-500">Score range</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-white">{calibration.athletes_scored}</div>
                  <div className="text-[10px] text-gray-500">Athletes</div>
                </div>
              </div>
              {calibration.disagreements?.length > 0 && (
                <div>
                  <div className="text-[10px] text-gray-500 mb-1">Players you ranked differently from the group — worth a closer look today:</div>
                  {calibration.disagreements.slice(0, 3).map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                      <span className="text-gray-300 flex-1">{d.name}</span>
                      <span className="text-gray-500">You: #{d.your_rank}</span>
                      <span className="text-gray-500">Group: #{d.group_rank}</span>
                      <span className={`font-bold ${d.diff >= 5 ? "text-red-400" : "text-amber-400"}`}>±{d.diff}</span>
                    </div>
                  ))}
                </div>
              )}
              {Object.keys(calibration.category_bias || {}).length > 0 && (
                <div>
                  <div className="text-[10px] text-gray-500 mb-1">Your avg vs group avg per category (+ means you scored higher, - means lower):</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(calibration.category_bias).map(([cat, bias]) => (
                      <span key={cat} className={`text-[10px] px-1.5 py-0.5 rounded ${Math.abs(bias) > 0.5 ? "bg-amber-900/30 text-amber-400" : "bg-gray-700 text-gray-400"}`}>
                        {cat.split(/[\s/]/)[0]}: {bias > 0 ? "+" : ""}{bias}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setCalibrationDismissed(true)} className="w-full py-2 text-xs font-semibold text-[#1A6BFF] bg-blue-900/20 hover:bg-blue-900/30 border-t border-blue-800/30">
              Got it — Start Scoring
            </button>
          </div>
        )}

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
          <div className="flex items-center gap-2 mt-1 mx-3 mb-1 flex-wrap">
            <button onClick={() => setHideCompleted(h => !h)} className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${hideCompleted ? "bg-green-700 border-green-600 text-white" : "bg-gray-800 border-gray-700 text-gray-400"}`}>
              {hideCompleted ? "✓ Hiding" : "Hide done"}
            </button>
            <div className="flex bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              {[
                { id: "card", label: "Buttons" },
                { id: "numpad", label: "Numpad" },
                { id: "grid", label: "Grid" },
              ].map(m => (
                <button key={m.id} onClick={() => setViewMode(m.id)}
                  className={`px-2.5 py-1 text-xs font-semibold transition-colors ${viewMode === m.id ? "bg-[#1A6BFF] text-white" : "text-gray-400"}`}>
                  {m.label}
                </button>
              ))}
            </div>
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
      {/* ── Grid View (spreadsheet mode) ──────────────────── */}
      {viewMode === "grid" && (
        <div className="flex-1 overflow-auto px-2 pt-2 pb-20">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-800">
                <th className="text-left py-2 px-2 text-xs text-gray-400 font-medium sticky left-0 bg-gray-800 min-w-[140px]">Name</th>
                {scoringCats.map(cat => (
                  <th key={cat.id} className="text-center py-2 px-1 text-xs text-gray-400 font-medium min-w-[60px]">{cat.name.split(/[\s/]/)[0]}</th>
                ))}
                <th className="text-center py-2 px-1 text-xs text-gray-400 font-medium min-w-[40px]">✓</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(athlete => {
                const status = getStatus(athlete.id, scores, totalCats);
                const athleteScores = scores[athlete.id]?.cats || {};
                return (
                  <tr key={athlete.id} className={`border-b border-gray-800 ${status === "complete" ? "bg-green-900/10" : status === "partial" ? "bg-amber-900/10" : ""}`}>
                    <td className="py-1.5 px-2 text-xs text-white font-medium sticky left-0 bg-gray-900 whitespace-nowrap">
                      <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${athlete.team_color === "Dark" ? "bg-gray-400" : "bg-white border border-gray-500"}`} />
                      {athlete.last_name}, {athlete.first_name?.[0]}.
                      {athlete.jersey_number && <span className="text-gray-500 ml-1">#{athlete.jersey_number}</span>}
                    </td>
                    {scoringCats.map(cat => {
                      const val = athleteScores[cat.id];
                      return (
                        <td key={cat.id} className="text-center py-1 px-1">
                          <input
                            type="number"
                            step={increment}
                            min={0}
                            max={scale}
                            value={val ?? ""}
                            onChange={e => {
                              const v = e.target.value === "" ? null : parseFloat(e.target.value);
                              if (v !== null && (v < 0 || v > scale)) return;
                              updateScore(athlete.id, cat.id, v);
                            }}
                            className={`w-full bg-transparent text-center text-sm font-mono outline-none rounded py-1 ${
                              val !== null && val !== undefined ? "text-white" : "text-gray-600"
                            } focus:bg-gray-700 focus:ring-1 focus:ring-[#1A6BFF]`}
                            placeholder="–"
                          />
                        </td>
                      );
                    })}
                    <td className="text-center py-1 px-1">
                      {status === "complete" ? <span className="text-green-400 text-xs">✓</span>
                        : status === "partial" ? <span className="text-amber-400 text-xs">◐</span>
                        : <span className="text-gray-600 text-xs">○</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(viewMode === "card" || viewMode === "numpad") && (<div className="px-3 pt-3 pb-2">
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
      </div>)}

      {/* ── Score panel (card view only) ──────────────────── */}
      {selected && (viewMode === "card" || viewMode === "numpad") && (
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
                className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors ${showCompare ? "bg-purple-700 text-white" : "bg-gray-700 text-gray-400 hover:text-white"}`}>
                ⚖
              </button>
              <button onClick={() => navigate(1)} disabled={selectedIdx >= filtered.length - 1}
                className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 rounded-lg">
                <ChevronRight size={18} />
              </button>
              <button onClick={() => { setSelected(null); setShowCompare(false); }}
                className="p-1.5 text-gray-500 hover:text-white rounded-lg">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Scoring categories */}
          <div className="px-4 py-3 space-y-4">
            {viewMode === "numpad" ? (
              /* ── Numpad mode: compact inline inputs ── */
              scoringCats.map(cat => {
                const current = scores[selected.id]?.cats?.[cat.id];
                return (
                  <div key={cat.id} className="flex items-center gap-3">
                    <span className="text-sm text-gray-300 flex-1">{cat.name}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step={increment}
                      min={0}
                      max={scale}
                      value={current ?? ""}
                      onChange={e => {
                        const v = e.target.value === "" ? null : parseFloat(e.target.value);
                        if (v !== null && (v < 0 || v > scale)) return;
                        updateScore(selected.id, cat.id, v);
                      }}
                      placeholder="—"
                      className={`w-20 py-3 text-center text-lg font-bold rounded-xl border-2 outline-none transition-colors ${
                        current !== null && current !== undefined
                          ? "bg-[#1A6BFF]/10 border-[#1A6BFF] text-white"
                          : "bg-gray-800 border-gray-600 text-gray-400"
                      }`}
                    />
                  </div>
                );
              })
            ) : (
              /* ── Button mode: tappable score buttons ── */
              scoringCats.map(cat => {
                const current = scores[selected.id]?.cats?.[cat.id];
                return (
                  <div key={cat.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold text-gray-200">{cat.name}</span>
                      {current !== null && current !== undefined && (
                        <button onClick={() => updateScore(selected.id, cat.id, null)}
                          className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1">
                          <RotateCcw size={11} /> Clear
                        </button>
                      )}
                    </div>
                    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(scoreValues.length, 10)}, 1fr)` }}>
                      {scoreValues.map(v => (
                        <button key={v} onClick={() => updateScore(selected.id, cat.id, v)}
                          className={`py-2 rounded text-xs font-bold transition-all ${
                            current === v
                              ? "bg-[#1A6BFF] text-white shadow-lg shadow-blue-900/50"
                              : "bg-gray-700 text-gray-300 active:bg-[#1A6BFF] active:text-white"
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

            {/* Compare panel — shows athletes with similar scores */}
            {showCompare && selected && (() => {
              const myScores = scores[selected.id]?.cats || {};
              const myCats = Object.entries(myScores).filter(([, v]) => v !== null && v !== undefined);
              if (!myCats.length) return <div className="text-xs text-gray-500 mt-3">Score this player first to compare.</div>;

              // For each category, find athletes with the exact same score
              const comparisons = scoringCats.map(cat => {
                const myScore = myScores[cat.id];
                if (myScore === null || myScore === undefined) return null;
                const same = athletes.filter(a => {
                  if (a.id === selected.id) return false;
                  return scores[a.id]?.cats?.[cat.id] === myScore;
                }).map(a => a.jersey_number ? `${a.team_color === "Dark" ? "D" : "L"}${a.jersey_number}` : `${a.last_name}, ${a.first_name?.[0]}.`);
                return same.length ? { cat: cat.name, myScore, same } : null;
              }).filter(Boolean);

              return (
                <div className="mt-3 bg-purple-900/20 border border-purple-800/30 rounded-xl p-3">
                  <div className="text-xs font-semibold text-purple-300 mb-2">⚖ Same Score — Are these players equal?</div>
                  {comparisons.length === 0 ? (
                    <div className="text-xs text-gray-500">No other athletes have identical scores.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {comparisons.map(comp => (
                        <div key={comp.cat} className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-gray-400 w-16 flex-shrink-0">{comp.cat.split(/[\s/]/)[0]}: {comp.myScore}</span>
                          {comp.same.map((label, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-800/50 text-purple-300">{label}</span>
                          ))}
                        </div>
                      ))}
                      <div className="text-[10px] text-gray-600 mt-1">If not equal, adjust to differentiate.</div>
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
        <div className="fixed inset-0 z-30 bg-gray-950/95 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Consensus Review</h2>
                <p className="text-xs text-gray-400 mt-0.5">Do evaluators rank athletes in the same tier?</p>
              </div>
              <button onClick={() => setShowConsensus(false)} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800">
                <X size={20} />
              </button>
            </div>

            {consensusLoading ? (
              <div className="text-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1A6BFF] mx-auto" /></div>
            ) : !consensusData?.athletes?.length ? (
              <div className="text-center py-20 text-gray-500 text-sm">No scores submitted yet</div>
            ) : (
              <>
                {/* Summary */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 text-center">
                    <div className="text-xl font-bold text-white">{consensusData.athletes.length}</div>
                    <div className="text-[10px] text-gray-500">Athletes</div>
                  </div>
                  <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 text-center">
                    <div className={`text-xl font-bold ${consensusData.flagged_count > 0 ? "text-amber-400" : "text-green-400"}`}>{consensusData.flagged_count}</div>
                    <div className="text-[10px] text-gray-500">Need Discussion</div>
                  </div>
                  <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 text-center">
                    <div className="text-xl font-bold text-green-400">{consensusData.athletes.length - consensusData.flagged_count}</div>
                    <div className="text-[10px] text-gray-500">Agreed</div>
                  </div>
                </div>

                {/* Tier info */}
                {consensusData.tier_info && (
                  <div className="flex items-center gap-2 mb-4 text-[10px] text-gray-500">
                    <span className="px-2 py-0.5 bg-green-900/30 text-green-400 rounded">Top {consensusData.tier_info.top}</span>
                    <span className="px-2 py-0.5 bg-gray-800 text-gray-400 rounded">Middle</span>
                    <span className="px-2 py-0.5 bg-amber-900/30 text-amber-400 rounded">Bottom {consensusData.tier_info.total - consensusData.tier_info.bottom + 1}</span>
                    <span className="text-gray-600">of {consensusData.tier_info.total} athletes</span>
                  </div>
                )}

                {/* Flagged athletes — tier splits */}
                {consensusData.flagged_count > 0 && (
                  <div className="mb-5">
                    <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">Needs Discussion — Evaluators Ranked in Different Tiers</div>
                    <div className="space-y-2">
                      {consensusData.athletes.filter(a => a.flagged).map(a => (
                        <div key={a.athlete_id} className={`bg-gray-900 border rounded-xl p-4 ${reviewedFlags.has(a.athlete_id) ? "border-green-700/50" : a.severity === "critical" ? "border-red-700/50" : "border-amber-700/50"}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${a.severity === "critical" ? "bg-red-900 text-red-300" : "bg-amber-900 text-amber-300"}`}>
                                {a.severity === "critical" ? "TOP↔BOTTOM" : "TIER SPLIT"}
                              </span>
                              <span className="text-sm font-semibold text-white">{a.first_name} {a.last_name}</span>
                              {a.jersey_number && <span className="text-xs text-gray-500">#{a.jersey_number}</span>}
                            </div>
                            {!reviewedFlags.has(a.athlete_id) ? (
                              <button onClick={() => setReviewedFlags(prev => new Set([...prev, a.athlete_id]))} className="text-xs px-2.5 py-1 bg-green-900/50 text-green-400 rounded-lg hover:bg-green-800/50">Discussed ✓</button>
                            ) : (
                              <span className="text-xs text-green-500">✓ Done</span>
                            )}
                          </div>

                          {/* Per-evaluator rankings */}
                          <div className="space-y-1.5">
                            {a.per_evaluator?.map(ev => (
                              <div key={ev.evaluator_id} className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 w-28 truncate">{ev.evaluator_name}</span>
                                <span className={`text-xs font-bold w-8 text-center ${ev.tier === "top" ? "text-green-400" : ev.tier === "bottom" ? "text-amber-400" : "text-gray-300"}`}>#{ev.rank}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${ev.tier === "top" ? "bg-green-900/40 text-green-400" : ev.tier === "bottom" ? "bg-amber-900/40 text-amber-400" : "bg-gray-800 text-gray-400"}`}>{ev.tier}</span>
                                <span className="text-xs text-gray-600 ml-auto">avg {ev.avg_score}</span>
                              </div>
                            ))}
                          </div>

                          {/* Category detail */}
                          <div className="mt-3 pt-2 border-t border-gray-800">
                            <div className="flex flex-wrap gap-3">
                              {a.categories?.map(cat => (
                                <div key={cat.name} className="text-xs">
                                  <span className="text-gray-500">{cat.name}: </span>
                                  <span className="text-white font-mono">{cat.avg}</span>
                                  {cat.spread > 0 && <span className={`ml-1 ${cat.spread > 2 ? "text-red-400" : cat.spread > 1 ? "text-amber-400" : "text-gray-500"}`}>(±{cat.spread})</span>}
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
                {consensusData.athletes.filter(a => !a.flagged).length > 0 && (
                  <div className="mb-5">
                    <div className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2">All Evaluators Agree on Tier — No Discussion Needed</div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                      <div className="grid grid-cols-2 gap-1">
                        {consensusData.athletes.filter(a => !a.flagged).map(a => (
                          <div key={a.athlete_id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-800/50">
                            <span className="text-xs text-gray-300">{a.first_name} {a.last_name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${a.unique_tiers?.[0] === "top" ? "bg-green-900/30 text-green-400" : a.unique_tiers?.[0] === "bottom" ? "bg-amber-900/30 text-amber-400" : "bg-gray-800 text-gray-400"}`}>{a.unique_tiers?.[0]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Close Session */}
                <div className="border-t border-gray-800 pt-4">
                  <p className="text-xs text-gray-500 mb-3">
                    {consensusData.flagged_count > 0 && [...reviewedFlags].length < consensusData.flagged_count
                      ? `Discuss ${consensusData.flagged_count - [...reviewedFlags].length} remaining athlete(s) before closing, or they'll be reported as unreviewed.`
                      : "All flagged athletes reviewed. Ready to close."}
                  </p>
                  <button onClick={closeSession} disabled={closing}
                    className="w-full py-3 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-xl font-semibold text-sm hover:shadow-lg disabled:opacity-50">
                    {closing ? "Closing..." : "Close Session"}
                  </button>
                </div>
              </>
            )}
          </div>
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

          {/* Restart mic button (helps with Bluetooth) */}
          {voiceOn && !notesMode && (
            <button
              onClick={restartVoice}
              title="Restart mic (use if Bluetooth changed)"
              className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-blue-800/50 text-blue-300 hover:bg-blue-700/50 transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          )}

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
