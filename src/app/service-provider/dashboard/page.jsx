"use client";

import { useState, Suspense } from "react";
import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Building2, Calendar, Users, ChevronRight, Zap, LogOut,
  Clock, MapPin, CheckCircle, AlertCircle, BarChart3, ExternalLink, X, Plus
} from "lucide-react";

const qc = new QueryClient();

const SESSION_TYPE_COLORS = {
  testing: "bg-blue-100 text-blue-700",
  skills: "bg-purple-100 text-purple-700",
  scrimmage: "bg-green-100 text-green-700",
};

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.toString().split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

function formatDate(d) {
  if (!d) return "";
  // Parse date string directly to avoid timezone offset issues
  const str = d.toString().split("T")[0];
  const [year, month, day] = str.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}



function JoinCodesPanel({ orgId, data, refetch }) {
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(null);

  const codes = data?.codes || [];
  const activeCodes = codes.filter(c => c.uses < c.max_uses);

  const generateCode = async () => {
    setGenerating(true);
    await fetch(`/api/organizations/${orgId}/join-codes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", max_uses: 100 }),
    });
    await refetch();
    setGenerating(false);
  };

  const copySignupLink = (code) => {
    const url = `${window.location.origin}/evaluator/signup?code=${code}`;
    navigator.clipboard.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Evaluator Join Codes</h3>
          <p className="text-xs text-gray-400 mt-0.5">Share with evaluators so they can join and access all your sessions</p>
        </div>
        <button onClick={generateCode} disabled={generating}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#FF6B35] to-[#F7931E] text-white rounded-lg text-sm font-semibold disabled:opacity-50">
          {generating ? "Generating..." : "+ Generate Code"}
        </button>
      </div>
      {activeCodes.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">
          No active codes. Generate one to start recruiting evaluators.
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {activeCodes.map(code => (
            <div key={code.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg font-bold text-gray-900 tracking-widest bg-gray-50 px-3 py-1 rounded-lg border border-gray-200">
                  {code.code}
                </span>
                <div className="text-xs text-gray-400">{code.uses} / {code.max_uses} uses</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copySignupLink(code.code)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                    copied === code.code
                      ? "bg-green-100 text-green-700 border-green-200"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {copied === code.code ? "✓ Copied!" : "Copy Signup Link"}
                </button>
                <button
                  onClick={async () => {
                    if (confirm("Deactivate this code? Evaluators with this code won't be able to sign up.")) {
                      await fetch(`/api/organizations/${orgId}/join-codes`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "deactivate", code_id: code.id }),
                      });
                      refetch();
                    }
                  }}
                  className="text-xs px-3 py-1.5 border border-red-100 text-red-400 rounded-lg hover:bg-red-50"
                >
                  Deactivate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlastButton({ scheduleId, spotsOpen }) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState("");

  const sendBlast = async () => {
    setSending(true);
    const res = await fetch("/api/service-provider/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule_id: scheduleId, message }),
    });
    const data = await res.json();
    setResult(data);
    setSending(false);
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-200 transition-colors whitespace-nowrap font-medium"
      >
        🚨 Blast ({spotsOpen} open)
      </button>
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h3 className="font-bold text-gray-900 mb-1">Blast Evaluator Pool</h3>
            <p className="text-sm text-gray-500 mb-4">{spotsOpen} spot{spotsOpen !== 1 ? "s" : ""} need to be filled. Notify all available evaluators.</p>
            {result ? (
              <div className="text-center py-4">
                <p className="font-semibold text-gray-900 mb-2">{result.message}</p>
                <button onClick={() => { setShowModal(false); setResult(null); }} className="px-5 py-2 bg-[#FF6B35] text-white rounded-lg text-sm font-medium">Done</button>
              </div>
            ) : (
              <>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Optional message to evaluators..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35] resize-none mb-4"
                  rows={3}
                />
                <div className="flex gap-3">
                  <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm">Cancel</button>
                  <button onClick={sendBlast} disabled={sending}
                    className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                    {sending ? "Sending..." : "Send Blast"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}


function EvaluatorEfficiencyReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null); // selected evaluator for drill-down

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/service-provider/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "evaluator_efficiency" }),
    });
    const d = await res.json();
    setData(d);
    setLoading(false);
  };

  const evalHistory = selected
    ? (data?.sessionHistory || []).filter(s => s.evaluator_id === selected.id)
    : [];

  const totalHours = selected
    ? evalHistory.reduce((s, r) => s + parseFloat(r.hours_worked || 0), 0)
    : 0;

  const scoreRating = (val, good, warn) => {
    if (val === null || val === undefined) return "text-gray-300";
    if (val <= good) return "text-green-600";
    if (val <= warn) return "text-amber-500";
    return "text-red-500";
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-lg">📊</div>
          <div>
            <div className="font-semibold text-gray-900">Evaluator Efficiency Report</div>
            <div className="text-xs text-gray-400">Scoring behaviour, consistency, attendance, hours & pay</div>
          </div>
        </div>
        <button onClick={load} disabled={loading}
          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
          {loading ? "Loading..." : data ? "Refresh" : "Generate Report"}
        </button>
      </div>

      {!data && !loading && (
        <div className="py-12 text-center text-gray-400 text-sm">Click Generate Report to load evaluator data</div>
      )}

      {loading && (
        <div className="py-12 text-center text-gray-400 text-sm">Loading evaluator data...</div>
      )}

      {data && !selected && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Evaluator</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" title="Sessions attended">Sessions</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" title="Late cancellations">Strikes</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" title="Avg minutes into session before first score">First Score</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" title="Avg % of session time used for scoring">Time Used</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" title="Too fast / front-loading flags">Fast Flags</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" title="Scores too similar to another evaluator">Copy Flags</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" title="Incomplete scoring flags">Incomplete</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Approved Hrs</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Pending Hrs</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Rating</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data.evaluators || []).length === 0 && (
                <tr><td colSpan={12} className="py-10 text-center text-gray-400 text-sm">No evaluators found</td></tr>
              )}
              {(data.evaluators || []).map(ev => {
                const pctUsed = ev.avg_pct_session_used !== null ? Math.round(parseFloat(ev.avg_pct_session_used)) : null;
                const firstScore = ev.avg_mins_to_first_score !== null ? Math.round(parseFloat(ev.avg_mins_to_first_score)) : null;
                const strikes = parseInt(ev.late_cancel_strikes || 0);
                const fastFlags = parseInt(ev.too_fast_flags || 0);
                const copyFlags = parseInt(ev.score_copy_flags || 0);
                const incomplete = parseInt(ev.incomplete_flags || 0);
                const approvedHrs = parseFloat(ev.approved_hours || 0).toFixed(1);
                const pendingHrs = parseFloat(ev.pending_hours || 0).toFixed(1);
                const rating = parseFloat(ev.avg_rating || 0);
                const totalSessions = parseInt(ev.total_sessions || 0);

                return (
                  <tr key={ev.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(ev)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{ev.name}</div>
                      <div className="text-xs text-gray-400">{ev.email}</div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">{totalSessions}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${strikes === 0 ? "text-green-600" : strikes === 1 ? "text-amber-500" : "text-red-500"}`}>
                        {strikes}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {firstScore !== null
                        ? <span className={`font-medium ${scoreRating(firstScore, 15, 30)}`}>{firstScore}m</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {pctUsed !== null
                        ? <span className={`font-medium ${pctUsed >= 60 ? "text-green-600" : pctUsed >= 35 ? "text-amber-500" : "text-red-500"}`}>{pctUsed}%</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {fastFlags > 0 ? <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">{fastFlags}</span> : <span className="text-green-500 text-xs">✓</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {copyFlags > 0 ? <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">{copyFlags}</span> : <span className="text-green-500 text-xs">✓</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {incomplete > 0 ? <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">{incomplete}</span> : <span className="text-green-500 text-xs">✓</span>}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-900">{approvedHrs}h</td>
                    <td className="px-4 py-3 text-center">
                      {parseFloat(pendingHrs) > 0
                        ? <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">{pendingHrs}h</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {rating > 0 ? <span className="font-semibold text-gray-900">{rating.toFixed(1)} <span className="text-yellow-400">★</span></span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400 text-xs">→</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Drill-down: individual evaluator */}
      {data && selected && (
        <div className="p-5 space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelected(null)} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">← Back</button>
            <div>
              <div className="font-bold text-gray-900">{selected.name}</div>
              <div className="text-xs text-gray-400">{selected.email}</div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Sessions", value: parseInt(selected.total_sessions || 0), color: "bg-blue-50 text-blue-700" },
              { label: "Late Cancels", value: parseInt(selected.late_cancel_strikes || 0), color: parseInt(selected.late_cancel_strikes || 0) === 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700" },
              { label: "Approved Hrs", value: `${parseFloat(selected.approved_hours || 0).toFixed(1)}h`, color: "bg-gray-50 text-gray-700" },
              { label: "Pending Hrs", value: `${parseFloat(selected.pending_hours || 0).toFixed(1)}h`, color: "bg-amber-50 text-amber-700" },
            ].map(c => (
              <div key={c.label} className={`rounded-xl p-4 text-center ${c.color}`}>
                <div className="text-2xl font-bold">{c.value}</div>
                <div className="text-xs font-medium mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Behaviour summary */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase mb-3">Scoring Behaviour</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Avg time to first score</span><span className="font-semibold">{selected.avg_mins_to_first_score !== null ? `${Math.round(parseFloat(selected.avg_mins_to_first_score))} min` : "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Avg session time used</span><span className="font-semibold">{selected.avg_pct_session_used !== null ? `${Math.round(parseFloat(selected.avg_pct_session_used))}%` : "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Front-loading flags</span><span className={`font-semibold ${parseInt(selected.too_fast_flags || 0) > 0 ? "text-amber-600" : "text-green-600"}`}>{selected.too_fast_flags || 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Score copy flags</span><span className={`font-semibold ${parseInt(selected.score_copy_flags || 0) > 0 ? "text-red-600" : "text-green-600"}`}>{selected.score_copy_flags || 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Incomplete scoring</span><span className={`font-semibold ${parseInt(selected.incomplete_flags || 0) > 0 ? "text-orange-600" : "text-green-600"}`}>{selected.incomplete_flags || 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Late scoring flags</span><span className={`font-semibold ${parseInt(selected.late_scoring_flags || 0) > 0 ? "text-amber-600" : "text-green-600"}`}>{selected.late_scoring_flags || 0}</span></div>
            </div>
          </div>

          {/* Session history table */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase mb-3">Session History</div>
            {evalHistory.length === 0 ? (
              <p className="text-sm text-gray-400">No sessions found</p>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Org / Session</th>
                      <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Athletes Scored</th>
                      <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Hours</th>
                      <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Pay Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {evalHistory.map((s, i) => (
                      <tr key={i} className={`hover:bg-gray-50 ${s.no_show ? "opacity-50" : ""}`}>
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{s.scheduled_date?.toString().split("T")[0]}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-gray-900">{s.org_name} · {s.category_name}</div>
                          <div className="text-xs text-gray-400">S{s.session_number} G{s.group_number}</div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {s.no_show
                            ? <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full">No Show</span>
                            : s.completed
                            ? <span className="text-xs px-2 py-0.5 bg-green-100 text-green-600 rounded-full">Completed</span>
                            : <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full">Signed Up</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center text-gray-700">{s.athletes_scored || "—"}</td>
                        <td className="px-4 py-2.5 text-center font-semibold text-gray-900">{s.hours_worked ? `${parseFloat(s.hours_worked).toFixed(1)}h` : "—"}</td>
                        <td className="px-4 py-2.5 text-center">
                          {!s.hours_worked ? <span className="text-gray-300 text-xs">—</span>
                            : s.hours_status === "approved" ? <span className="text-xs px-2 py-0.5 bg-green-100 text-green-600 rounded-full">Approved</span>
                            : <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-600 rounded-full">Pending</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-2.5 text-sm font-semibold text-gray-700">Total</td>
                      <td className="px-4 py-2.5 text-center font-bold text-gray-900">{totalHours.toFixed(1)}h</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StaffingReports() {
  const [loading, setLoading] = useState(null);
  const [msg, setMsg] = useState("");
  const [sessions, setSessions] = useState([]);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [showBlastPicker, setShowBlastPicker] = useState(false);

  const loadSessions = async () => {
    const res = await fetch("/api/service-provider/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_sessions" }),
    });
    const data = await res.json();
    setSessions(data.sessions || []);
  };

  const run = async (action, extra = {}) => {
    setLoading(action);
    setMsg("");
    const res = await fetch("/api/service-provider/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    setMsg(data.message || data.error || "Done");
    setLoading(null);
  };

  const openSessions = sessions.filter(s => s.signed_up < s.required);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">Reports & Notifications</h2>
      {msg && <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium">✓ {msg}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#F7931E] flex items-center justify-center text-lg">📋</div>
            <div>
              <div className="font-semibold text-gray-900">Weekly Staffing Report</div>
              <div className="text-xs text-gray-400">All sessions for the next 7 days</div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-4">Full/partial/unfilled sessions with evaluator rosters. Auto-sends Sundays at 7pm once deployed.</p>
          <button onClick={() => run("weekly_report")} disabled={loading === "weekly_report"}
            className="w-full py-2.5 bg-gradient-to-r from-[#FF6B35] to-[#F7931E] text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {loading === "weekly_report" ? "Sending..." : "Send Weekly Report Now"}
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-lg">🚨</div>
            <div>
              <div className="font-semibold text-gray-900">Daily Staffing Alert</div>
              <div className="text-xs text-gray-400">Sessions in next 48 hours needing evaluators</div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-4">Only sends if sessions are understaffed. No email if everything is covered.</p>
          <button onClick={() => run("daily_alert")} disabled={loading === "daily_alert"}
            className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {loading === "daily_alert" ? "Checking..." : "Send Daily Alert Now"}
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 md:col-span-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-lg">📢</div>
            <div>
              <div className="font-semibold text-gray-900">Blast Open Sessions to Evaluator Pool</div>
              <div className="text-xs text-gray-400">Notify all active evaluators of open spots</div>
            </div>
          </div>
          {!showBlastPicker ? (
            <div className="flex gap-3">
              <button onClick={() => run("blast_evaluators")} disabled={loading === "blast_evaluators"}
                className="flex-1 py-2.5 bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                {loading === "blast_evaluators" ? "Sending..." : "Blast All Open Sessions"}
              </button>
              <button onClick={async () => { await loadSessions(); setShowBlastPicker(true); }}
                className="flex-1 py-2.5 border border-purple-200 text-purple-600 rounded-xl text-sm font-medium hover:bg-purple-50">
                Pick Specific Sessions
              </button>
            </div>
          ) : (
            <div>
              <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                {openSessions.length === 0 && <p className="text-xs text-gray-400">No open sessions found</p>}
                {openSessions.map(s => (
                  <label key={s.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                    <input type="checkbox" checked={selectedSessions.includes(s.id)}
                      onChange={e => setSelectedSessions(prev => e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id))} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{s.date} at {s.time}</div>
                      <div className="text-xs text-gray-400">{s.group} · {s.required - s.signed_up} spot{s.required - s.signed_up !== 1 ? "s" : ""} needed</div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowBlastPicker(false); setSelectedSessions([]); }}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm">Cancel</button>
                <button onClick={() => { run("blast_evaluators", { session_ids: selectedSessions }); setShowBlastPicker(false); setSelectedSessions([]); }}
                  disabled={!selectedSessions.length}
                  className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                  Blast {selectedSessions.length} Session{selectedSessions.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SPDashboard() {
  const [activeTab, setActiveTab] = useState("associations");
  const queryClient = useQueryClient();
  const [scheduleView, setScheduleView] = useState("list");
  const [showPastSessions, setShowPastSessions] = useState(false);
  const [evalInviteEmail, setEvalInviteEmail] = useState("");
  const [evalInviteSending, setEvalInviteSending] = useState(false);
  const [evalInviteMsg, setEvalInviteMsg] = useState(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", contact_name: "", contact_email: "", contact_phone: "", address: "" });
  const [newClientSaving, setNewClientSaving] = useState(false);
  const [newClientMsg, setNewClientMsg] = useState(null);

  const { data: assocData, isLoading: assocLoading } = useQuery({
    queryKey: ["sp-associations"],
    queryFn: async () => {
      const res = await fetch("/api/service-provider/associations");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: joinCodeData, refetch: refetchCodes } = useQuery({
    queryKey: ["sp-join-codes", assocData?.sp?.id],
    queryFn: async () => {
      if (!assocData?.sp?.id) return null;
      const res = await fetch(`/api/organizations/${assocData.sp.id}/join-codes`);
      return res.json();
    },
    enabled: !!assocData?.sp?.id,
  });

  const { data: evalData, isLoading: evalLoading } = useQuery({
    queryKey: ["sp-evaluators"],
    queryFn: async () => {
      const res = await fetch("/api/service-provider/evaluators");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: schedData, isLoading: schedLoading } = useQuery({
    queryKey: ["sp-schedule"],
    queryFn: async () => {
      const res = await fetch("/api/service-provider/schedule");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const sp = assocData?.sp;
  const associations = assocData?.associations || [];
  const evaluatorStats = assocData?.evaluatorStats || {};
  const evaluators = evalData?.evaluators || [];
  const flags = evalData?.flags || [];
  const pendingHours = evalData?.pendingHours || [];
  // Rebuild byDate client-side to ensure consistent date key format
  const rawSchedule = schedData?.schedule || [];
  const byDate = rawSchedule.reduce((acc, entry) => {
    const date = entry.scheduled_date?.toString().split("T")[0];
    if (!date) return acc;
    if (!acc[date]) acc[date] = [];
    acc[date].push({
      ...entry,
      spots_open: parseInt(entry.evaluators_required) - parseInt(entry.evaluators_signed_up || 0),
    });
    return acc;
  }, {});
  const schedule = Object.values(byDate).flat();

  const today = new Date().toISOString().split("T")[0];
  const allDates = Object.keys(byDate).sort();
  const upcomingDates = showPastSessions ? allDates : allDates.filter(d => d >= today);
  const pastCount = allDates.filter(d => d < today).length;
  const needsEvaluators = schedule.filter(s => s.spots_open > 0 && s.scheduled_date?.toString().split("T")[0] >= today).length;
  const totalUpcoming = schedule.filter(s => s.scheduled_date?.toString().split("T")[0] >= today).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#F7931E] flex items-center justify-center shadow-md">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{sp?.name || "Service Provider"}</h1>
              <p className="text-xs text-gray-400">Service Provider Dashboard</p>
            </div>
          </div>
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <LogOut size={15} /> Sign out
          </button>
        </div>

        {/* Stats bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Client Associations", value: associations.length, icon: Building2, color: "text-blue-600" },
              { label: "Upcoming Sessions", value: totalUpcoming, icon: Calendar, color: "text-[#FF6B35]" },
              { label: "Needs Evaluators", value: needsEvaluators, icon: AlertCircle, color: "text-amber-500" },
              { label: "Evaluator Pool", value: evaluatorStats.total_evaluators || 0, icon: Users, color: "text-green-600" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <Icon size={18} className={color} />
                <div>
                  <div className="text-xl font-bold text-gray-900">{value}</div>
                  <div className="text-xs text-gray-500">{label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {[
              { id: "associations", label: "Associations" },
              { id: "schedule", label: "Master Schedule" },
              { id: "evaluators", label: "Evaluator Pool" },
              { id: "reports", label: "Reports" },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id ? "border-[#FF6B35] text-[#FF6B35]" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ASSOCIATIONS TAB */}
        {activeTab === "associations" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Client Associations</h2>
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-400">{associations.length} clients</p>
                <button
                  onClick={() => { setShowNewClient(true); setNewClientMsg(null); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#FF6B35] to-[#F7931E] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow"
                >
                  <Plus size={15} /> New Client
                </button>
              </div>
            </div>

            {/* New Client Modal */}
            {showNewClient && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-base font-bold text-gray-900">Add New Client Association</h3>
                    <button onClick={() => setShowNewClient(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Organization Name *</label>
                      <input
                        type="text" placeholder="e.g. Calgary Minor Hockey"
                        value={newClient.name}
                        onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">Contact Name *</label>
                        <input
                          type="text" placeholder="Jane Smith"
                          value={newClient.contact_name}
                          onChange={e => setNewClient(p => ({ ...p, contact_name: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">Contact Email *</label>
                        <input
                          type="email" placeholder="jane@org.com"
                          value={newClient.contact_email}
                          onChange={e => setNewClient(p => ({ ...p, contact_email: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">Phone</label>
                        <input
                          type="text" placeholder="403-555-1234"
                          value={newClient.contact_phone}
                          onChange={e => setNewClient(p => ({ ...p, contact_phone: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">City / Address</label>
                        <input
                          type="text" placeholder="Calgary, AB"
                          value={newClient.address}
                          onChange={e => setNewClient(p => ({ ...p, address: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
                        />
                      </div>
                    </div>
                    {newClientMsg && (
                      <p className={`text-xs font-medium ${newClientMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>
                        {newClientMsg.text}
                      </p>
                    )}
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => setShowNewClient(false)}
                        className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={!newClient.name || !newClient.contact_email || !newClient.contact_name || newClientSaving}
                        onClick={async () => {
                          setNewClientSaving(true);
                          setNewClientMsg(null);
                          // Create the association
                          const res = await fetch("/api/organizations", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ ...newClient, type: "association" }),
                          });
                          const data = await res.json();
                          if (!data.organization) {
                            setNewClientMsg({ type: "error", text: data.error || "Failed to create" });
                            setNewClientSaving(false);
                            return;
                          }
                          // Auto-link to this SP
                          await fetch("/api/service-provider/associations", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ association_id: data.organization.id }),
                          });
                          setNewClientMsg({ type: "success", text: `${newClient.name} created and linked!` });
                          setNewClientSaving(false);
                          setNewClient({ name: "", contact_name: "", contact_email: "", contact_phone: "", address: "" });
                          queryClient.invalidateQueries(["sp-associations"]);
                          setTimeout(() => setShowNewClient(false), 1500);
                        }}
                        className="flex-1 px-4 py-2 bg-gradient-to-r from-[#FF6B35] to-[#F7931E] text-white rounded-lg text-sm font-semibold disabled:opacity-40"
                      >
                        {newClientSaving ? "Creating..." : "Create & Link"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {assocLoading ? (
              <div className="py-12 text-center text-gray-400">Loading...</div>
            ) : associations.length === 0 ? (
              <div className="py-16 text-center bg-white border border-dashed border-gray-200 rounded-2xl">
                <Building2 size={48} className="mx-auto text-gray-200 mb-4" />
                <h3 className="font-semibold text-gray-600 mb-2">No client associations yet</h3>
                <p className="text-sm text-gray-400 mb-4">Create your first client using the New Client button above.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {associations.map(assoc => {
                  // Get upcoming sessions for this association
                  const assocSessions = schedule.filter(s =>
                    s.org_id === assoc.id &&
                    s.scheduled_date >= new Date().toISOString().split("T")[0]
                  );
                  const needsEval = assocSessions.filter(s => s.spots_open > 0).length;

                  return (
                    <div key={assoc.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-[#FF6B35]/50 hover:shadow-md transition-all group">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
                            <Building2 size={18} className="text-[#FF6B35]" />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900">{assoc.name}</h3>
                            <p className="text-xs text-gray-400">{assoc.contact_email}</p>
                          </div>
                        </div>
                        {needsEval > 0 && (
                          <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                            {needsEval} needs eval
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                        <div className="bg-gray-50 rounded-lg py-2">
                          <div className="text-lg font-bold text-gray-900">{assoc.age_categories || 0}</div>
                          <div className="text-xs text-gray-400">Categories</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg py-2">
                          <div className="text-lg font-bold text-gray-900">{assoc.athletes || 0}</div>
                          <div className="text-xs text-gray-400">Athletes</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg py-2">
                          <div className="text-lg font-bold text-gray-900">{assocSessions.length}</div>
                          <div className="text-xs text-gray-400">Upcoming</div>
                        </div>
                      </div>

                      <a href={`/association/dashboard?org=${assoc.id}`}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-[#FF6B35] to-[#F7931E] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow">
                        <ExternalLink size={14} /> Open Dashboard
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MASTER SCHEDULE TAB */}
        {activeTab === "schedule" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Master Schedule</h2>
              <button
                onClick={() => setShowPastSessions(!showPastSessions)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                  showPastSessions
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
              >
                {showPastSessions ? "Hide Past" : `Show Past (${pastCount})`}
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{totalUpcoming} upcoming sessions across {associations.length} associations</span>
              </div>
            </div>

            {schedLoading ? (
              <div className="py-12 text-center text-gray-400">Loading schedule...</div>
            ) : upcomingDates.length === 0 ? (
              <div className="py-16 text-center bg-white border border-dashed border-gray-200 rounded-2xl">
                <Calendar size={48} className="mx-auto text-gray-200 mb-4" />
                <h3 className="font-semibold text-gray-600 mb-2">No upcoming sessions</h3>
                <p className="text-sm text-gray-400">Sessions will appear here as associations upload their schedules.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {upcomingDates.map(date => (
                  <div key={date}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-px flex-1 bg-gray-200" />
                      <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">{formatDate(date)}</span>
                      <div className="h-px flex-1 bg-gray-200" />
                    </div>
                    <div className="space-y-2">
                      {byDate[date].map(entry => (
                        <div key={entry.schedule_id} className={`bg-white border rounded-xl p-4 flex items-center gap-4 flex-wrap ${
                          entry.spots_open > 0 ? "border-amber-200" : "border-gray-200"
                        }`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-semibold text-gray-900">{entry.org_name}</span>
                              <span className="text-gray-300">·</span>
                              <span className="text-gray-600">{entry.category_name}</span>
                              {entry.session_type && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${SESSION_TYPE_COLORS[entry.session_type] || "bg-gray-100 text-gray-600"}`}>
                                  {entry.session_type}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                              <span className="flex items-center gap-1"><Clock size={11} />{formatTime(entry.start_time)}{entry.end_time ? ` – ${formatTime(entry.end_time)}` : ""}</span>
                              {entry.location && <span className="flex items-center gap-1"><MapPin size={11} />{entry.location}</span>}
                              <span>Session {entry.session_number}{entry.group_number ? ` · Group ${entry.group_number}` : ""}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-center">
                              <div className={`text-sm font-bold ${entry.spots_open > 0 ? "text-amber-600" : "text-green-600"}`}>
                                {entry.evaluators_signed_up}/{entry.evaluators_required}
                              </div>
                              <div className="text-xs text-gray-400">evaluators</div>
                            </div>
                            {entry.spots_open > 0 ? (
                              <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">
                                {entry.spots_open} open
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium flex items-center gap-1">
                                <CheckCircle size={11} /> Full
                              </span>
                            )}
                            <a href={`/checkin/${entry.schedule_id}`}
                              className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap">
                              Check-in
                            </a>
                            {entry.spots_open > 0 && (
                              <BlastButton scheduleId={entry.schedule_id} spotsOpen={entry.spots_open} />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* EVALUATOR POOL TAB */}
        {activeTab === "reports" && (
          <div className="space-y-6">
            <StaffingReports orgId={assocData?.sp?.id} />
            <EvaluatorEfficiencyReport />
          </div>
        )}

        {activeTab === "evaluators" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Evaluator Pool</h2>
              <div className="flex items-center gap-3">
                {flags.length > 0 && (
                  <span className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-full font-medium">
                    {flags.length} open flag{flags.length !== 1 ? "s" : ""}
                  </span>
                )}
                {pendingHours.length > 0 && (
                  <span className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                    {pendingHours.length} pending hours
                  </span>
                )}
              </div>
            </div>

            {/* Flags */}
            {flags.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-red-800 mb-3">⚠ Performance Flags</h3>
                <div className="space-y-2">
                  {flags.map(flag => (
                    <div key={flag.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-red-100">
                      <div>
                        <span className="font-medium text-gray-900 text-sm">{flag.evaluator_name}</span>
                        <span className="mx-2 text-gray-300">·</span>
                        <span className="text-xs text-gray-500">{flag.org_name} S{flag.session_number}</span>
                        <span className="mx-2 text-gray-300">·</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          flag.flag_type === "too_fast" ? "bg-amber-100 text-amber-700" :
                          flag.flag_type === "no_show" ? "bg-red-100 text-red-700" :
                          flag.flag_type === "score_outlier" ? "bg-purple-100 text-purple-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {flag.flag_type.replace(/_/g, " ")}
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          await fetch("/api/service-provider/evaluators", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "dismiss_flag", flag_id: flag.id }),
                          });
                          queryClient.invalidateQueries(["sp-evaluators"]);
                        }}
                        className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 hover:bg-gray-100 rounded"
                      >
                        Dismiss
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Hours */}
            {pendingHours.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-amber-50 border-b border-amber-200">
                  <h3 className="text-sm font-semibold text-amber-800">Pending Hours Approval</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Evaluator</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Session</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Hours</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pendingHours.map(h => (
                      <tr key={h.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{h.evaluator_name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{h.org_name} · {h.category_name} S{h.session_number}</td>
                        <td className="px-4 py-2.5 text-gray-500">{h.session_date?.toString().split("T")[0]}</td>
                        <td className="px-4 py-2.5 text-center font-bold text-gray-900">{parseFloat(h.hours_worked).toFixed(1)}h</td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={async () => {
                              await fetch("/api/service-provider/evaluators", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "approve_hours", hours_id: h.id }),
                              });
                              queryClient.invalidateQueries(["sp-evaluators"]);
                            }}
                            className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200 font-medium"
                          >
                            Approve
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Join Codes */}
            <JoinCodesPanel orgId={assocData?.sp?.id} data={joinCodeData} refetch={refetchCodes} />

            {/* Invite Evaluator by Email */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Invite Evaluator by Email</h3>
                <p className="text-xs text-gray-400 mt-0.5">Send someone a direct link to sign up as an evaluator — they will only get evaluator access</p>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-3">
                  <input
                    type="email"
                    placeholder="Evaluator's email address"
                    value={evalInviteEmail}
                    onChange={e => setEvalInviteEmail(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
                  />
                  <button
                    disabled={!evalInviteEmail || evalInviteSending || !joinCodeData?.codes?.find(c => c.uses < c.max_uses)}
                    onClick={async () => {
                      const activeCode = joinCodeData?.codes?.find(c => c.uses < c.max_uses);
                      if (!activeCode) { setEvalInviteMsg({ type: "error", text: "Generate a join code first" }); return; }
                      setEvalInviteSending(true);
                      setEvalInviteMsg(null);
                      const signupUrl = `${window.location.origin}/evaluator/signup?code=${activeCode.code}`;
                      const res = await fetch("/api/service-provider/notify", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "invite_evaluator", email: evalInviteEmail, signup_url: signupUrl, sp_name: sp?.name }),
                      });
                      const data = await res.json();
                      setEvalInviteSending(false);
                      if (data.success) {
                        setEvalInviteMsg({ type: "success", text: `Invite sent to ${evalInviteEmail}` });
                        setEvalInviteEmail("");
                      } else {
                        setEvalInviteMsg({ type: "error", text: data.error || "Failed to send" });
                      }
                    }}
                    className="px-5 py-2 bg-gradient-to-r from-[#FF6B35] to-[#F7931E] text-white rounded-lg text-sm font-semibold disabled:opacity-40 whitespace-nowrap"
                  >
                    {evalInviteSending ? "Sending..." : "Send Invite"}
                  </button>
                </div>
                {!joinCodeData?.codes?.find(c => c.uses < c.max_uses) && (
                  <p className="text-xs text-amber-500 mt-2">⚠ Generate a join code above first before sending email invites</p>
                )}
                {evalInviteMsg && (
                  <p className={`text-xs font-medium mt-2 ${evalInviteMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>
                    {evalInviteMsg.text}
                  </p>
                )}
              </div>
            </div>

            {/* Evaluator list */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Evaluator</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sessions</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total Hours</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pending $</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Rating</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">No-shows</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {evaluators.length === 0 ? (
                    <tr><td colSpan={7} className="py-10 text-center text-gray-400 text-sm">No evaluators in pool yet</td></tr>
                  ) : evaluators.map(ev => (
                    <tr key={ev.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 cursor-pointer" onClick={() => window.location.href = `/service-provider/evaluator/${ev.id}`}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 hover:text-[#FF6B35] transition-colors">{ev.name}</span>
                          {ev.membership_status === 'pending' && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">Pending</span>}
                          {ev.membership_status === 'suspended' && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">Suspended</span>}
                        </div>
                        <div className="text-xs text-gray-400">{ev.email}</div>
                        {ev.evaluator_id && <div className="text-xs font-mono text-gray-300">{ev.evaluator_id}</div>}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">{ev.total_sessions || 0}</td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-900">{parseFloat(ev.total_hours || 0).toFixed(1)}h</td>
                      <td className="px-4 py-3 text-center">
                        {parseFloat(ev.pending_hours || 0) > 0 ? (
                          <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                            {parseFloat(ev.pending_hours).toFixed(1)}h
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {parseFloat(ev.avg_rating || 0) > 0 ? (
                          <span className="font-semibold text-gray-900">
                            {parseFloat(ev.avg_rating).toFixed(1)} <span className="text-yellow-400">★</span>
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {parseInt(ev.no_shows || 0) > 0 ? (
                          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">{ev.no_shows}</span>
                        ) : <span className="text-green-500 text-xs">✓</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {parseInt(ev.open_flags || 0) > 0 ? (
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">{ev.open_flags}</span>
                            {ev.open_flags >= 2 && (
                              <button
                                onClick={async () => {
                                  if (confirm(`Reinstate ${ev.name} and clear their suspension flags?`)) {
                                    await fetch("/api/service-provider/evaluators", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ action: "reinstate", evaluator_id: ev.id }),
                                    });
                                    queryClient.invalidateQueries(["sp-evaluators"]);
                                  }
                                }}
                                className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full hover:bg-green-200 font-medium"
                              >
                                Reinstate
                              </button>
                            )}
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {ev.membership_status === "pending" && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                await fetch("/api/service-provider/evaluators", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ action: "approve", evaluator_id: ev.id }),
                                });
                                queryClient.invalidateQueries(["sp-evaluators"]);
                              }}
                              className="text-xs px-2 py-1 bg-green-100 text-green-700 border border-green-200 rounded-lg hover:bg-green-200 font-medium"
                            >
                              Approve
                            </button>
                          )}
                          {ev.membership_status !== "suspended" ? (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm(`Suspend ${ev.name}? They will be removed from future sessions but their data will be retained.`)) {
                                  await fetch("/api/service-provider/evaluators", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "suspend", evaluator_id: ev.id }),
                                  });
                                  queryClient.invalidateQueries(["sp-evaluators"]);
                                }
                              }}
                              className="text-xs px-2 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-100 font-medium"
                            >
                              Suspend
                            </button>
                          ) : (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                await fetch("/api/service-provider/evaluators", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ action: "reinstate", evaluator_id: ev.id }),
                                });
                                queryClient.invalidateQueries(["sp-evaluators"]);
                              }}
                              className="text-xs px-2 py-1 bg-green-50 text-green-600 border border-green-200 rounded-lg hover:bg-green-100 font-medium"
                            >
                              Reinstate
                            </button>
                          )}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm(`Permanently delete ${ev.name}'s account? This cannot be undone. Evaluators with session history cannot be deleted — use Suspend instead.`)) {
                                const res = await fetch("/api/service-provider/evaluators", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ action: "delete_account", evaluator_id: ev.id }),
                                });
                                const data = await res.json();
                                if (data.error) alert(data.error);
                                queryClient.invalidateQueries(["sp-evaluators"]);
                              }
                            }}
                            className="text-xs px-2 py-1 bg-red-50 text-red-500 border border-red-200 rounded-lg hover:bg-red-100 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function ServiceProviderDashboardPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6B35]" /></div>}>
        <SPDashboard />
      </Suspense>
    </QueryClientProvider>
  );
}
