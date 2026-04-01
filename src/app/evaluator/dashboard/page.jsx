"use client";

import { useState, Suspense } from "react";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Calendar, Clock, MapPin, Users, CheckCircle, Plus, Download, LogOut, ClipboardList, Mail, X, Check } from "lucide-react";

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
  return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//AthleteRanker//EN\nBEGIN:VEVENT\nDTSTART:${date}T${startTime}\nDTEND:${date}T${endTime}\nSUMMARY:Evaluation - ${session.org_name} ${session.category_name}\nLOCATION:${session.location || "TBD"}\nDESCRIPTION:Session ${session.session_number}${session.group_number ? ` Group ${session.group_number}` : ""}\nEND:VEVENT\nEND:VCALENDAR`;
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
        <div className="flex items-start justify-between gap-3 flex-wrap">
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
            <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
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

          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Evaluator Dashboard</h1>
              <p className="text-xs text-gray-400">Athlete Ranker</p>
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

      <div className="max-w-4xl mx-auto px-4 py-8">
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Open Sessions</h2>
              <span className="text-xs text-gray-400">Sessions where spots are still available</span>
            </div>
            {availLoading ? (
              <div className="py-12 text-center text-gray-400 text-sm">Loading available sessions...</div>
            ) : availSessions.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle size={48} className="mx-auto text-gray-200 mb-4" />
                <h3 className="font-semibold text-gray-700 mb-2">All sessions are full</h3>
                <p className="text-sm text-gray-400">Check back later for new openings.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {availSessions.map(s => (
                  <SessionCard key={s.schedule_id} session={s} mode="available"
                    onSignup={id => signupMutation.mutate(id)} onCancel={() => {}} />
                ))}
              </div>
            )}
          </div>
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
