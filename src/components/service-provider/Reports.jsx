"use client";

import { useState, useEffect } from "react";

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

export function ReportSalesReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [viewOrg, setViewOrg] = useState(null); // { organization_id, org_name } — who to show purchasers for

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/service-provider/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "report_sales" }) });
    setData(await res.json());
    setLoading(false);
  };
  // Real ask: the only place to see this was Stripe's raw transaction list --
  // no per-association breakdown at all. Loads automatically so it's just
  // there to check, same as any other dashboard number.
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const associations = data?.associations || [];
  const totals = associations.reduce((acc, a) => ({
    today: acc.today + a.count_today, d7: acc.d7 + a.count_7d, allTime: acc.allTime + a.count_all_time,
    net: acc.net + a.association_net_all_time, fee: acc.fee + a.sp_fee_all_time,
    released: acc.released + (a.released || 0), viewed: acc.viewed + (a.viewed || 0),
  }), { today: 0, d7: 0, allTime: 0, net: 0, fee: 0, released: 0, viewed: 0 });
  const money = (cents) => `$${(cents / 100).toFixed(2)}`;
  // Two different conversion questions worth telling apart: purchase rate
  // (of everyone this went out to, how many bought) is a pricing/value signal;
  // close rate (of everyone who actually opened it, how many bought) isolates
  // the report itself -- a low close rate with a decent view rate points at
  // the report's content or price, not the outreach email.
  const pct = (num, denom) => (denom > 0 ? `${Math.round((num / denom) * 100)}%` : "—");

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <div className="font-semibold text-gray-900">Development Report Sales</div>
          <div className="text-xs text-gray-400">Every Development Report purchase, by association — this used to only be visible in Stripe</div>
        </div>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>
      {!data && loading && <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>}
      {data && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Association</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Today</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Last 7 Days</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">All Time</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" title="Reports actually emailed to a parent (send-reports has gone out)">Released</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" title="Purchased ÷ Released — of every report sent out, how many got bought">Purchase Rate</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" title="Free-preview page opened at all">Viewed</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" title="Purchased ÷ Viewed — of everyone who actually opened it, how many bought">Close Rate</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Association Net</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Your Fee</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Who</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {associations.length === 0 && <tr><td colSpan={10} className="py-10 text-center text-gray-400 text-sm">No report purchases yet</td></tr>}
              {associations.map(a => (
                <tr key={a.organization_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.org_name}</td>
                  <td className="px-4 py-3 text-center">{a.count_today || "-"}</td>
                  <td className="px-4 py-3 text-center">{a.count_7d || "-"}</td>
                  <td className="px-4 py-3 text-center font-semibold">{a.count_all_time}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{a.released || "-"}</td>
                  <td className="px-4 py-3 text-center font-semibold">{pct(a.count_all_time, a.released)}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{a.viewed || "-"}</td>
                  <td className="px-4 py-3 text-center font-semibold">{pct(a.count_all_time, a.viewed)}</td>
                  <td className="px-4 py-3 text-right">{money(a.association_net_all_time)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700">{money(a.sp_fee_all_time)}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setViewOrg({ organization_id: a.organization_id, org_name: a.org_name })} className="text-xs font-semibold text-blue-600 hover:underline">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {associations.length > 0 && (
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td className="px-4 py-3 font-semibold text-gray-700">Total</td>
                  <td className="px-4 py-3 text-center font-semibold">{totals.today || "-"}</td>
                  <td className="px-4 py-3 text-center font-semibold">{totals.d7 || "-"}</td>
                  <td className="px-4 py-3 text-center font-bold">{totals.allTime}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{totals.released || "-"}</td>
                  <td className="px-4 py-3 text-center font-semibold">{pct(totals.allTime, totals.released)}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{totals.viewed || "-"}</td>
                  <td className="px-4 py-3 text-center font-semibold">{pct(totals.allTime, totals.viewed)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{money(totals.net)}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-700">{money(totals.fee)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {viewOrg && <ReportPurchasersModal org={viewOrg} onClose={() => setViewOrg(null)} />}
    </div>
  );
}

// Who-purchased drill-down for one association -- an SP admin sometimes needs
// this (a family asking "did I already buy this?", reconciling a payout), but
// it doesn't belong inline in the summary table above, so it's a click away.
function ReportPurchasersModal({ org, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/organizations/${org.organization_id}/report-purchases`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData({ purchases: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [org.organization_id]);

  const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;
  const purchases = data?.purchases || [];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="font-semibold text-gray-900">Who's purchased — {org.org_name}</div>
            <div className="text-xs text-gray-400">Every real Development Report sale, most recent first</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto p-5">
          {loading ? (
            <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
          ) : purchases.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">No report purchases yet</div>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
              {purchases.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-ink font-medium truncate">{p.athlete_name}</p>
                    <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-accent-soft text-accent text-[11px] font-semibold rounded truncate max-w-full">{p.category_name || "Unknown age group"}</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-semibold ${p.status === "completed" ? "text-ink" : "text-gray-400"}`}>{money(p.amount_cents)}</p>
                    <p className="text-xs text-gray-400">{p.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="font-semibold text-gray-900 mb-1">Report Sales Digest</div>
          <p className="text-xs text-gray-500 mb-4">Yesterday's Development Report sales, by association. Sends automatically every morning.</p>
          <button onClick={() => run("report_sales_digest_now")} disabled={loading === "report_sales_digest_now"} className="w-full py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {loading === "report_sales_digest_now" ? "Sending..." : "Send Sales Digest Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
