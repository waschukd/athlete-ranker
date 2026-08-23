"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// SP-wide payroll — what we owe every tester/evaluator across the whole SP, split
// by testing vs evaluation, with bulk approve / mark-paid per person.
export default function PayrollTab({ spUrl }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["sp-payroll"],
    queryFn: async () => { const r = await fetch(spUrl("/api/service-provider/payroll")); return r.json(); },
  });
  const [busy, setBusy] = useState(null);
  const act = async (user_id, action) => {
    setBusy(`${action}-${user_id}`);
    try { await fetch(spUrl("/api/service-provider/payroll"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id, action }) }); } catch {}
    setBusy(null);
    qc.invalidateQueries({ queryKey: ["sp-payroll"] });
  };
  const people = data?.people || [];
  const totals = data?.totals || { owed: 0, pending: 0, paid: 0 };
  const $ = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const hrs = (h) => `${Number(h || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}h`;
  const roleTag = (p) => p.is_evaluator && p.is_tester ? "Eval + Tester" : p.is_tester ? "Tester" : "Evaluator";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Owed now (approved, unpaid)", value: totals.owed, tone: "text-amber-600" },
          { label: "Awaiting approval", value: totals.pending, tone: "text-gray-600" },
          { label: "Paid to date", value: totals.paid, tone: "text-green-600" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className={`text-2xl font-bold ${s.tone}`}>{$(s.value)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Payroll by person</h3><p className="text-xs text-gray-400 mt-0.5">Testing hours pay at the testing rate, evaluation hours at the evaluation rate — across all your associations and testing events.</p></div>
        {isLoading ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : people.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">No hours yet. Once your people work sessions, what you owe shows up here.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-5 py-2.5">Name</th>
                  <th className="text-left px-4 py-2.5">Testing</th>
                  <th className="text-left px-4 py-2.5">Evaluation</th>
                  <th className="text-right px-4 py-2.5">Awaiting</th>
                  <th className="text-right px-4 py-2.5">Owed</th>
                  <th className="text-right px-5 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {people.map(p => (
                  <tr key={p.id}>
                    <td className="px-5 py-3"><div className="font-medium text-ink">{p.name}</div><div className="text-[11px] text-gray-400">{roleTag(p)}</div></td>
                    <td className="px-4 py-3 text-gray-600">{p.is_tester ? <>{hrs(p.testing_hours.pending + p.testing_hours.approved)} <span className="text-gray-400">@ {p.tester_rate != null ? `$${p.tester_rate}` : "—"}</span></> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600">{p.is_evaluator ? <>{hrs(p.eval_hours.pending + p.eval_hours.approved)} <span className="text-gray-400">@ {p.eval_rate != null ? `$${p.eval_rate}` : "—"}</span></> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-right text-gray-500 tabular-nums">{p.pending_amount ? $(p.pending_amount) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-right font-bold text-amber-600 tabular-nums">{p.owed ? $(p.owed) : <span className="text-gray-300 font-normal">—</span>}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {(p.testing_hours.pending || p.eval_hours.pending) ? <button onClick={() => act(p.id, "approve")} disabled={!!busy} className="text-xs px-3 py-1.5 bg-green-100 text-green-700 rounded-lg font-medium hover:bg-green-200 disabled:opacity-50 mr-2">{busy === `approve-${p.id}` ? "…" : "Approve"}</button> : null}
                      {p.owed ? <button onClick={() => { if (confirm(`Mark ${$(p.owed)} as paid to ${p.name}?`)) act(p.id, "mark_paid"); }} disabled={!!busy} className="text-xs px-3 py-1.5 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50">{busy === `mark_paid-${p.id}` ? "…" : "Mark paid"}</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
