"use client";

import { useState, useMemo, Suspense } from "react";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Calendar, Clock, MapPin, Users, CheckCircle, Plus, Download, LogOut, ClipboardList, Mail, X, Check, ChevronDown, ChevronRight } from "lucide-react";

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
                <button onClick={onClose} className="mt-4 px-5 py-2 bg-[#1A6BFF] text-white rounded-lg text-sm font-medium">Done</button>
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
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]"
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={sending}
                className="flex-1 py-2.5 bg-[#1A6BFF] text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
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

function SessionCard({ session, onSignup, onCancel, mode }) {
  const spotsLeft = parseInt(session.evaluators_required) - parseInt(session.evaluators_signed_up || 0);
  const spotsAfterMe = parseInt(session.evaluators_required) - parseInt(session.evaluators_signed_up || 1);
  const isUpcoming = new Date(session.scheduled_date?.toString().split("T")[0]) >= new Date(new Date().toISOString().split("T")[0]);
  const [showInvite, setShowInvite] = useState(false);

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
        mode === "mine" ? "border-[#1A6BFF]/30 bg-orange-50/20" : "border-gray-200"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="font-bold text-gray-900">{session.org_name}</span>
              <span className="text-gray-300">·</span>
              <span className="font-medium text-gray-700">{session.category_name}</span>
              {session.session_type && (
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${SESSION_TYPE_COLORS[session.session_type] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                  {session.session_type}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-1 text-sm text-gray-500 mt-1">
              <span className="flex items-center gap-1.5"><Calendar size={13} />{formatDate(session.scheduled_date)}</span>
              {session.start_time && (
                <span className="flex items-center gap-1.5"><Clock size={13} />{formatTime(session.start_time)}{session.end_time ? ` – ${formatTime(session.end_time)}` : ""}</span>
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
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow">
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
                  <button onClick={() => onCancel(session.schedule_id)}
                    className="px-3 py-2 border border-red-200 text-red-500 rounded-lg text-xs hover:bg-red-50 transition-colors">
                    Cancel
                  </button>
                )}
              </>
            ) : (
              <button onClick={() => onSignup(session.schedule_id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow">
                <Plus size={14} /> Sign Up
              </button>
            )}
          </div>
        </div>
      </div>

      {showInvite && (
        <InviteModal session={session} onClose={() => setShowInvite(false)} />
      )}
    </>
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
      className="text-xs font-medium px-3 py-1.5 border border-gray-300 rounded-full bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A6BFF] cursor-pointer"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

function AvailableSessionRow({ session, onSignup }) {
  const spotsLeft = parseInt(session.evaluators_required) - parseInt(session.evaluators_signed_up || 0);
  return (
    <div className="flex items-center gap-3 py-2 hover:bg-blue-50/30 -mx-2 px-2 rounded-lg transition-colors">
      <div className="text-xs font-mono font-semibold text-gray-700 w-[88px] flex-shrink-0">
        {formatTime(session.start_time)}{session.end_time ? `–${formatTime(session.end_time)}` : ""}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-800 truncate">
          <span className="font-semibold">{session.org_name}</span>
          <span className="text-gray-300 mx-1">·</span>
          <span>{session.category_name}</span>
          {session.session_type && (
            <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${SESSION_TYPE_COLORS[session.session_type] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
              {session.session_type}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-400">
          S{session.session_number}{session.group_number ? ` G${session.group_number}` : ""} · {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left
        </div>
      </div>
      <button
        onClick={() => onSignup(session.schedule_id)}
        className="px-3 py-1.5 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-xs font-semibold flex items-center gap-1 flex-shrink-0 hover:shadow-md transition-shadow"
      >
        <Plus size={12} /> Sign Up
      </button>
    </div>
  );
}

function AvailableSessionsView({ sessions, onSignup, isLoading }) {
  const [dateRange, setDateRange] = useState("all");
  const [orgFilter, setOrgFilter] = useState("all");
  const [arenaFilter, setArenaFilter] = useState("all");
  const [collapsedDays, setCollapsedDays] = useState(new Set());

  const orgs = useMemo(() => {
    const set = new Set();
    sessions.forEach(s => s.org_name && set.add(s.org_name));
    return Array.from(set).sort();
  }, [sessions]);

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
      if (dateRange !== "all") {
        const dateStr = s.scheduled_date?.toString().split("T")[0];
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
  }, [sessions, dateRange, orgFilter, arenaFilter]);

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
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Open Sessions</h2>
        <span className="text-xs text-gray-400">
          {filtered.length} of {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </span>
      </div>

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
                      return (
                        <div key={arena} className="px-4 py-3">
                          <div className="flex items-center gap-1.5 mb-2 text-sm font-semibold text-gray-700">
                            <MapPin size={13} className="text-gray-400" />
                            {arena}
                            <span className="text-xs text-gray-400 font-normal">
                              · {sess.length} session{sess.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {sess.map(s => (
                              <AvailableSessionRow key={s.schedule_id} session={s} onSignup={onSignup} />
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

function EvaluatorDashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("mine");
  const [joinCode, setJoinCode] = useState("");
  const [joinMsg, setJoinMsg] = useState("");
  const [joiningOrg, setJoiningOrg] = useState(false);

  const { data: statusData } = useQuery({
    queryKey: ["evaluator-status"],
    queryFn: async () => {
      const res = await fetch("/api/evaluator/status");
      return res.json();
    },
  });

  const { data: mineData, isLoading: mineLoading } = useQuery({
    queryKey: ["evaluator-sessions-mine"],
    queryFn: async () => {
      const res = await fetch("/api/evaluator/sessions?view=mine");
      return res.json();
    },
  });

  const { data: availData, isLoading: availLoading } = useQuery({
    queryKey: ["evaluator-sessions-available"],
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
      return res.json();
    },
    onSuccess: (data) => {
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

  const cancelMutation = useMutation({
    mutationFn: async (schedule_id) => {
      const res = await fetch("/api/evaluator/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule_id, action: "cancel" }),
      });
      return res.json();
    },
    onSuccess: () => {
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/s-mark-dark.svg" style={{width:"40px",height:"40px",objectFit:"contain"}} />
            <div>
              <h1 className="text-lg font-bold text-gray-900">Evaluator Dashboard</h1>
              <p className="text-xs text-gray-400">Sideline Star</p>
            </div>
          </div>
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <LogOut size={15} /> Sign out
          </button>
        </div>
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex gap-1">
            {[
              { id: "mine", label: `My Sessions (${upcoming.length})` },
              { id: "available", label: `Available (${availSessions.length})` },
              { id: "join", label: "Join Organization" },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id ? "border-[#1A6BFF] text-[#1A6BFF]" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4 sm:py-8">
        {/* Status banners */}
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1A6BFF] text-white rounded-lg text-sm font-semibold">
                  Browse Available Sessions
                </button>
              </div>
            ) : (
              <>
                {upcoming.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Upcoming</h2>
                    <div className="space-y-3">
                      {upcoming.map(s => (
                        <SessionCard key={s.signup_id} session={s} mode="mine"
                          onCancel={id => cancelMutation.mutate(id)} onSignup={() => {}} />
                      ))}
                    </div>
                  </div>
                )}
                {past.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 mt-6">Past</h2>
                    <div className="space-y-3 opacity-60">
                      {past.map(s => (
                        <SessionCard key={s.signup_id} session={s} mode="mine"
                          onCancel={() => {}} onSignup={() => {}} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "available" && (
          <AvailableSessionsView
            sessions={availSessions}
            isLoading={availLoading}
            onSignup={id => signupMutation.mutate(id)}
          />
        )}

        {activeTab === "join" && (
          <div className="max-w-md mx-auto">
            <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-center mx-auto mb-3">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Join an Organization</h2>
                <p className="text-sm text-gray-500 mt-1">Enter the join code provided by your association or service provider</p>
              </div>
              <form onSubmit={handleJoinCode} className="space-y-4">
                <input type="text" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC123" required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-center text-2xl font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1A6BFF] uppercase"
                  maxLength={10} />
                {joinMsg && (
                  <p className={`text-sm text-center font-medium ${joinMsg.includes("Joined") ? "text-green-600" : "text-red-600"}`}>
                    {joinMsg}
                  </p>
                )}
                <button type="submit" disabled={joiningOrg || !joinCode}
                  className="w-full py-3 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-xl font-semibold disabled:opacity-50">
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
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" /></div>}>
        <EvaluatorDashboard />
      </Suspense>
    </QueryClientProvider>
  );
}
