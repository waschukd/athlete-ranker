"use client";

import { useState } from "react";

export function EvaluatorEfficiencyReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/service-provider/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "evaluator_efficiency" }) });
    setData(await res.json());
    setLoading(false);
  };
  const evalHistory = selected ? (data?.sessionHistory || []).filter(s => s.evaluator_id === selected.id) : [];
  const totalHours = evalHistory.reduce((s, r) => s + parseFloat(r.hours_worked || 0), 0);
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <div className="font-semibold text-gray-900">Evaluator Efficiency Report</div>
          <div className="text-xs text-gray-400">Scoring behaviour, attendance, hours and pay</div>
        </div>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
          {loading ? "Loading..." : data ? "Refresh" : "Generate Report"}
        </button>
      </div>
      {!data && !loading && <div className="py-12 text-center text-gray-400 text-sm">Click Generate Report to load evaluator data</div>}
      {loading && <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>}
      {data && !selected && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Evaluator</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Sessions</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" title="Average % of the session window the evaluator was actively scoring. Low = scored only briefly (e.g. the first few minutes, not the full session).">Engagement</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" title="Quality flags: too-fast scoring, incomplete sessions, late scoring, suspected score-copying.">Flags</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Strikes</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Approved Hrs</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Pending Hrs</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data.evaluators || []).length === 0 && <tr><td colSpan={8} className="py-10 text-center text-gray-400 text-sm">No evaluators found</td></tr>}
              {(data.evaluators || []).map(ev => {
                const eng = ev.avg_pct_session_used != null ? Math.round(parseFloat(ev.avg_pct_session_used)) : null;
                const engCls = eng == null ? "text-gray-300" : eng >= 50 ? "text-green-600" : eng >= 15 ? "text-amber-600" : "text-red-500";
                const flagCount = parseInt(ev.too_fast_flags || 0) + parseInt(ev.incomplete_flags || 0) + parseInt(ev.late_scoring_flags || 0) + parseInt(ev.score_copy_flags || 0);
                return (
                <tr key={ev.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(ev)}>
                  <td className="px-4 py-3"><div className="font-medium text-gray-900">{ev.name}</div><div className="text-xs text-gray-400">{ev.email}</div></td>
                  <td className="px-4 py-3 text-center">{parseInt(ev.total_sessions || 0)}</td>
                  <td className="px-4 py-3 text-center"><span className={`font-semibold ${engCls}`} title={eng == null ? "No scoring data yet" : `Active ~${eng}% of the session window`}>{eng == null ? "–" : `${eng}%`}</span></td>
                  <td className="px-4 py-3 text-center"><span className={`font-semibold ${flagCount > 0 ? "text-red-500" : "text-gray-400"}`} title={`Too fast: ${ev.too_fast_flags || 0} · Incomplete: ${ev.incomplete_flags || 0} · Late: ${ev.late_scoring_flags || 0} · Copy: ${ev.score_copy_flags || 0}`}>{flagCount}</span></td>
                  <td className="px-4 py-3 text-center"><span className={`font-bold ${parseInt(ev.late_cancel_strikes || 0) === 0 ? "text-green-600" : "text-red-500"}`}>{ev.late_cancel_strikes || 0}</span></td>
                  <td className="px-4 py-3 text-center font-semibold">{parseFloat(ev.approved_hours || 0).toFixed(1)}h</td>
                  <td className="px-4 py-3 text-center">{parseFloat(ev.pending_hours || 0) > 0 ? <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">{parseFloat(ev.pending_hours).toFixed(1)}h</span> : "-"}</td>
                  <td className="px-4 py-3 text-center">{parseFloat(ev.avg_rating || 0) > 0 ? `${parseFloat(ev.avg_rating).toFixed(1)} *` : "-"}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && selected && (
        <div className="p-5 space-y-4">
          <button onClick={() => setSelected(null)} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg">Back</button>
          <div className="font-bold text-gray-900">{selected.name} - {selected.email}</div>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Date</th><th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Session</th><th className="px-4 py-2 text-center text-xs text-gray-500 uppercase">Status</th><th className="px-4 py-2 text-center text-xs text-gray-500 uppercase">Hours</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {evalHistory.map((s, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-gray-600">{s.scheduled_date?.toString().split("T")[0]}</td>
                    <td className="px-4 py-2.5"><div className="font-medium">{s.org_name} - {s.category_name}</div><div className="text-xs text-gray-400">S{s.session_number} G{s.group_number}</div></td>
                    <td className="px-4 py-2.5 text-center">{s.no_show ? <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full">No Show</span> : s.completed ? <span className="text-xs px-2 py-0.5 bg-green-100 text-green-600 rounded-full">Completed</span> : <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full">Signed Up</span>}</td>
                    <td className="px-4 py-2.5 text-center font-semibold">{s.hours_worked ? `${parseFloat(s.hours_worked).toFixed(1)}h` : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200"><tr><td colSpan={3} className="px-4 py-2 font-semibold text-gray-700">Total</td><td className="px-4 py-2 text-center font-bold">{totalHours.toFixed(1)}h</td></tr></tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function StaffingReports() {
  const [loading, setLoading] = useState(null);
  const [msg, setMsg] = useState("");
  const run = async (action) => {
    setLoading(action);
    setMsg("");
    const res = await fetch("/api/service-provider/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await res.json();
    setMsg(data.message || data.error || "Done");
    setLoading(null);
  };
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">Reports and Notifications</h2>
      {msg && <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">{msg}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="font-semibold text-gray-900 mb-1">Weekly Staffing Report</div>
          <p className="text-xs text-gray-500 mb-4">All sessions for the next 7 days with evaluator rosters.</p>
          <button onClick={() => run("weekly_report")} disabled={loading === "weekly_report"} className="w-full py-2.5 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {loading === "weekly_report" ? "Sending..." : "Send Weekly Report Now"}
          </button>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="font-semibold text-gray-900 mb-1">Daily Staffing Alert</div>
          <p className="text-xs text-gray-500 mb-4">Sessions in next 48 hours that need evaluators.</p>
          <button onClick={() => run("daily_alert")} disabled={loading === "daily_alert"} className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {loading === "daily_alert" ? "Checking..." : "Send Daily Alert Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
