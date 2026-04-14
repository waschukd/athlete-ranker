"use client";

import { useState, Suspense } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ArrowLeft, Calendar, Clock, MapPin, Star, AlertTriangle,
  CheckCircle, XCircle, Flag, DollarSign, TrendingUp, User, Check
} from "lucide-react";

const qc = new QueryClient();

const FLAG_COLORS = {
  late_cancel: "bg-amber-100 text-amber-800",
  late_scoring: "bg-orange-100 text-orange-800",
  incomplete: "bg-red-100 text-red-800",
  score_copy_suspected: "bg-purple-100 text-purple-800",
  no_show: "bg-red-100 text-red-800",
};

const FLAG_LABELS = {
  late_cancel: "Late Cancellation",
  late_scoring: "Late Scoring",
  incomplete: "Incomplete Scoring",
  score_copy_suspected: "Possible Score Copying",
  no_show: "No Show",
};

function formatDate(d) {
  if (!d) return "";
  const str = d.toString().split("T")[0];
  const [y, m, day] = str.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.toString().split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button key={star} onClick={() => onChange(star)}
          className={`text-xl transition-colors ${star <= value ? "text-yellow-400" : "text-gray-200 hover:text-yellow-300"}`}>
          ★
        </button>
      ))}
    </div>
  );
}

function EvaluatorDetailInner() {
  const params = useParams();
  const evalId = params.evalId;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("sessions");
  const [ratingModal, setRatingModal] = useState(null);
  const [rating, setRating] = useState(0);
  const [ratingNotes, setRatingNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["evaluator-detail", evalId],
    queryFn: async () => {
      const res = await fetch(`/api/service-provider/evaluator/${evalId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (hours_id) => {
      const res = await fetch("/api/service-provider/evaluators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_hours", hours_id }),
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries(["evaluator-detail", evalId]),
  });

  const rateMutation = useMutation({
    mutationFn: async ({ schedule_id, rating, notes }) => {
      const res = await fetch("/api/service-provider/evaluators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rate_evaluator", evaluator_id: parseInt(evalId), schedule_id, rating, notes }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["evaluator-detail", evalId]);
      setRatingModal(null);
      setRating(0);
      setRatingNotes("");
    },
  });

  const dismissFlagMutation = useMutation({
    mutationFn: async (flag_id) => {
      const res = await fetch("/api/service-provider/evaluators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss_flag", flag_id }),
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries(["evaluator-detail", evalId]),
  });

  const evaluator = data?.evaluator;
  const sessions = data?.sessions || [];
  const flags = data?.flags || [];
  const stats = data?.stats || {};

  const openFlags = flags.filter(f => !f.reviewed);
  const strikeCount = flags.filter(f => f.flag_type === "late_cancel").length;

  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
          <a href="/service-provider/dashboard"
            className="inline-flex items-center gap-1.5 text-gray-500 hover:text-[#1A6BFF] mb-4 text-sm font-medium transition-colors">
            <ArrowLeft size={15} /> Back to Dashboard
          </a>

          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-center text-white text-xl font-bold shadow-md">
                {evaluator?.name?.split(" ").map(n => n[0]).join("").substring(0, 2)}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{evaluator?.name}</h1>
                <p className="text-sm text-gray-400">{evaluator?.email}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {strikeCount > 0 && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${strikeCount >= 2 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {strikeCount >= 2 ? "🚫 Suspended" : `⚠ Strike ${strikeCount}`}
                    </span>
                  )}
                  {stats.avg_rating > 0 && (
                    <span className="text-xs text-gray-600">
                      {stats.avg_rating.toFixed(1)} <span className="text-yellow-400">★</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* Admin actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={async () => {
                  if (confirm(`Suspend ${evaluator?.name}? They will be removed from future sessions but all data is retained.`)) {
                    await fetch("/api/service-provider/evaluators", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "suspend", evaluator_id: parseInt(evalId) }),
                    });
                    queryClient.invalidateQueries(["evaluator-detail", evalId]);
                  }
                }}
                className="px-4 py-2 border border-amber-200 text-amber-600 rounded-lg text-sm font-medium hover:bg-amber-50 transition-colors"
              >
                Suspend
              </button>
              <button
                onClick={async () => {
                  if (confirm(`Permanently delete ${evaluator?.name}'s account? Evaluators with session history cannot be deleted — use Suspend instead.`)) {
                    const res = await fetch("/api/service-provider/evaluators", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "delete_account", evaluator_id: parseInt(evalId) }),
                    });
                    const data = await res.json();
                    if (data.error) {
                      alert(data.error);
                    } else {
                      window.location.href = "/service-provider/dashboard";
                    }
                  }
                }}
                className="px-4 py-2 border border-red-200 text-red-500 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
              >
                Delete Account
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
            {[
              { label: "Sessions", value: stats.total_sessions || 0, icon: Calendar, color: "text-blue-600" },
              { label: "Total Hours", value: `${parseFloat(stats.total_hours || 0).toFixed(1)}h`, icon: Clock, color: "text-[#1A6BFF]" },
              { label: "Pending Hours", value: `${parseFloat(stats.pending_hours || 0).toFixed(1)}h`, icon: DollarSign, color: "text-amber-500" },
              { label: "No-shows", value: stats.no_shows || 0, icon: XCircle, color: "text-red-500" },
              { label: "Open Flags", value: openFlags.length, icon: Flag, color: openFlags.length > 0 ? "text-red-500" : "text-gray-300" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={14} className={color} />
                  <span className="text-xs text-gray-500">{label}</span>
                </div>
                <div className="text-xl font-bold text-gray-900">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1">
            {[
              { id: "scorecard", label: "Scorecard" },
              { id: "sessions", label: `Sessions (${sessions.length})` },
              { id: "flags", label: `Flags (${flags.length})` },
              { id: "hours", label: "Hours & Pay" },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id ? "border-[#1A6BFF] text-[#1A6BFF]" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* SCORECARD TAB */}
        {activeTab === "scorecard" && (() => {
          const sc = data?.scorecard;
          if (!sc || sc.total_scores === 0) return (
            <div className="text-center py-16 text-gray-400 text-sm">No scoring data yet — scorecard populates after the evaluator submits scores.</div>
          );
          const agreementColor = sc.agreement_pct >= 90 ? "text-green-600" : sc.agreement_pct >= 75 ? "text-amber-600" : "text-red-600";
          const agreementBg = sc.agreement_pct >= 90 ? "bg-green-50 border-green-200" : sc.agreement_pct >= 75 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
          const biasLabel = sc.bias > 0.3 ? "Generous" : sc.bias < -0.3 ? "Harsh" : "Neutral";
          const biasColor = sc.bias > 0.3 ? "text-blue-600" : sc.bias < -0.3 ? "text-purple-600" : "text-green-600";
          const maxDist = Math.max(...Object.values(sc.distribution || {}), 1);
          return (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className={`border rounded-xl p-4 ${agreementBg}`}>
                  <div className={`text-3xl font-bold ${agreementColor}`}>{sc.agreement_pct !== null ? `${sc.agreement_pct}%` : "—"}</div>
                  <div className="text-xs text-gray-500 mt-1">Agreement with peers</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className={`text-3xl font-bold ${biasColor}`}>{sc.bias !== null ? (sc.bias > 0 ? "+" : "") + sc.bias : "—"}</div>
                  <div className="text-xs text-gray-500 mt-1">Scoring bias ({biasLabel})</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-3xl font-bold text-gray-900">{sc.notes_per_session}</div>
                  <div className="text-xs text-gray-500 mt-1">Notes per session</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-3xl font-bold text-gray-900">{sc.score_range?.spread || "—"}</div>
                  <div className="text-xs text-gray-500 mt-1">Score range used ({sc.score_range?.min}–{sc.score_range?.max})</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className={`text-3xl font-bold ${sc.compare_uses > 0 ? "text-purple-600" : "text-gray-300"}`}>{sc.compare_uses || 0}</div>
                  <div className="text-xs text-gray-500 mt-1">Compare tool uses</div>
                </div>
              </div>

              {/* Detailed Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Scoring Summary */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Scoring Summary</h3>
                  <div className="space-y-3">
                    {[
                      { label: "Total scores submitted", value: sc.total_scores },
                      { label: "Athletes scored", value: sc.athletes_scored },
                      { label: "Sessions scored", value: sc.sessions_scored },
                      { label: "Avg score given", value: sc.score_avg || "—" },
                      { label: "Group average", value: sc.group_avg || "—" },
                      { label: "Notes written", value: sc.notes_total },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">{row.label}</span>
                        <span className="text-sm font-semibold text-gray-900">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Score Distribution */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Score Distribution</h3>
                  <div className="space-y-1.5">
                    {Object.entries(sc.distribution || {}).sort(([a], [b]) => parseFloat(a) - parseFloat(b)).map(([score, count]) => (
                      <div key={score} className="flex items-center gap-3">
                        <span className="text-xs font-mono text-gray-500 w-8 text-right">{score}</span>
                        <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] rounded-full transition-all"
                            style={{ width: `${(count / maxDist) * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-400 w-8">{count}</span>
                      </div>
                    ))}
                  </div>
                  {sc.score_range?.spread < 3 && (
                    <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                      Narrow scoring range ({sc.score_range.min}–{sc.score_range.max}) — evaluator may not be differentiating between athletes enough.
                    </div>
                  )}
                </div>
              </div>

              {/* Interpretation */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Interpretation</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  {sc.agreement_pct !== null && sc.agreement_pct >= 85 && <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">●</span>Agreement with peers is strong — this evaluator's scores align well with the group.</div>}
                  {sc.agreement_pct !== null && sc.agreement_pct < 75 && <div className="flex items-start gap-2"><span className="text-red-500 mt-0.5">●</span>Low agreement with peers — this evaluator's scores frequently differ from the group. May need coaching or re-calibration.</div>}
                  {sc.agreement_pct !== null && sc.agreement_pct >= 75 && sc.agreement_pct < 85 && <div className="flex items-start gap-2"><span className="text-amber-500 mt-0.5">●</span>Moderate agreement — some scoring differences from peers. Worth monitoring.</div>}
                  {sc.bias !== null && Math.abs(sc.bias) > 0.5 && <div className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">●</span>Scoring bias of {sc.bias > 0 ? "+" : ""}{sc.bias} — this evaluator tends to score {sc.bias > 0 ? "higher" : "lower"} than the group average.</div>}
                  {sc.notes_per_session < 2 && <div className="flex items-start gap-2"><span className="text-amber-500 mt-0.5">●</span>Low notes volume ({sc.notes_per_session}/session) — consider encouraging more detailed player observations.</div>}
                  {sc.notes_per_session >= 5 && <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">●</span>Good notes volume ({sc.notes_per_session}/session) — this evaluator provides detailed observations.</div>}
                  {sc.score_range?.spread < 3 && <div className="flex items-start gap-2"><span className="text-amber-500 mt-0.5">●</span>Narrow score range ({sc.score_range.spread} points) — may not be differentiating between athletes sufficiently.</div>}
                  {sc.score_range?.spread >= 5 && <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">●</span>Good score differentiation — using {sc.score_range.spread} points of the scale.</div>}
                </div>
              </div>
            </div>
          );
        })()}

        {/* SESSIONS TAB */}
        {activeTab === "sessions" && (
          <div className="space-y-3">
            {sessions.length === 0 ? (
              <div className="py-12 text-center text-gray-400 bg-white border border-dashed border-gray-200 rounded-xl">
                <Calendar size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No sessions yet</p>
              </div>
            ) : sessions.map(s => {
              const isPast = new Date(s.scheduled_date?.toString().split("T")[0]) < new Date();
              const sessionEnd = s.end_time ? new Date(`${s.scheduled_date?.toString().split("T")[0]}T${s.end_time}`) : null;
              const scoringDuration = s.first_score_at && s.last_score_at
                ? Math.round((new Date(s.last_score_at) - new Date(s.first_score_at)) / 60000)
                : null;
              const scoredAfterEnd = sessionEnd && s.first_score_at && new Date(s.first_score_at) > sessionEnd;

              return (
                <div key={s.id} className={`bg-white border rounded-xl p-5 ${s.no_show ? "border-red-200 bg-red-50/20" : s.status === "cancelled" ? "border-gray-100 opacity-60" : "border-gray-200"}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-gray-900">{s.org_name}</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-600">{s.category_name}</span>
                        {s.session_type && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                            s.session_type === "testing" ? "bg-blue-100 text-blue-700" :
                            s.session_type === "skills" ? "bg-purple-100 text-purple-700" :
                            "bg-green-100 text-green-700"
                          }`}>{s.session_type}</span>
                        )}
                        {s.status === "cancelled" && <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Cancelled</span>}
                        {s.no_show && <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">No Show</span>}
                        {s.completed && <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">✓ Completed</span>}
                      </div>

                      <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar size={12} />{formatDate(s.scheduled_date)}</span>
                        {s.start_time && <span className="flex items-center gap-1"><Clock size={12} />{formatTime(s.start_time)}{s.end_time ? ` – ${formatTime(s.end_time)}` : ""}</span>}
                        {s.location && <span className="flex items-center gap-1"><MapPin size={12} />{s.location}</span>}
                        <span className="text-gray-400">S{s.session_number}{s.group_number ? ` G${s.group_number}` : ""}</span>
                      </div>

                      {/* Scoring stats */}
                      {isPast && s.status !== "cancelled" && (
                        <div className="mt-2 flex items-center gap-4 text-xs flex-wrap">
                          {s.athletes_scored > 0 && (
                            <span className={`${scoredAfterEnd ? "text-red-600 font-medium" : "text-gray-500"}`}>
                              {s.athletes_scored} athletes scored
                              {scoredAfterEnd && " ⚠ after session end"}
                            </span>
                          )}
                          {scoringDuration !== null && (
                            <span className="text-gray-400">Scoring duration: {scoringDuration}min</span>
                          )}
                          {s.hours_worked && (
                            <span className={`font-medium ${s.hours_status === "approved" ? "text-green-600" : "text-amber-600"}`}>
                              {parseFloat(s.hours_worked).toFixed(1)}h {s.hours_status === "approved" ? "✓ approved" : "pending"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                      {/* Rating */}
                      {isPast && s.status !== "cancelled" && !s.no_show && (
                        s.rating ? (
                          <div className="flex items-center gap-1 text-sm">
                            <span className="font-semibold text-gray-700">{s.rating}</span>
                            <span className="text-yellow-400">★</span>
                            <button onClick={() => { setRatingModal(s); setRating(s.rating); setRatingNotes(s.rating_notes || ""); }}
                              className="text-xs text-gray-400 hover:text-gray-600 ml-1">Edit</button>
                          </div>
                        ) : (
                          <button onClick={() => { setRatingModal(s); setRating(0); setRatingNotes(""); }}
                            className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 flex items-center gap-1">
                            <Star size={12} /> Rate
                          </button>
                        )
                      )}
                      {/* Approve hours */}
                      {s.hours_worked && s.hours_status === "pending" && (
                        <button
                          onClick={() => {
                            const hoursEntry = sessions.find(sess => sess.schedule_id === s.schedule_id && sess.hours_worked);
                            // Find hours id - need to get it from API
                            approveMutation.mutate(s.hours_id);
                          }}
                          className="text-xs px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium"
                        >
                          Approve {parseFloat(s.hours_worked).toFixed(1)}h
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FLAGS TAB */}
        {activeTab === "flags" && (
          <div className="space-y-3">
            {flags.length === 0 ? (
              <div className="py-12 text-center text-gray-400 bg-white border border-dashed border-gray-200 rounded-xl">
                <CheckCircle size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No flags on record</p>
              </div>
            ) : flags.map(f => (
              <div key={f.id} className={`bg-white border rounded-xl p-5 ${f.reviewed ? "opacity-50 border-gray-100" : "border-gray-200"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${FLAG_COLORS[f.flag_type] || "bg-gray-100 text-gray-700"}`}>
                        {FLAG_LABELS[f.flag_type] || f.flag_type}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        f.severity === "critical" ? "bg-red-100 text-red-700" :
                        f.severity === "warning" ? "bg-amber-100 text-amber-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>{f.severity}</span>
                      {f.reviewed && <span className="text-xs text-gray-400">✓ Dismissed</span>}
                    </div>

                    {f.org_name && (
                      <p className="text-sm text-gray-600 mb-1">
                        {f.org_name} · S{f.session_number} G{f.group_number} · {formatDate(f.scheduled_date)}
                      </p>
                    )}

                    {f.details && (
                      <div className="text-xs text-gray-500 space-y-0.5">
                        {Object.entries(typeof f.details === "string" ? JSON.parse(f.details) : f.details).map(([k, v]) => (
                          <div key={k}><span className="font-medium text-gray-600">{k.replace(/_/g, " ")}:</span> {v?.toString()}</div>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-gray-400 mt-2">{new Date(f.created_at).toLocaleString()}</p>
                  </div>

                  {!f.reviewed && (
                    <button onClick={() => dismissFlagMutation.mutate(f.id)}
                      className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 flex-shrink-0">
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* HOURS & PAY TAB */}
        {activeTab === "hours" && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Total Hours Worked", value: `${parseFloat(stats.total_hours || 0).toFixed(1)}h`, color: "text-gray-900" },
                { label: "Pending Approval", value: `${parseFloat(stats.pending_hours || 0).toFixed(1)}h`, color: "text-amber-600" },
                { label: "Approved Hours", value: `${parseFloat(stats.approved_hours || 0).toFixed(1)}h`, color: "text-green-600" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-sm text-gray-500 mb-1">{label}</div>
                  <div className={`text-3xl font-bold ${color}`}>{value}</div>
                </div>
              ))}
            </div>

            {/* Session hours breakdown */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-700">Hours Breakdown</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left">Session</th>
                    <th className="px-4 py-2.5 text-left">Date</th>
                    <th className="px-4 py-2.5 text-center">Hours</th>
                    <th className="px-4 py-2.5 text-center">Status</th>
                    <th className="px-4 py-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sessions.filter(s => s.hours_worked).map(s => (
                    <tr key={s.schedule_id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900">{s.org_name}</div>
                        <div className="text-xs text-gray-400">{s.category_name} · S{s.session_number} G{s.group_number}</div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{s.scheduled_date?.toString().split("T")[0]}</td>
                      <td className="px-4 py-2.5 text-center font-bold text-gray-900">{parseFloat(s.hours_worked).toFixed(1)}h</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          s.hours_status === "approved" ? "bg-green-100 text-green-700" :
                          s.hours_status === "paid" ? "bg-blue-100 text-blue-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>{s.hours_status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {s.hours_status === "pending" && (
                          <button onClick={() => approveMutation.mutate(s.hours_id)}
                            className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200 font-medium">
                            Approve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {sessions.filter(s => s.hours_worked).length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-gray-400 text-sm">No hours logged yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Rating Modal */}
      {ratingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setRatingModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h3 className="font-bold text-gray-900 mb-1">Rate Evaluator</h3>
            <p className="text-sm text-gray-500 mb-5">
              {ratingModal.org_name} · S{ratingModal.session_number} G{ratingModal.group_number} · {formatDate(ratingModal.scheduled_date)}
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Rating</label>
              <StarRating value={rating} onChange={setRating} />
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
              <textarea value={ratingNotes} onChange={e => setRatingNotes(e.target.value)}
                placeholder="Performance notes..."
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF] resize-none"
                rows={3} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRatingModal(null)}
                className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium">Cancel</button>
              <button
                onClick={() => rateMutation.mutate({ schedule_id: ratingModal.schedule_id, rating, notes: ratingNotes })}
                disabled={!rating || rateMutation.isPending}
                className="flex-1 py-2.5 bg-[#1A6BFF] text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {rateMutation.isPending ? "Saving..." : "Save Rating"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EvaluatorDetailPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" /></div>}>
        <EvaluatorDetailInner />
      </Suspense>
    </QueryClientProvider>
  );
}
