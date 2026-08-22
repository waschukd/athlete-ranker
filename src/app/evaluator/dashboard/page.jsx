"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Calendar, Clock, MapPin, Users, Plus, Download, LogOut, ClipboardList, Mail, X, Check, ChevronDown, ChevronRight, Copy, AlertCircle, AlertTriangle, Send } from "lucide-react";
import { colorForOrg, OrgChip } from "@/lib/orgVisuals";
import ScheduleBoard from "@/components/ScheduleBoard";
import BatchSignupPrompt from "@/components/BatchSignupPrompt";
import { contiguousBlock } from "@/lib/sessionBlocks";
import { useTrackPageView } from "@/lib/useAnalytics";
import NotificationBell from "@/components/NotificationBell";
import InstallAppButton from "@/components/InstallAppButton";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

const qc = new QueryClient();

const SESSION_TYPE_COLORS = {
  testing: "bg-blue-100 text-blue-700 border-blue-200",
  skills: "bg-purple-100 text-purple-700 border-purple-200",
  scrimmage: "bg-green-100 text-green-700 border-green-200",
};

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.toString().split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

// Compact time range used by the dense Available list. Drops the AM/PM on the
// start when both ends share it ("9:00—10:15a"), keeps both when crossing
// noon ("11:30a—12:30p"). Saves ~4 chars per row vs. the full formatTime.
function formatTimeRange(start, end) {
  if (!start) return "";
  const parse = (t) => {
    const [h, m] = t.toString().split(":");
    const hr = parseInt(h);
    const display = hr > 12 ? hr - 12 : (hr === 0 ? 12 : hr);
    const ampm = hr >= 12 ? "p" : "a";
    return { display, m, ampm };
  };
  const s = parse(start);
  if (!end) return `${s.display}:${s.m}${s.ampm}`;
  const e = parse(end);
  if (s.ampm === e.ampm) return `${s.display}:${s.m}—${e.display}:${e.m}${e.ampm}`;
  return `${s.display}:${s.m}${s.ampm}—${e.display}:${e.m}${e.ampm}`;
}

// Org visuals (palette + chip + abbreviation) are now in @/lib/orgVisuals.
// Date strip + month calendar are in @/components/SessionDateNav.

function formatDate(d) {
  if (!d) return "";
  const str = d.toString().split("T")[0];
  const [year, month, day] = str.split("-").map(Number);
  if (!year || !month || !day) return str;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// Today's date in the viewer's LOCAL timezone as YYYY-MM-DD. Using UTC
// (toISOString) rolls over at ~5-8pm North American time — exactly when evening
// evaluations run — making today's session read as "past".
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function generateICal(session) {
  const date = session.scheduled_date?.toString().split("T")[0].replace(/-/g, "");
  const startTime = session.start_time?.toString().replace(/:/g, "").substring(0, 4) + "00";
  const endTime = session.end_time?.toString().replace(/:/g, "").substring(0, 4) + "00";
  return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Sideline Star//EN\nBEGIN:VEVENT\nDTSTART:${date}T${startTime}\nDTEND:${date}T${endTime}\nSUMMARY:Evaluation - ${session.org_name} ${session.category_name}\nLOCATION:${session.location || "TBD"}\nDESCRIPTION:Session ${session.session_number}${session.group_number ? ` Group ${session.group_number}` : ""}\nEND:VEVENT\nEND:VCALENDAR`;
}

function InviteModal({ session, onClose }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const sendInvite = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/evaluator/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: session.schedule_id,
          email,
          session_info: {
            org_name: session.org_name,
            category_name: session.category_name,
            session_number: session.session_number,
            group_number: session.group_number,
            scheduled_date: session.scheduled_date,
            start_time: session.start_time,
            end_time: session.end_time,
            location: session.location,
          }
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: "Failed to send invite" });
    }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-gray-900">Invite an Evaluator</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {session.org_name} · {session.category_name} · S{session.session_number} G{session.group_number}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        {result ? (
          <div className="text-center py-4">
            {result.success ? (
              <>
                <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="font-semibold text-gray-900 mb-1">Invite sent!</p>
                <p className="text-sm text-gray-500">{email} will receive a link to sign up for this session.</p>
                <button onClick={onClose} className="mt-4 px-5 py-2 bg-[#0b5cd6] text-white rounded-lg text-sm font-medium">Done</button>
              </>
            ) : (
              <>
                <p className="text-red-600 text-sm">{result.error}</p>
                <button onClick={() => setResult(null)} className="mt-3 text-sm text-gray-500 hover:text-gray-700">Try again</button>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={sendInvite} className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">
              <span className="font-semibold">{parseInt(session.evaluators_required) - parseInt(session.evaluators_signed_up || 1)} spots</span> still open for this session
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Evaluator's Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="colleague@email.com"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]"
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={sending}
                className="flex-1 py-2.5 bg-[#0b5cd6] text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                <Mail size={14} />
                {sending ? "Sending..." : "Send Invite"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function CancelModal({ scheduleId, onClose, onConfirm, isPending }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Cancel Session</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">Let your provider know why (optional).</p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. Scheduling conflict, family commitment…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none mb-4"
        />
        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
            Keep Session
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => onConfirm(scheduleId, reason)}
            className="flex-1 py-2.5 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 disabled:opacity-50">
            {isPending ? "Cancelling…" : "Confirm Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionCard({ session, onSignup, onCancel, onCancelWithReason, cancelPending, mode, conflict, kind, signedUp }) {
  // kind ("evaluation" | "testing") is set in the combined My Sessions list so one
  // card can render either commitment. It drives the badge, the staffing wording,
  // and which staffing count to read (testers_* vs evaluators_*).
  const isTesting = kind === "testing";
  const roleNoun = isTesting ? "tester" : "evaluator";
  const reqCount = parseInt(isTesting ? session.testers_required : session.evaluators_required);
  const spotsLeft = reqCount - parseInt((isTesting ? session.testers_signed_up : session.evaluators_signed_up) || 0);
  const spotsAfterMe = reqCount - parseInt((isTesting ? session.testers_signed_up : session.evaluators_signed_up) || 1);
  const isUpcoming = new Date(session.scheduled_date?.toString().split("T")[0]) >= new Date(localToday());
  const [showInvite, setShowInvite] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Status badge (My Sessions only): TODAY / Needs scoring / Scored / Upcoming.
  // Testing sessions don't carry scoring state here, so they show plain when-badges.
  const dateStr = session.scheduled_date?.toString().split("T")[0];
  const todayStr = localToday();
  const scored = parseInt(session.my_scored_athletes || 0) > 0;
  const isToday = dateStr === todayStr;
  const isPast = dateStr < todayStr;
  const badge = mode !== "mine" ? null
    : session.closed ? { t: "Closed ✓", c: "bg-green-100 text-green-700" }
    : isTesting
      ? (isToday ? { t: "Today", c: "bg-accent-soft text-accent" } : isPast ? { t: "Past", c: "bg-gray-100 text-gray-500" } : { t: "Upcoming", c: "bg-gray-100 text-gray-500" })
    : isToday ? { t: scored ? "Today · Scored ✓" : "Today", c: "bg-accent-soft text-accent" }
    : isPast ? (scored ? { t: "Scored ✓", c: "bg-green-50 text-green-700" } : { t: "Needs scoring", c: "bg-amber-100 text-amber-700" })
    : (scored ? { t: "Upcoming · Scored ✓", c: "bg-green-50 text-green-700" } : { t: "Upcoming", c: "bg-gray-100 text-gray-500" });

  const downloadICal = () => {
    const ical = generateICal(session);
    const blob = new Blob([ical], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${session.schedule_id}.ics`;
    a.click();
  };

  return (
    <>
      <div className={`bg-white border rounded-xl p-5 hover:shadow-md transition-all ${
        mode === "mine" ? "border-[#0b5cd6]/30 bg-orange-50/20" : signedUp ? "border-green-300 bg-green-50/30" : "border-gray-200"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {kind && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${isTesting ? "bg-purple-100 text-purple-700 border-purple-200" : "bg-blue-100 text-blue-700 border-blue-200"}`}>
                  {isTesting ? "Testing" : "Evaluation"}
                </span>
              )}
              <OrgChip name={session.org_name} palette={colorForOrg(session.org_name)} />
              <span className="text-gray-300">·</span>
              <span className="font-medium text-gray-700">{session.category_name}</span>
              {session.session_type && (
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${SESSION_TYPE_COLORS[session.session_type] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                  {session.session_type}
                </span>
              )}
              {badge && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge.c}`}>{badge.t}</span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-1 text-sm text-gray-500 mt-1">
              <span className="flex items-center gap-1.5"><Calendar size={13} />{formatDate(session.scheduled_date)}</span>
              {session.start_time && (
                <span className="flex items-center gap-1.5"><Clock size={13} />{formatTime(session.start_time)}{session.end_time ? ` — ${formatTime(session.end_time)}` : ""}</span>
              )}
              {session.location && (
                <span className="flex items-center gap-1.5"><MapPin size={13} />{session.location}</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
              <span>Session {session.session_number}{session.group_number ? ` · Group ${session.group_number}` : ""}</span>
              <span className="flex items-center gap-1">
                <Users size={11} />
                {mode === "mine"
                  ? spotsAfterMe > 0
                    ? `${spotsAfterMe} more ${roleNoun}${spotsAfterMe !== 1 ? "s" : ""} needed`
                    : "Session fully staffed ✓"
                  : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left of ${reqCount}`
                }
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap mt-3 sm:mt-0">
            {mode === "mine" ? (
              session.closed ? (
                <a href={`/evaluator/score/${session.schedule_id}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-500 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                  <ClipboardList size={14} /> View (closed)
                </a>
              ) : (
              <>
                <a href={`/evaluator/score/${session.schedule_id}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow">
                  <ClipboardList size={14} /> Score
                </a>
                {!isTesting && spotsAfterMe > 0 && (
                  <button
                    onClick={() => setShowInvite(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 border border-blue-200 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
                  >
                    <Mail size={13} /> Invite
                  </button>
                )}
                <button onClick={downloadICal}
                  className="p-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors" title="Add to calendar">
                  <Download size={14} />
                </button>
                {isUpcoming && (
                  <button onClick={() => setShowCancelModal(true)}
                    className="px-3 py-2 border border-red-200 text-red-500 rounded-lg text-xs hover:bg-red-50 transition-colors">
                    Cancel
                  </button>
                )}
              </>
              )
            ) : signedUp ? (
              // Just signed up from this list — the card stays put (no reflow, no
              // scroll jump) and flips to a confirmation. It clears on the next
              // real refresh of the tab; by then it lives in My Sessions.
              <span className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-3 sm:py-2 bg-green-50 text-green-700 border border-green-300 rounded-lg text-sm font-semibold">
                <Check size={14} /> Signed up
              </span>
            ) : conflict ? (
              <button
                disabled
                title="You're already signed up for a session that overlaps this time. Cancel that one first if you'd rather take this."
                className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-3 sm:py-2 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-sm font-semibold cursor-not-allowed">
                <AlertTriangle size={14} /> Time conflict
              </button>
            ) : (
              <button onClick={() => onSignup(session.schedule_id)}
                className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-3 sm:py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow">
                <Plus size={14} /> Sign Up
              </button>
            )}
          </div>
        </div>
      </div>

      {showInvite && (
        <InviteModal session={session} onClose={() => setShowInvite(false)} />
      )}
      {showCancelModal && (
        <CancelModal
          scheduleId={session.schedule_id}
          isPending={cancelPending}
          onClose={() => setShowCancelModal(false)}
          onConfirm={(id, reason) => {
            onCancelWithReason(id, reason);
            setShowCancelModal(false);
          }}
        />
      )}
    </>
  );
}

// ── Calendar subscribe panel ─────────────────────────────────────────
// One-time subscription to a personal ICS feed. Once added, the user's
// calendar app (Google / Apple / Outlook) auto-pulls new signups,
// schedule changes, cancellations — no polling, no notifications to wire
// up, and the OS-level calendar reminders work for free.
function CalendarSubscribePanel() {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ar_calendar_panel_dismissed") === "1";
  });
  // webcal:// has no handler on Android, so the Apple Calendar button just
  // errors out in the Capacitor APK. Hide it on android-native; iOS-native
  // and any web browser still get all three.
  const [isAndroidNative, setIsAndroidNative] = useState(false);
  useEffect(() => {
    setIsAndroidNative(window.Capacitor?.getPlatform?.() === "android");
  }, []);

  const { data } = useQuery({
    queryKey: ["calendar-link"],
    queryFn: async () => {
      const res = await fetch("/api/evaluator/calendar-link");
      if (!res.ok) throw new Error("calendar link fetch failed");
      return res.json();
    },
    enabled: !collapsed,
  });

  const dismiss = () => {
    setCollapsed(true);
    try { localStorage.setItem("ar_calendar_panel_dismissed", "1"); } catch {}
  };

  const handleCopy = async () => {
    if (!data?.httpsUrl) return;
    try {
      await navigator.clipboard.writeText(data.httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (collapsed) {
    return (
      <button
        onClick={() => { setCollapsed(false); try { localStorage.removeItem("ar_calendar_panel_dismissed"); } catch {} }}
        className="text-xs text-gray-400 hover:text-blue-600 mb-3 underline"
      >
        Show calendar sync options
      </button>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-blue-900 text-sm flex items-center gap-1.5">
            <Calendar size={14} /> Sync to your calendar
          </h3>
          <p className="text-xs text-blue-700/80 mt-1 leading-relaxed">
            Subscribe once. Sessions appear automatically in your calendar app — including reminders, future signups, and cancellations.
          </p>
        </div>
        <button onClick={dismiss} className="text-blue-400 hover:text-blue-700 p-1 -m-1 flex-shrink-0" aria-label="Hide">
          <X size={14} />
        </button>
      </div>
      <a
        href={data?.httpsUrl ? `${data.httpsUrl}&download=1` : "#"}
        download="sidelinestar-sessions.ics"
        className={`inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 mb-3 bg-blue-600 border border-blue-600 rounded-lg text-sm font-semibold text-white hover:bg-blue-700 transition-colors ${!data ? "opacity-50 pointer-events-none" : ""}`}
      >
        ⬇ Download &amp; add my sessions (instant)
      </a>
      <div className="flex flex-wrap gap-2">
        <a
          href={data?.googleUrl || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-blue-50 transition-colors ${!data ? "opacity-50 pointer-events-none" : ""}`}
        >
          📅 Add to Google Calendar
        </a>
        {!isAndroidNative && (
          <a
            href={data?.webcalUrl || "#"}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-blue-50 transition-colors ${!data ? "opacity-50 pointer-events-none" : ""}`}
          >
            🍎 Add to Apple Calendar
          </a>
        )}
        <button
          onClick={handleCopy}
          disabled={!data}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-blue-50 transition-colors disabled:opacity-50"
        >
          {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
      <p className="text-[11px] text-blue-700/70 mt-2 leading-relaxed">
        Subscribing keeps your calendar auto-updated, but Google can take several hours to first sync. Use Download for an instant add.
      </p>
    </div>
  );
}

// Segmented All / Testing / Evaluation switch, shown only to a dual-role person so
// they can view (or sign up from) everything at once or narrow to one kind. Counts
// are live so the breakdown is obvious at a glance.
function SessionTypeTabs({ value, onChange, counts }) {
  const opts = [
    ["all", "All", counts.all],
    ["testing", "Testing", counts.testing],
    ["evaluation", "Evaluation", counts.evaluation],
  ];
  return (
    <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white mb-3">
      {opts.map(([v, l, c]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${value === v ? "bg-[#0b5cd6] text-white" : "text-gray-600 hover:bg-gray-50"}`}>
          {l} <span className={value === v ? "opacity-80" : "text-gray-400"}>({c})</span>
        </button>
      ))}
    </div>
  );
}

function AvailabilitySection() {
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["evaluator-availability"],
    queryFn: async () => {
      const res = await fetch("/api/evaluator/availability");
      if (!res.ok) throw new Error("fetch failed");
      return res.json();
    },
  });

  const blackouts = data?.blackouts || [];

  const handleRemove = async (id) => {
    try {
      await fetch(`/api/evaluator/availability?id=${id}`, { method: "DELETE" });
      refetch();
    } catch { /* transient network failure -- nothing to show, row just stays put */ }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/evaluator/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: startDate, end_date: endDate, note }),
      });
      if (!res.ok) {
        const d = await res.json();
        setAddError(d.error || "Failed to add");
      } else {
        setStartDate("");
        setEndDate("");
        setNote("");
        refetch();
      }
    } catch {
      setAddError("Failed to add");
    }
    setAdding(false);
  };

  const fmtBlackout = (b) => {
    const fmt = (d) => {
      if (!d) return "";
      const [y, m, day] = d.toString().split("T")[0].split("-").map(Number);
      return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };
    const start = fmt(b.start_date);
    const end = fmt(b.end_date);
    return start === end ? start : `${start} – ${end}`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <h2 className="font-display font-bold text-ink text-base mb-1">Availability</h2>
      <p className="text-xs text-gray-500 mb-4">Mark dates you can't evaluate — you won't be auto-invited to sessions on these dates.</p>

      {isLoading ? (
        <div className="text-sm text-gray-400 py-2">Loading…</div>
      ) : blackouts.length === 0 ? (
        <p className="text-sm text-gray-400 mb-4">No unavailable dates set.</p>
      ) : (
        <ul className="space-y-1.5 mb-4">
          {blackouts.map(b => (
            <li key={b.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm">
              <span className="text-gray-800 font-medium">{fmtBlackout(b)}</span>
              {b.note && <span className="text-gray-500 truncate flex-1 text-xs ml-1">· {b.note}</span>}
              <button
                onClick={() => handleRemove(b.id)}
                className="text-gray-400 hover:text-red-500 p-1 rounded flex-shrink-0"
                aria-label="Remove blackout">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="space-y-3">
        {/* Quick presets */}
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 self-center">Quick:</span>
          {[
            { label: "1 day", days: 0 },
            { label: "1 week", days: 6 },
            { label: "2 weeks", days: 13 },
          ].map(({ label, days }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                const today = new Date();
                const pad = (n) => String(n).padStart(2, "0");
                const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                const end = new Date(today);
                end.setDate(today.getDate() + days);
                setStartDate(fmt(today));
                setEndDate(fmt(end));
              }}
              className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border border-[#0b5cd6]/30 bg-[#e8f0fd] text-[#0b5cd6] hover:bg-[#0b5cd6] hover:text-white transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start date</label>
            <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">End date</label>
            <input type="date" required value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
        </div>
        <input type="text" value={note} onChange={e => setNote(e.target.value)}
          placeholder="Note (optional, e.g. Vacation)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        {addError && <p className="text-xs text-red-600">{addError}</p>}
        <button type="submit" disabled={adding || !startDate || !endDate}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-soft text-accent rounded-lg text-sm font-semibold hover:bg-accent hover:text-white transition-colors disabled:opacity-50">
          <Plus size={14} /> {adding ? "Adding…" : "Add unavailable dates"}
        </button>
      </form>
    </div>
  );
}

function HoursAndPaySection() {
  const { data, isLoading } = useQuery({
    queryKey: ["evaluator-pay"],
    queryFn: async () => {
      const res = await fetch("/api/evaluator/pay");
      if (!res.ok) throw new Error("fetch failed");
      return res.json();
    },
  });

  const orgs = data?.orgs || [];

  if (isLoading) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">Loading hours &amp; pay…</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h2 className="font-display font-bold text-ink text-base mb-1">Hours &amp; Pay</h2>
        <p className="text-xs text-gray-500">
          Hours are logged automatically when you score a session, then approved by your provider.
        </p>
      </div>

      {orgs.length === 0 ? (
        <div className="py-16 text-center">
          <Clock size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-sm text-gray-400">No hours logged yet.</p>
        </div>
      ) : (
        orgs.map((org) => {
          const hasRate = org.hourly_rate != null;
          return (
            <div key={org.org_id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              {/* Org name + rate header */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-ink text-base leading-tight truncate">
                    {org.org_name}
                  </h3>
                  {hasRate ? (
                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-accent-soft text-accent text-xs font-semibold rounded-full">
                      ${Number(org.hourly_rate).toFixed(2)}/hr
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 mt-1 block">Rate not set by provider</span>
                  )}
                </div>
                {hasRate && org.earned != null && (
                  <div className="text-right flex-shrink-0">
                    <div className="font-display font-black text-ink text-2xl leading-none">
                      ${Number(org.earned).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">earned</div>
                    {org.paid_amount != null && (
                      <div className="text-xs text-gray-500 mt-1">
                        Paid: <span className="font-semibold text-ink">${Number(org.paid_amount).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Hours breakdown */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Pending", value: org.pending_hours, cls: "text-amber-600" },
                  { label: "Approved", value: org.approved_hours, cls: "text-accent" },
                  { label: "Paid", value: org.paid_hours, cls: "text-green-600" },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className={`font-display font-bold text-lg leading-none ${cls}`}>
                      {Number(value || 0).toFixed(1)}h
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{label}</div>
                  </div>
                ))}
              </div>

              {!hasRate && (
                <p className="mt-3 text-xs text-gray-400 italic">
                  Your provider hasn&apos;t set a pay rate yet.
                </p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function MessagesSection() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sentConfirm, setSentConfirm] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [showCompose, setShowCompose] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["evaluator-messages"],
    queryFn: async () => {
      const res = await fetch("/api/messages");
      if (!res.ok) throw new Error("fetch failed");
      return res.json();
    },
  });

  const inbox = data?.inbox || [];
  const sent = data?.sent || [];
  const unread = data?.unread || 0;

  const handleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    const msg = inbox.find(m => m.id === id);
    if (msg && !msg.read_at) {
      try {
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mark_read: id }),
        });
        refetch();
      } catch { /* transient network failure -- it'll just show unread next time */ }
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      if (!res.ok) {
        const d = await res.json();
        setSendError(d.error || "Failed to send");
      } else {
        setSubject("");
        setBody("");
        setSentConfirm(true);
        setShowCompose(false);
        setTimeout(() => setSentConfirm(false), 4000);
        refetch();
      }
    } catch {
      setSendError("Failed to send");
    }
    setSending(false);
  };

  const fmtMsgDate = (d) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="font-display font-bold text-ink text-base">Messages</h2>
          {unread > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-accent text-white text-[11px] font-bold rounded-full">
              {unread}
            </span>
          )}
        </div>
        <button
          onClick={() => { setShowCompose(v => !v); setSentConfirm(false); setSendError(null); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity">
          <Send size={12} /> Compose
        </button>
      </div>

      {sentConfirm && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 mb-3">
          <Check size={14} className="flex-shrink-0" /> Message sent to your provider.
        </div>
      )}

      {showCompose && (
        <form onSubmit={handleSend} className="space-y-3 mb-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">New message to provider</h3>
          <input type="text" required value={subject} onChange={e => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
          <textarea required value={body} onChange={e => setBody(e.target.value)}
            rows={4} placeholder="Message…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none" />
          {sendError && <p className="text-xs text-red-600">{sendError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowCompose(false)}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-100">
              Cancel
            </button>
            <button type="submit" disabled={sending}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-50">
              <Send size={13} /> {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="text-sm text-gray-400 py-2">Loading…</div>
      ) : inbox.length === 0 && sent.length === 0 ? (
        <p className="text-sm text-gray-400">No messages yet.</p>
      ) : (
        <div className="space-y-4">
          {inbox.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Inbox</h3>
              <ul className="space-y-1.5">
                {inbox.map(msg => (
                  <li key={msg.id}
                    className={`rounded-xl border transition-colors cursor-pointer ${!msg.read_at ? "border-accent/30 bg-accent-soft/10" : "border-gray-200 bg-white"}`}>
                    <button type="button" onClick={() => handleExpand(msg.id)}
                      className="w-full text-left px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {!msg.read_at && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />}
                            <span className={`text-sm font-semibold truncate ${!msg.read_at ? "text-ink" : "text-gray-700"}`}>{msg.subject}</span>
                          </div>
                          <span className="text-xs text-gray-500 mt-0.5 block">From {msg.from_user_name} · {fmtMsgDate(msg.created_at)}</span>
                        </div>
                        {expanded === msg.id ? <ChevronDown size={14} className="text-gray-400 flex-shrink-0 mt-1" /> : <ChevronRight size={14} className="text-gray-400 flex-shrink-0 mt-1" />}
                      </div>
                      {expanded === msg.id && (
                        <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap leading-relaxed border-t border-gray-100 pt-3">{msg.body}</p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sent.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Sent</h3>
              <ul className="space-y-1.5">
                {sent.map(msg => (
                  <li key={msg.id} className="px-4 py-3 border border-gray-200 rounded-xl bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-gray-700 truncate block">{msg.subject}</span>
                        <span className="text-xs text-gray-400">To {msg.to_user_name} · {fmtMsgDate(msg.created_at)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EvaluatorDashboard() {
  useTrackPageView("dashboard.evaluator.viewed");
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("mine");
  const [joinCode, setJoinCode] = useState("");
  const [joinMsg, setJoinMsg] = useState("");
  const [joiningOrg, setJoiningOrg] = useState(false);
  const [signupError, setSignupError] = useState(null);
  const [signupOk, setSignupOk] = useState(null);
  const [theme, toggleTheme] = useTheme();

  // Capabilities drive which dashboard(s) this person sees. Also carries the
  // tester's testing sessions. Evaluator data is gated on isEvaluator so a pure
  // tester issues ZERO evaluator queries (the hard isolation guarantee).
  const { data: capData } = useQuery({
    queryKey: ["my-capabilities"],
    queryFn: async () => { const res = await fetch("/api/tester/sessions"); return res.json(); },
  });
  const capsLoaded = !!capData;
  const isTester = !!capData?.isTester;
  const isEvaluator = !!capData?.isEvaluator;
  // A PURE tester (tester capability, no evaluator capability) has a dedicated
  // dashboard at /tester/dashboard — send them there instead of the evaluator shell.
  // Everyone else (evaluators + dual-role) stays here; dual-role sees testing folded
  // into their combined My Sessions / Available lists.
  useEffect(() => {
    if (capsLoaded && isTester && !isEvaluator) window.location.replace("/tester/dashboard");
  }, [capsLoaded, isTester, isEvaluator]);

  const { data: statusData } = useQuery({
    queryKey: ["evaluator-status"],
    enabled: isEvaluator,
    queryFn: async () => {
      const res = await fetch("/api/evaluator/status");
      return res.json();
    },
  });

  const { data: mineData, isLoading: mineLoading } = useQuery({
    queryKey: ["evaluator-sessions-mine"],
    enabled: isEvaluator,
    queryFn: async () => {
      const res = await fetch("/api/evaluator/sessions?view=mine");
      return res.json();
    },
  });

  const { data: availData, isLoading: availLoading } = useQuery({
    queryKey: ["evaluator-sessions-available"],
    enabled: isEvaluator,
    queryFn: async () => {
      const res = await fetch("/api/evaluator/sessions?view=available");
      return res.json();
    },
  });

  // Sessions signed up for from the Available list THIS visit, keyed
  // "kind:schedule_id" → session snapshot. The refetch after signup drops them
  // from the server list; we re-insert the snapshot so the card stays exactly
  // where it was (flipped to "Signed up ✓") instead of the list reflowing and
  // losing the person's scroll spot. Cleared on any tab switch.
  const [justSignedUp, setJustSignedUp] = useState(() => new Map());

  const signupMutation = useMutation({
    mutationFn: async (schedule_id) => {
      const res = await fetch("/api/evaluator/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule_id, action: "signup" }),
      });
      const data = await res.json();
      return { ok: res.ok, ...data };
    },
    onSuccess: (data, schedule_id) => {
      // Server returned an error (409 conflict, 400 no spots, etc) — surface
      // it as a banner instead of treating it as a successful signup.
      if (!data.ok || data.error) {
        setSignupError(data.message || data.error || "Couldn't sign up.");
        return;
      }
      setSignupError(null);
      markSignedUp("evaluation", schedule_id);
      queryClient.invalidateQueries({ queryKey: ["evaluator-sessions-mine"] });
      queryClient.invalidateQueries({ queryKey: ["evaluator-sessions-available"] });
      if (data.ical) {
        const blob = new Blob([data.ical], { type: "text/calendar" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "session.ics";
        a.click();
      }
      // Stay on the available list so they can keep signing up; the card they
      // just took stays in place marked "Signed up ✓". Confirm with a banner.
      setSignupOk("You're signed up. Pick another below, or check \"My Sessions\" anytime.");
    },
    // A network failure (dropped connection, backgrounded tab) rejects the
    // fetch itself rather than resolving with an error payload -- without an
    // onError, that rejection went unhandled (surfacing as a "Load failed"
    // Sentry error) and the evaluator saw no feedback that the tap did nothing.
    onError: (err) => {
      console.error("Signup failed:", err);
      setSignupError("Couldn't sign up — check your connection and try again.");
    },
  });

  const [cancelWarning, setCancelWarning] = useState(null);

  const cancelMutation = useMutation({
    mutationFn: async ({ schedule_id, reason }) => {
      const res = await fetch("/api/evaluator/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule_id, action: "cancel", reason: reason || "" }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.warning) setCancelWarning(data.warning);
      queryClient.invalidateQueries({ queryKey: ["evaluator-sessions-mine"] });
      queryClient.invalidateQueries({ queryKey: ["evaluator-sessions-available"] });
    },
    onError: (err) => {
      console.error("Cancel failed:", err);
      setCancelWarning("Couldn't cancel — check your connection and try again.");
    },
  });

  // Cancelling a TESTING commitment from the combined My Sessions list goes through
  // the tester endpoint (the evaluator cancel path doesn't touch testing signups).
  const testerCancelMutation = useMutation({
    mutationFn: async (schedule_id) => {
      const res = await fetch("/api/tester/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule_id, action: "cancel" }),
      });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["my-capabilities"] }); },
    onError: (err) => console.error("Tester cancel failed:", err),
  });

  // Signing up for a TESTING session from the combined available list.
  const testerSignupMutation = useMutation({
    mutationFn: async (schedule_id) => {
      const res = await fetch("/api/tester/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule_id, action: "signup" }),
      });
      return { ok: res.ok, ...(await res.json().catch(() => ({}))) };
    },
    onSuccess: (data, schedule_id) => {
      if (!data.ok || data.error) { setSignupError(data.message || data.error || "Couldn't sign up."); return; }
      setSignupError(null);
      markSignedUp("testing", schedule_id);
      setSignupOk("You're signed up. Pick another below, or check \"My Sessions\" anytime.");
      queryClient.invalidateQueries({ queryKey: ["my-capabilities"] });
    },
    onError: (err) => {
      console.error("Tester signup failed:", err);
      setSignupError("Couldn't sign up — check your connection and try again.");
    },
  });

  const handleJoinCode = async (e) => {
    e.preventDefault();
    setJoiningOrg(true);
    setJoinMsg("");
    // A bare async form handler that throws (e.g. a dropped mobile connection)
    // becomes an unhandled promise rejection -- React doesn't await event
    // handlers, so nothing catches it -- and shows the user nothing at all.
    try {
      const res = await fetch("/api/evaluator/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode }),
      });
      const data = await res.json();
      setJoinMsg({ text: data.message || data.error, ok: !!data.success });
      if (data.success) {
        setJoinCode("");
        queryClient.invalidateQueries();
      }
    } catch {
      setJoinMsg({ text: "Network error — try again.", ok: false });
    }
    setJoiningOrg(false);
  };

  const mineSessions = mineData?.sessions || [];
  const availSessions = availData?.sessions || [];

  // Combined "My Sessions": evaluation signups + testing signups in one list, each
  // tagged so the card can badge it Evaluation vs Testing. Lets a dual-role person
  // (evaluator + tester) see their whole day in one place instead of flipping views.
  const combinedMine = useMemo(() => [
    ...mineSessions.map(s => ({ ...s, __kind: "evaluation" })),
    ...(capData?.mine || []).map(s => ({ ...s, __kind: "testing" })),
  ], [mineSessions, capData]);

  // Segmented All / Testing / Evaluation filter for My Sessions.
  const [mineFilter, setMineFilter] = useState("all");
  const mineFiltered = useMemo(
    () => mineFilter === "all" ? combinedMine : combinedMine.filter(s => s.__kind === mineFilter),
    [combinedMine, mineFilter]
  );
  const mineCounts = useMemo(() => ({
    all: combinedMine.length,
    testing: combinedMine.filter(s => s.__kind === "testing").length,
    evaluation: combinedMine.filter(s => s.__kind === "evaluation").length,
  }), [combinedMine]);

  // ONE available list: testing sessions the person can sign up for + (if they hold
  // evaluator rights) evaluation sessions that DON'T conflict with testing — the
  // server already hides testing-conflicting evals. Each is tagged so the card can
  // badge it Testing vs Evaluation. No view to flip, one schedule to sign up from.
  const combinedAvail = useMemo(() => [
    ...availSessions.map(s => ({ ...s, __kind: "evaluation" })),
    ...(capData?.available || []).map(s => ({ ...s, __kind: "testing" })),
  ], [availSessions, capData]);

  // Snapshot a session at signup time so its card can keep rendering after the
  // refetch removes it from the server's available list.
  const markSignedUp = (kind, id) => {
    const snap = combinedAvail.find(s => s.__kind === kind && s.schedule_id === id);
    if (snap) setJustSignedUp(m => new Map(m).set(`${kind}:${id}`, snap));
  };
  const isJustSignedUp = (s) => justSignedUp.has(`${s.__kind}:${s.schedule_id}`);
  // What the Available tab renders: the fresh server list + just-signed-up
  // snapshots re-inserted (ScheduleBoard sorts by date/time, so each lands back
  // in its original visual spot — no reflow, no lost scroll position).
  const availDisplay = useMemo(() => {
    if (justSignedUp.size === 0) return combinedAvail;
    const present = new Set(combinedAvail.map(s => `${s.__kind}:${s.schedule_id}`));
    const extras = [...justSignedUp.entries()].filter(([k]) => !present.has(k)).map(([, s]) => s);
    return [...combinedAvail, ...extras];
  }, [combinedAvail, justSignedUp]);

  // Association filter — options drawn from the combined available list, so it only
  // ever lists the person's own accessible associations. "all" = every one.
  const [availOrgFilter, setAvailOrgFilter] = useState("all");
  const [availTypeFilter, setAvailTypeFilter] = useState("all");
  const availOrgs = useMemo(() => {
    const set = new Set();
    combinedAvail.forEach(s => s.org_name && set.add(s.org_name));
    return Array.from(set).sort();
  }, [combinedAvail]);
  const availFiltered = useMemo(() => {
    let list = availDisplay;
    if (availTypeFilter !== "all") list = list.filter(s => s.__kind === availTypeFilter);
    if (availOrgFilter !== "all") list = list.filter(s => s.org_name === availOrgFilter);
    return list;
  }, [availDisplay, availTypeFilter, availOrgFilter]);
  const availCounts = useMemo(() => ({
    all: combinedAvail.length,
    testing: combinedAvail.filter(s => s.__kind === "testing").length,
    evaluation: combinedAvail.filter(s => s.__kind === "evaluation").length,
  }), [combinedAvail]);

  // Every time slot the person already holds — testing AND evaluation — so any
  // available session (of either kind) that overlaps one is flagged and its Sign Up
  // disabled. This is what prevents double-booking across the two, in one place.
  // Two intervals overlap iff a.start < b.end AND b.start < a.end (same day).
  const myOccupied = useMemo(() => combinedMine
    .map(s => ({
      dateKey: s.scheduled_date?.toString().split("T")[0],
      start: s.start_time?.toString(),
      end: s.end_time?.toString(),
    }))
    .filter(x => x.dateKey && x.start && x.end), [combinedMine]);
  const availConflict = (s) => {
    if (s.busy_eval) return true; // server-detected overlap with an existing eval signup
    const dateKey = s.scheduled_date?.toString().split("T")[0];
    const start = s.start_time?.toString();
    const end = s.end_time?.toString();
    if (!dateKey || !start || !end) return false;
    return myOccupied.some(o => o.dateKey === dateKey && o.start < end && o.end > start);
  };

  // Batch signup: if the clicked session sits in a back-to-back block, offer the
  // whole run before signing up for just one.
  const [batchPrompt, setBatchPrompt] = useState(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const handleSignup = (id) => {
    const clicked = availSessions.find(s => s.schedule_id === id);
    const block = clicked ? contiguousBlock(clicked, availSessions) : [];
    if (block.length > 1) setBatchPrompt({ sessions: block, anchorId: id });
    else signupMutation.mutate(id);
  };
  const signupBlock = async (ids) => {
    setBatchBusy(true); setSignupError(null);
    try {
      let failed = null;
      for (const sid of ids) {
        const res = await fetch("/api/evaluator/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule_id: sid, action: "signup" }) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || d.error) { failed = d.message || d.error || "Some sessions in the block couldn't be added."; break; }
        markSignedUp("evaluation", sid);
      }
      queryClient.invalidateQueries({ queryKey: ["evaluator-sessions-mine"] });
      queryClient.invalidateQueries({ queryKey: ["evaluator-sessions-available"] });
      setBatchPrompt(null);
      if (failed) setSignupError(failed);
      else setSignupOk("You're signed up. Pick another below, or check \"My Sessions\" anytime.");
    } catch { setSignupError("Network error — please try again."); }
    finally { setBatchBusy(false); }
  };
  // Counts (and the My Sessions tab badge) reflect the COMBINED list — evaluation
  // + testing commitments — so they match what's rendered below. Using mineSessions
  // here under-counted a dual-role person's day by leaving out their testing.
  const upcoming = combinedMine.filter(s => new Date(s.scheduled_date?.toString().split("T")[0]) >= new Date(localToday()));
  const past = combinedMine.filter(s => new Date(s.scheduled_date?.toString().split("T")[0]) < new Date(localToday()));

  // Group My Sessions so unfinished work floats up: Today → Needs scoring → Upcoming → Done
  const _today = localToday();
  const grp = { today: [], needs: [], upcoming: [], done: [] };
  for (const s of mineSessions) {
    const d = s.scheduled_date?.toString().split("T")[0];
    const scored = parseInt(s.my_scored_athletes || 0) > 0;
    if (d === _today) grp.today.push(s);
    else if (d > _today) grp.upcoming.push(s);
    else (scored ? grp.done : grp.needs).push(s);
  }

  // Hold render until capabilities resolve (so a pure tester never flashes the
  // evaluator shell before the redirect above sends them to /tester/dashboard).
  if (!capsLoaded || (isTester && !isEvaluator)) {
    return <div data-theme={theme} className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2 flex justify-end items-center gap-3">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <InstallAppButton />
          <NotificationBell />
          <button onClick={async () => { try { await fetch("/api/auth/logout", { method: "POST" }); } catch {} window.location.href = "/account/signin"; }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1">
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-0 pt-1">
          <div className="pb-5">
            <div className="font-display text-xs font-bold tracking-[0.2em] uppercase text-accent mb-2">{isTester && isEvaluator ? "Evaluator + Tester" : "Evaluator"}</div>
            <div className="flex items-end gap-4 flex-wrap">
              <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">Dashboard</h1>
              <img src="/mark-gold.svg" style={{width:"48px",height:"44px",objectFit:"contain"}} />
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap text-sm text-gray-500 font-medium">
              <span><b className="text-ink">{upcoming.length}</b> upcoming session{upcoming.length !== 1 ? "s" : ""}</span>
              <span className="text-gray-300">·</span>
              <span><b className="text-ink">{past.length}</b> past</span>
              <span className="text-gray-300">·</span>
              <span><b className="text-ink">{combinedAvail.length}</b> open to sign up</span>
            </div>

            {/* ── Score Now widget ── */}
            {(() => {
              if (upcoming.length === 0) return null;
              const todayStr = localToday();
              const todaySessions = upcoming.filter(s => s.scheduled_date?.toString().split("T")[0] === todayStr);
              // If no sessions today, find the soonest upcoming date
              let featured = todaySessions;
              let isToday = true;
              if (featured.length === 0) {
                const soonestDate = upcoming.map(s => s.scheduled_date?.toString().split("T")[0]).filter(Boolean).sort()[0];
                featured = upcoming.filter(s => s.scheduled_date?.toString().split("T")[0] === soonestDate);
                isToday = false;
              }
              const shown = featured.slice(0, 2);
              return (
                <div className="mt-4 bg-white border border-[#0b5cd6]/25 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <ClipboardList size={15} className="text-[#0b5cd6]" />
                    <span className="font-display font-bold text-ink text-sm tracking-tight">Score Now</span>
                    {isToday && (
                      <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#e8f0fd] text-[#0b5cd6] uppercase tracking-wide">Today</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {shown.map(s => (
                      <a
                        key={s.signup_id}
                        href={`/evaluator/score/${s.schedule_id}`}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-[#e8f0fd] border border-gray-100 hover:border-[#0b5cd6]/30 transition-colors group"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm text-ink truncate">{s.org_name}</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-sm text-gray-600 truncate">{s.category_name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                            {!isToday && <span>{formatDate(s.scheduled_date)}</span>}
                            {s.start_time && <span>{formatTime(s.start_time)}{s.end_time ? ` — ${formatTime(s.end_time)}` : ""}</span>}
                            {s.location && <span className="truncate">{s.location}</span>}
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#0b5cd6] text-white rounded-lg text-xs font-bold flex-shrink-0 group-hover:bg-[#0a4fc0] transition-colors">
                          Score <span aria-hidden>→</span>
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {[
              { id: "mine", label: `My Sessions (${upcoming.length})` },
              { id: "available", label: `Available (${combinedAvail.length})` },
              { id: "availability", label: "Availability" },
              { id: "messages", label: "Messages" },
              { id: "pay", label: "Hours & Pay" },
              { id: "join", label: "Join Organization" },
            ].map(tab => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSignupOk(null); setSignupError(null); setJustSignedUp(new Map()); }}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id ? "border-[#0b5cd6] text-[#0b5cd6]" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4 sm:py-8">
        {/* Status banners */}
        {cancelWarning && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3">
            <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
            <div className="flex-1">
              <p className="text-sm text-amber-800">{cancelWarning}</p>
            </div>
            <button onClick={() => setCancelWarning(null)} className="text-amber-500 hover:text-amber-700 flex-shrink-0">
              <X size={14} />
            </button>
          </div>
        )}
        {statusData?.suspended && (
          <div className="mb-6 p-4 bg-red-50 border border-red-300 rounded-xl flex items-start gap-3">
            <span className="text-red-500 text-xl flex-shrink-0">🚫</span>
            <div>
              <p className="font-bold text-red-800">Your account has been suspended</p>
              <p className="text-sm text-red-600 mt-0.5">You have received two late cancellation strikes. You have been removed from all future sessions. Contact your service provider to be reinstated.</p>
            </div>
          </div>
        )}
        {!statusData?.suspended && statusData?.strike_count === 1 && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3">
            <span className="text-amber-500 text-xl flex-shrink-0">⚠️</span>
            <div>
              <p className="font-bold text-amber-800">Warning — Strike 1 on record</p>
              <p className="text-sm text-amber-600 mt-0.5">You have one late cancellation on record. A second cancellation with less than 24 hours notice will result in automatic suspension.</p>
            </div>
          </div>
        )}

        {activeTab === "mine" && (
          <div className="space-y-4">
            {mineLoading ? (
              <div className="py-12 text-center text-gray-400 text-sm">Loading your sessions...</div>
            ) : combinedMine.length === 0 ? (
              <div className="py-16 text-center">
                <Calendar size={48} className="mx-auto text-gray-200 mb-4" />
                <h3 className="font-semibold text-gray-700 mb-2">No sessions yet</h3>
                <p className="text-sm text-gray-400 mb-4">Sign up for available sessions or join an organization first.</p>
                <button onClick={() => setActiveTab("available")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0b5cd6] text-white rounded-lg text-sm font-semibold">
                  Browse Available Sessions
                </button>
              </div>
            ) : (
              <>
                {isTester && isEvaluator && (
                  <SessionTypeTabs value={mineFilter} onChange={setMineFilter} counts={mineCounts} />
                )}
                <ScheduleBoard
                  sessions={mineFiltered}
                  storageKey="eval-mine-view"
                  subscribeEndpoint="/api/evaluator/calendar-link"
                  renderRow={(s) => (
                    <SessionCard session={s} mode="mine" kind={isTester && isEvaluator ? s.__kind : undefined}
                      onCancel={() => {}}
                      onCancelWithReason={(id, reason) => s.__kind === "testing"
                        ? testerCancelMutation.mutate(id)
                        : cancelMutation.mutate({ schedule_id: id, reason })}
                      cancelPending={s.__kind === "testing" ? testerCancelMutation.isPending : cancelMutation.isPending}
                      onSignup={() => {}} />
                  )}
                />
              </>
            )}
          </div>
        )}

        {activeTab === "available" && (
          <>
            {signupError && (
              <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg">
                <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-amber-900 font-semibold">Couldn't sign up</p>
                  <p className="text-xs text-amber-800 mt-0.5">{signupError}</p>
                </div>
                <button
                  onClick={() => setSignupError(null)}
                  className="text-amber-600 hover:text-amber-900 flex-shrink-0"
                  aria-label="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {signupOk && (
              <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-green-50 border border-green-300 rounded-lg">
                <Check size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
                <p className="flex-1 min-w-0 text-sm text-green-800">{signupOk}</p>
                <button
                  onClick={() => setSignupOk(null)}
                  className="text-green-600 hover:text-green-900 flex-shrink-0"
                  aria-label="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {isTester && isEvaluator && (
              <SessionTypeTabs value={availTypeFilter} onChange={setAvailTypeFilter} counts={availCounts} />
            )}
            {availOrgs.length > 1 && (
              <div className="mb-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 font-medium">Association</span>
                <select
                  value={availOrgFilter}
                  onChange={e => setAvailOrgFilter(e.target.value)}
                  className={`text-xs font-medium px-3 py-1.5 border rounded-full focus:outline-none focus:ring-2 focus:ring-[#0b5cd6] cursor-pointer ${availOrgFilter !== "all" ? "border-[#0b5cd6] bg-[#0b5cd6]/5 text-[#0b5cd6]" : "border-gray-300 bg-white text-gray-700"}`}
                >
                  <option value="all">All associations</option>
                  {availOrgs.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {availOrgFilter !== "all" && (
                  <button onClick={() => setAvailOrgFilter("all")} className="text-xs text-gray-400 hover:text-gray-600 underline">Clear</button>
                )}
              </div>
            )}
            {availLoading ? (
              <div className="py-12 text-center text-gray-400 text-sm">Loading available sessions...</div>
            ) : (
              <ScheduleBoard
                sessions={availFiltered}
                storageKey="eval-avail-view"
                emptyText="No available sessions right now. Check back soon or edit your availability."
                renderRow={(s) => (
                  <SessionCard session={s} mode="available" kind={isTester && isEvaluator ? s.__kind : undefined}
                    onSignup={(id) => s.__kind === "testing" ? testerSignupMutation.mutate(id) : handleSignup(id)}
                    signedUp={isJustSignedUp(s)}
                    conflict={!isJustSignedUp(s) && availConflict(s)}
                    onCancel={() => {}} onCancelWithReason={() => {}} />
                )}
              />
            )}
          </>
        )}

        {activeTab === "availability" && (
          <div className="max-w-lg">
            <AvailabilitySection />
          </div>
        )}

        {activeTab === "messages" && (
          <div className="max-w-lg">
            <MessagesSection />
          </div>
        )}

        {activeTab === "pay" && (
          <div className="max-w-lg">
            <HoursAndPaySection />
          </div>
        )}

        {activeTab === "join" && (
          <div className="max-w-md mx-auto">
            <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0b5cd6] to-[#3b82f6] flex items-center justify-center mx-auto mb-3">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Join an Organization</h2>
                <p className="text-sm text-gray-500 mt-1">Enter the join code provided by your association or service provider</p>
              </div>
              <form onSubmit={handleJoinCode} className="space-y-4">
                <input type="text" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC123" required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-center text-2xl font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-[#0b5cd6] uppercase"
                  maxLength={10} />
                {joinMsg?.text && (
                  <p className={`text-sm text-center font-medium ${joinMsg.ok ? "text-green-600" : "text-red-600"}`}>
                    {joinMsg.text}
                  </p>
                )}
                <button type="submit" disabled={joiningOrg || !joinCode}
                  className="w-full py-3 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-xl font-semibold disabled:opacity-50">
                  {joiningOrg ? "Joining..." : "Join Organization"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <BatchSignupPrompt
        data={batchPrompt} busy={batchBusy} role="evaluator"
        onAll={() => signupBlock(batchPrompt.sessions.map(s => s.schedule_id))}
        onJustOne={() => { const id = batchPrompt.anchorId; setBatchPrompt(null); signupMutation.mutate(id); }}
        onClose={() => setBatchPrompt(null)}
      />
    </div>
  );
}

export default function EvaluatorDashboardPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>}>
        <EvaluatorDashboard />
      </Suspense>
    </QueryClientProvider>
  );
}
