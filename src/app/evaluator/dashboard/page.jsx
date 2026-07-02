"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Calendar, Clock, MapPin, Users, CheckCircle, Plus, Download, LogOut, ClipboardList, Mail, X, Check, ChevronDown, ChevronRight, Copy, AlertCircle, AlertTriangle, Send } from "lucide-react";
import { colorForOrg, buildOrgColorMap, abbrevOrgName, OrgChip } from "@/lib/orgVisuals";
import { DateStripBar, MonthCalendar } from "@/components/SessionDateNav";
import { useTrackPageView } from "@/lib/useAnalytics";
import NotificationBell from "@/components/NotificationBell";
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

function SessionCard({ session, onSignup, onCancel, onCancelWithReason, cancelPending, mode }) {
  const spotsLeft = parseInt(session.evaluators_required) - parseInt(session.evaluators_signed_up || 0);
  const spotsAfterMe = parseInt(session.evaluators_required) - parseInt(session.evaluators_signed_up || 1);
  const isUpcoming = new Date(session.scheduled_date?.toString().split("T")[0]) >= new Date(new Date().toISOString().split("T")[0]);
  const [showInvite, setShowInvite] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Status badge (My Sessions only): TODAY / Needs scoring / Scored / Upcoming
  const dateStr = session.scheduled_date?.toString().split("T")[0];
  const todayStr = new Date().toISOString().split("T")[0];
  const scored = parseInt(session.my_scored_athletes || 0) > 0;
  const isToday = dateStr === todayStr;
  const isPast = dateStr < todayStr;
  const badge = mode !== "mine" ? null
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
        mode === "mine" ? "border-[#0b5cd6]/30 bg-orange-50/20" : "border-gray-200"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
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
                    ? `${spotsAfterMe} more evaluator${spotsAfterMe !== 1 ? "s" : ""} needed`
                    : "Session fully staffed ✓"
                  : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left of ${session.evaluators_required}`
                }
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap mt-3 sm:mt-0">
            {mode === "mine" ? (
              <>
                <a href={`/evaluator/score/${session.schedule_id}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow">
                  <ClipboardList size={14} /> Score
                </a>
                {spotsAfterMe > 0 && (
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

// ── Available Sessions: grouped by Date → Arena, with filters ────────────
// Replaces the old flat chronological list. Evaluators think about their
// schedule by "what rink am I at on what day" so they can chain sessions.

function FilterChip({ value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-xs font-medium px-3 py-1.5 border border-gray-300 rounded-full bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0b5cd6] cursor-pointer"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

function AvailableSessionRow({ session, onSignup, palette, conflict }) {
  const spotsLeft = parseInt(session.evaluators_required) - parseInt(session.evaluators_signed_up || 0);
  const orgAbbrev = abbrevOrgName(session.org_name);
  return (
    <div
      className={`grid items-center gap-x-2 gap-y-0.5 py-2 pl-3 pr-2 -mx-1 rounded-md transition-colors ${conflict ? "bg-amber-50/50" : "hover:bg-gray-50"}`}
      style={{
        borderLeft: `4px solid ${palette.hex}`,
        // Two-row layout on narrow screens; single-row on wider.
        // Col 1: org chip. Col 2: stacked text. Col 3: action.
        gridTemplateColumns: "auto 1fr auto",
      }}
    >
      {/* Org chip — fixed width by content, color-coded so even tiny screens identify the association */}
      <span
        className="inline-flex items-center justify-center text-[11px] font-bold tracking-wide rounded px-2 py-1 row-span-2 self-stretch flex-shrink-0"
        style={{ background: palette.bg, color: palette.fg, minWidth: "44px" }}
        title={session.org_name}
      >
        {orgAbbrev}
      </span>

      {/* Top text row: Age category + Session/Group */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-semibold text-gray-900 text-sm truncate">
          {session.category_name}
        </span>
        <span className="text-gray-300 flex-shrink-0">·</span>
        <span className="text-gray-500 text-xs font-mono whitespace-nowrap flex-shrink-0">
          S{session.session_number}G{session.group_number}
        </span>
      </div>

      {/* Sign Up button — replaced with a disabled Conflict button when this
          session overlaps one of the user's existing signups */}
      {conflict ? (
        <button
          disabled
          className="row-span-2 self-center px-3 py-2 bg-amber-100 text-amber-800 rounded-md text-xs font-semibold flex items-center gap-1 flex-shrink-0 cursor-not-allowed border border-amber-300"
          title={`Overlaps with ${conflict.label} (${conflict.start?.slice(0, 5)}-${conflict.end?.slice(0, 5)})`}
          aria-label="Time conflict — already signed up for an overlapping session"
        >
          <AlertTriangle size={13} />
          <span>Conflict</span>
        </button>
      ) : (
        <button
          onClick={() => onSignup(session.schedule_id)}
          className="row-span-2 self-center px-3 py-3 sm:py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-md text-xs font-semibold flex items-center gap-1 flex-shrink-0 hover:shadow-md transition-shadow min-w-[72px] justify-center"
          aria-label="Sign up for this session"
        >
          <Plus size={13} />
          <span>Sign Up</span>
        </button>
      )}

      {/* Bottom text row: Time + spots remaining (or conflict source) */}
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="font-mono font-semibold text-gray-700 tabular-nums whitespace-nowrap">
          {formatTimeRange(session.start_time, session.end_time)}
        </span>
        {conflict ? (
          <span className="text-amber-700 font-medium whitespace-nowrap">
            · Overlaps {conflict.label}
          </span>
        ) : (
          <span className="text-amber-600 font-semibold whitespace-nowrap">
            · {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left
          </span>
        )}
      </div>
    </div>
  );
}


function AvailableSessionsView({ sessions, mySessions = [], onSignup, isLoading }) {
  const [dateRange, setDateRange] = useState("all");
  const [orgFilter, setOrgFilter] = useState("all");
  const [arenaFilter, setArenaFilter] = useState("all");
  const [collapsedDays, setCollapsedDays] = useState(new Set());
  const [selectedDate, setSelectedDate] = useState(null); // YYYY-MM-DD or null

  // Pre-flatten the user's existing signups into (date, start, end, label)
  // shape so the row component can do an O(N) overlap check per render.
  const myOccupied = useMemo(() => {
    return (mySessions || [])
      .filter(s => !s.signup_status || s.signup_status === "signed_up")
      .map(s => ({
        dateKey: s.scheduled_date?.toString().split("T")[0],
        start: s.start_time?.toString(),
        end: s.end_time?.toString(),
        label: `${s.org_name} ${s.category_name} S${s.session_number}G${s.group_number}`,
      }))
      .filter(x => x.dateKey && x.start && x.end);
  }, [mySessions]);

  const findConflict = (session) => {
    const dateKey = session.scheduled_date?.toString().split("T")[0];
    const start = session.start_time?.toString();
    const end = session.end_time?.toString();
    if (!dateKey || !start || !end) return null;
    return myOccupied.find(o =>
      o.dateKey === dateKey && o.start < end && o.end > start
    ) || null;
  };

  const orgs = useMemo(() => {
    const set = new Set();
    sessions.forEach(s => s.org_name && set.add(s.org_name));
    return Array.from(set).sort();
  }, [sessions]);

  // Each org in the current view gets a guaranteed-distinct palette entry
  // (alphabetical position -> palette index). No more accidental collisions
  // from hash collisions on similar-sounding names.
  const orgColorMap = useMemo(() => buildOrgColorMap(orgs), [orgs]);
  const paletteFor = (name) => orgColorMap.get(name) || colorForOrg(name);

  const arenas = useMemo(() => {
    const set = new Set();
    sessions.forEach(s => s.location && set.add(s.location));
    return Array.from(set).sort();
  }, [sessions]);

  const filtered = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in7days = new Date(today); in7days.setDate(today.getDate() + 7);

    // Next upcoming Saturday + Sunday (today counts if it IS Sat/Sun)
    const dow = today.getDay(); // 0=Sun..6=Sat
    const nextSat = new Date(today);
    if (dow !== 6) nextSat.setDate(today.getDate() + ((6 - dow + 7) % 7));
    const nextSun = new Date(nextSat);
    nextSun.setDate(nextSat.getDate() + 1);
    if (dow === 0) { nextSat.setDate(today.getDate() - 1); nextSun.setDate(today.getDate()); }

    return sessions.filter(s => {
      const dateStr = s.scheduled_date?.toString().split("T")[0];
      // Specific-date pick from the strip / calendar overrides the range filter.
      if (selectedDate) {
        if (dateStr !== selectedDate) return false;
      } else if (dateRange !== "all") {
        if (!dateStr) return false;
        const [y, m, d] = dateStr.split("-").map(Number);
        const sessDate = new Date(y, m - 1, d);
        if (dateRange === "week") {
          if (sessDate < today || sessDate > in7days) return false;
        } else if (dateRange === "weekend") {
          const isSat = sessDate.getTime() === nextSat.getTime();
          const isSun = sessDate.getTime() === nextSun.getTime();
          if (!isSat && !isSun) return false;
        }
      }
      if (orgFilter !== "all" && s.org_name !== orgFilter) return false;
      if (arenaFilter !== "all" && s.location !== arenaFilter) return false;
      return true;
    });
  }, [sessions, dateRange, orgFilter, arenaFilter, selectedDate]);

  // Group: date → arena → sessions[] (sorted by start_time)
  const grouped = useMemo(() => {
    const byDate = {};
    filtered.forEach(s => {
      const dateKey = s.scheduled_date?.toString().split("T")[0];
      if (!dateKey) return;
      if (!byDate[dateKey]) byDate[dateKey] = {};
      const arenaKey = s.location || "TBD";
      if (!byDate[dateKey][arenaKey]) byDate[dateKey][arenaKey] = [];
      byDate[dateKey][arenaKey].push(s);
    });
    Object.values(byDate).forEach(arenas => {
      Object.values(arenas).forEach(list => {
        list.sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
      });
    });
    return byDate;
  }, [filtered]);

  const sortedDates = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  const toggleDay = (date) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  if (isLoading) {
    return <div className="py-12 text-center text-gray-400 text-sm">Loading available sessions...</div>;
  }
  if (sessions.length === 0) {
    return (
      <div className="py-16 text-center">
        <CheckCircle size={48} className="mx-auto text-gray-200 mb-4" />
        <h3 className="font-semibold text-gray-700 mb-2">All sessions are full</h3>
        <p className="text-sm text-gray-400">Check back later for new openings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-semibold text-gray-900">Open Sessions</h2>
        <span className="text-xs text-gray-400">
          {filtered.length} of {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Selected-date chip — appears when user picks a specific date from strip / calendar */}
      {selectedDate && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <Calendar size={14} className="text-blue-600" />
          <span className="text-sm text-blue-900">
            Showing only <strong>{(() => {
              const [y, m, d] = selectedDate.split("-").map(Number);
              return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
            })()}</strong>
          </span>
          <button
            onClick={() => setSelectedDate(null)}
            className="ml-auto text-blue-600 hover:text-blue-900"
            aria-label="Clear date filter"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Date strip — always visible; lets user jump to a day quickly */}
      <DateStripBar
        sessions={sessions}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        paletteFor={paletteFor}
      />

      {/* Full month grid — optional, collapsed by default; never hides the list */}
      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-medium text-gray-600 px-1 py-1">📅 View full month</summary>
        <div className="mt-2">
          <MonthCalendar
            sessions={sessions}
            paletteFor={paletteFor}
            onSelect={(dateKey) => setSelectedDate(dateKey)}
          />
        </div>
      </details>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        <FilterChip
          value={dateRange}
          onChange={setDateRange}
          options={[
            { value: "all", label: "All upcoming" },
            { value: "week", label: "Next 7 days" },
            { value: "weekend", label: "This weekend" },
          ]}
        />
        {orgs.length > 1 && (
          <FilterChip
            value={orgFilter}
            onChange={setOrgFilter}
            options={[
              { value: "all", label: "All associations" },
              ...orgs.map(o => ({ value: o, label: o })),
            ]}
          />
        )}
        {arenas.length > 1 && (
          <FilterChip
            value={arenaFilter}
            onChange={setArenaFilter}
            options={[
              { value: "all", label: "All arenas" },
              ...arenas.map(a => ({ value: a, label: a })),
            ]}
          />
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          No sessions match these filters. Try widening them.
        </div>
      ) : (
        <div className="space-y-3">
          {sortedDates.map(date => {
            const arenasForDate = grouped[date];
            const arenaKeys = Object.keys(arenasForDate).sort();
            const isCollapsed = collapsedDays.has(date);
            const dayTotal = arenaKeys.reduce((sum, k) => sum + arenasForDate[k].length, 0);
            return (
              <div key={date} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleDay(date)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed
                      ? <ChevronRight size={16} className="text-gray-400" />
                      : <ChevronDown size={16} className="text-gray-400" />}
                    <Calendar size={14} className="text-gray-400" />
                    <span className="font-bold text-gray-900">{formatDate(date)}</span>
                    <span className="text-xs text-gray-400 font-normal">
                      {dayTotal} session{dayTotal !== 1 ? "s" : ""} · {arenaKeys.length} {arenaKeys.length === 1 ? "rink" : "rinks"}
                    </span>
                  </div>
                </button>
                {!isCollapsed && (
                  <div className="divide-y divide-gray-100">
                    {arenaKeys.map(arena => {
                      const sess = arenasForDate[arena];
                      // Distinct orgs at this arena/day, in name order — shown
                      // as colored dots so an evaluator can tell at a glance
                      // whether this rink today is single-org or mixed.
                      const orgsAtArena = Array.from(new Set(sess.map(s => s.org_name).filter(Boolean))).sort();
                      return (
                        <div key={arena} className="px-4 py-3">
                          <div className="flex items-center gap-1.5 mb-2 text-sm font-semibold text-gray-700 flex-wrap">
                            <MapPin size={13} className="text-gray-400" />
                            {arena}
                            <span className="text-xs text-gray-400 font-normal">
                              · {sess.length} session{sess.length !== 1 ? "s" : ""}
                            </span>
                            {orgsAtArena.length > 0 && (
                              <span className="flex items-center gap-1.5 ml-auto flex-wrap justify-end">
                                {orgsAtArena.map(o => {
                                  const p = paletteFor(o);
                                  return (
                                    <span
                                      key={o}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wide rounded px-1.5 py-0.5"
                                      style={{ background: p.bg, color: p.fg }}
                                      title={o}
                                    >
                                      {abbrevOrgName(o)}
                                    </span>
                                  );
                                })}
                              </span>
                            )}
                          </div>
                          <div className="space-y-0.5">
                            {sess.map(s => (
                              <AvailableSessionRow
                                key={s.schedule_id}
                                session={s}
                                onSignup={onSignup}
                                palette={paletteFor(s.org_name)}
                                conflict={findConflict(s)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
    await fetch(`/api/evaluator/availability?id=${id}`, { method: "DELETE" });
    refetch();
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
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_read: id }),
      });
      refetch();
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

// Capability switch shown only when a person is BOTH a tester and an evaluator.
function CapabilityBar({ active, onEvaluations, onTesting }) {
  return (
    <div className="inline-flex rounded-xl bg-gray-100 p-1 mb-4">
      <button onClick={onEvaluations} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${active === "evaluations" ? "bg-white text-ink shadow-sm" : "text-gray-500"}`}>Evaluations</button>
      <button onClick={onTesting} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${active === "testing" ? "bg-white text-ink shadow-sm" : "text-gray-500"}`}>Testing</button>
    </div>
  );
}

function TesterTestingCard({ s, mode, onAction, busy }) {
  const open = Math.max(0, parseInt(s.testers_required || 0) - parseInt(s.testers_signed_up || 0));
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-ink truncate">{s.org_name}</span>
          <span className="text-gray-300">·</span>
          <span className="text-sm text-gray-600 truncate">{s.category_name}</span>
          <span className="text-[11px] px-2 py-0.5 bg-accent-soft text-accent rounded-full font-semibold uppercase tracking-wide">Testing</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mt-1 flex-wrap">
          <span>{formatDate(s.scheduled_date)}</span>
          {s.start_time && <span>{formatTime(s.start_time)}{s.end_time ? ` — ${formatTime(s.end_time)}` : ""}</span>}
          {s.location && <span className="truncate">{s.location}</span>}
          <span className="font-mono">S{s.session_number}{s.group_number ? ` G${s.group_number}` : ""}</span>
        </div>
      </div>
      {mode === "available"
        ? <button disabled={busy} onClick={() => onAction("signup", s.schedule_id)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 whitespace-nowrap">Sign up{open ? ` · ${open} left` : ""}</button>
        : <button disabled={busy} onClick={() => onAction("cancel", s.schedule_id)} className="px-4 py-2 border border-red-200 text-red-500 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 whitespace-nowrap">Cancel</button>}
    </div>
  );
}

// The tester-side dashboard. A pure tester lands here; a dual-capability person can
// switch to it from the evaluator dashboard. Only testing sessions — never any
// evaluation data.
function TesterDashboardView({ data, theme, toggleTheme, showSwitch, onSwitch, queryClient }) {
  const [busy, setBusy] = useState(false);
  const available = data?.available || [];
  const mine = data?.mine || [];
  const act = async (action, schedule_id) => {
    setBusy(true);
    await fetch("/api/tester/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, schedule_id }) });
    setBusy(false);
    queryClient.invalidateQueries(["my-capabilities"]);
  };
  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; };
  return (
    <div data-theme={theme} className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex items-center justify-between py-3">
          <div className="flex items-center gap-2"><img src="/s-mark-dark.svg" style={{ width: 28, height: 28, objectFit: "contain" }} /><span className="font-display italic font-black text-accent text-sm uppercase tracking-[0.14em]">Sideline Star</span></div>
          <div className="flex items-center gap-2"><ThemeToggle theme={theme} onToggle={toggleTheme} /><button onClick={signOut} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1"><LogOut size={14} /> Sign out</button></div>
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-1 pb-5">
          <div className="font-display text-xs font-bold tracking-[0.2em] uppercase text-accent mb-2">Tester</div>
          <div className="flex items-end gap-4 flex-wrap"><h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">Testing</h1></div>
          <p className="text-sm text-gray-500 mt-3">Sign up for the testing sessions your service provider is running.</p>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {showSwitch && <CapabilityBar active="testing" onEvaluations={onSwitch} onTesting={() => {}} />}
        <h2 className="text-sm font-semibold text-gray-900 mb-2">My testing sessions ({mine.length})</h2>
        {mine.length === 0 ? <p className="text-sm text-gray-400 mb-8">You're not signed up for any testing sessions yet.</p> : <div className="space-y-2 mb-8">{mine.map(s => <TesterTestingCard key={s.schedule_id} s={s} mode="mine" onAction={act} busy={busy} />)}</div>}
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Available testing sessions ({available.length})</h2>
        {available.length === 0 ? <p className="text-sm text-gray-400">No open testing sessions right now.</p> : <div className="space-y-2">{available.map(s => <TesterTestingCard key={s.schedule_id} s={s} mode="available" onAction={act} busy={busy} />)}</div>}
      </div>
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
  const [capView, setCapView] = useState(null); // 'evaluations' | 'testing'
  useEffect(() => { if (capsLoaded && capView === null) setCapView(capData.isEvaluator ? "evaluations" : "testing"); }, [capsLoaded, capView, capData]);

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
    onSuccess: (data) => {
      // Server returned an error (409 conflict, 400 no spots, etc) — surface
      // it as a banner instead of treating it as a successful signup.
      if (!data.ok || data.error) {
        setSignupError(data.message || data.error || "Couldn't sign up.");
        return;
      }
      setSignupError(null);
      queryClient.invalidateQueries(["evaluator-sessions-mine"]);
      queryClient.invalidateQueries(["evaluator-sessions-available"]);
      if (data.ical) {
        const blob = new Blob([data.ical], { type: "text/calendar" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "session.ics";
        a.click();
      }
      setActiveTab("mine");
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
      queryClient.invalidateQueries(["evaluator-sessions-mine"]);
      queryClient.invalidateQueries(["evaluator-sessions-available"]);
    },
  });

  const handleJoinCode = async (e) => {
    e.preventDefault();
    setJoiningOrg(true);
    setJoinMsg("");
    const res = await fetch("/api/evaluator/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: joinCode }),
    });
    const data = await res.json();
    setJoinMsg(data.message || data.error);
    setJoiningOrg(false);
    if (data.success) {
      setJoinCode("");
      queryClient.invalidateQueries();
    }
  };

  const mineSessions = mineData?.sessions || [];
  const availSessions = availData?.sessions || [];
  const upcoming = mineSessions.filter(s => new Date(s.scheduled_date?.toString().split("T")[0]) >= new Date(new Date().toISOString().split("T")[0]));
  const past = mineSessions.filter(s => new Date(s.scheduled_date?.toString().split("T")[0]) < new Date(new Date().toISOString().split("T")[0]));

  // Group My Sessions so unfinished work floats up: Today → Needs scoring → Upcoming → Done
  const _today = new Date().toISOString().split("T")[0];
  const grp = { today: [], needs: [], upcoming: [], done: [] };
  for (const s of mineSessions) {
    const d = s.scheduled_date?.toString().split("T")[0];
    const scored = parseInt(s.my_scored_athletes || 0) > 0;
    if (d === _today) grp.today.push(s);
    else if (d > _today) grp.upcoming.push(s);
    else (scored ? grp.done : grp.needs).push(s);
  }

  // Hold render until capabilities resolve, so a pure tester never flashes the
  // evaluator shell, then route to the tester view when Testing is active.
  if (!capsLoaded || capView === null) {
    return <div data-theme={theme} className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>;
  }
  if (capView === "testing") {
    return <TesterDashboardView data={capData} theme={theme} toggleTheme={toggleTheme} showSwitch={isEvaluator} onSwitch={() => setCapView("evaluations")} queryClient={queryClient} />;
  }

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2 flex justify-end items-center gap-3">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <NotificationBell />
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1">
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-0 pt-1">
          <div className="pb-5">
            <div className="font-display text-xs font-bold tracking-[0.2em] uppercase text-accent mb-2">Evaluator</div>
            {isTester && isEvaluator && <CapabilityBar active="evaluations" onEvaluations={() => {}} onTesting={() => setCapView("testing")} />}
            <div className="flex items-end gap-4 flex-wrap">
              <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">Dashboard</h1>
              <img src="/s-mark-dark.svg" style={{width:"44px",height:"44px",objectFit:"contain"}} />
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap text-sm text-gray-500 font-medium">
              <span><b className="text-ink">{upcoming.length}</b> upcoming session{upcoming.length !== 1 ? "s" : ""}</span>
              <span className="text-gray-300">·</span>
              <span><b className="text-ink">{past.length}</b> past</span>
              <span className="text-gray-300">·</span>
              <span><b className="text-ink">{availSessions.length}</b> open to sign up</span>
            </div>

            {/* ── Score Now widget ── */}
            {(() => {
              if (upcoming.length === 0) return null;
              const todayStr = new Date().toISOString().split("T")[0];
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
              { id: "available", label: `Available (${availSessions.length})` },
              { id: "availability", label: "Availability" },
              { id: "messages", label: "Messages" },
              { id: "pay", label: "Hours & Pay" },
              { id: "join", label: "Join Organization" },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
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
            ) : upcoming.length === 0 && past.length === 0 ? (
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
                {[
                  { key: "today", label: "Today", list: grp.today, cls: "text-accent" },
                  { key: "needs", label: "Needs scoring", list: grp.needs, cls: "text-amber-600" },
                  { key: "upcoming", label: "Upcoming", list: grp.upcoming, cls: "text-gray-500" },
                  { key: "done", label: "Completed", list: grp.done, cls: "text-gray-400", dim: true },
                ].filter(g => g.list.length > 0).map(g => (
                  <div key={g.key}>
                    <h2 className={`text-sm font-semibold uppercase tracking-wide mb-3 mt-2 ${g.cls}`}>
                      {g.label} ({g.list.length})
                    </h2>
                    <div className={`space-y-3 ${g.dim ? "opacity-70" : ""}`}>
                      {g.list.map(s => (
                        <SessionCard key={s.signup_id} session={s} mode="mine"
                          onCancel={() => {}}
                          onCancelWithReason={(id, reason) => cancelMutation.mutate({ schedule_id: id, reason })}
                          cancelPending={cancelMutation.isPending}
                          onSignup={() => {}} />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
            <CalendarSubscribePanel />
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
            <AvailableSessionsView
              sessions={availSessions}
              mySessions={mineSessions}
              isLoading={availLoading}
              onSignup={id => signupMutation.mutate(id)}
            />
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
                {joinMsg && (
                  <p className={`text-sm text-center font-medium ${joinMsg.includes("Joined") ? "text-green-600" : "text-red-600"}`}>
                    {joinMsg}
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
