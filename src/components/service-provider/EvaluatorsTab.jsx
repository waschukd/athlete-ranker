"use client";

import { useState, useMemo } from "react";
import { X, MessageSquare, Upload, BookOpen } from "lucide-react";
import { downloadContactsCsv } from "@/lib/spDashboardUtils";
import { OpenSpotsTracker } from "@/components/service-provider/OverviewWidgets";
import { JoinCodesPanel } from "@/components/service-provider/AssociationWidgets";
import SetRatesModal from "@/components/service-provider/SetRatesModal";
import { ComposeMessageModal, MessagesSection } from "@/components/service-provider/Messaging";

const EVAL_PAGE_SIZE = 25;

export default function EvaluatorsTab({
  evaluators, flags, pendingHours, evaluatorOpenSpots, evaluatorSessionsNeeding,
  spUrl, orgParam, sp, queryClient, joinCodeData, refetchCodes,
}) {
  const [evalInviteEmail, setEvalInviteEmail] = useState("");
  const [evalInviteSending, setEvalInviteSending] = useState(false);
  const [evalInviteMsg, setEvalInviteMsg] = useState(null);
  const [selHours, setSelHours] = useState([]);
  const [selFlags, setSelFlags] = useState([]);
  const [selEvals, setSelEvals] = useState([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [evalSearch, setEvalSearch] = useState("");
  const [evalStatusFilter, setEvalStatusFilter] = useState("all");
  const [evalPage, setEvalPage] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [bulkDeleteMsg, setBulkDeleteMsg] = useState(null);
  const [composeRecipient, setComposeRecipient] = useState(null); // { to_all_pool } | { to_user_ids, label }
  const [showSetRates, setShowSetRates] = useState(false);
  const [ratesSavedMsg, setRatesSavedMsg] = useState(false);

  const bulkAction = async (payload) => {
    const res = await fetch(spUrl("/api/service-provider/evaluators"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBulkDeleteMsg(`⚠️ ${data.error || "Action failed"}`); return null; }
    return data;
  };

  const filteredEvaluators = useMemo(() => {
    const q = evalSearch.trim().toLowerCase();
    return evaluators.filter(ev => {
      if (q && !(ev.name?.toLowerCase().includes(q) || ev.email?.toLowerCase().includes(q))) return false;
      if (evalStatusFilter === "pending" && ev.membership_status !== "pending") return false;
      if (evalStatusFilter === "active" && (ev.membership_status === "pending" || ev.membership_status === "suspended")) return false;
      if (evalStatusFilter === "suspended" && ev.membership_status !== "suspended") return false;
      return true;
    });
  }, [evaluators, evalSearch, evalStatusFilter]);

  const evalTotalPages = Math.max(1, Math.ceil(filteredEvaluators.length / EVAL_PAGE_SIZE));
  const evalPageSafe = Math.min(evalPage, evalTotalPages);
  const pagedEvaluators = useMemo(() => {
    const start = (evalPageSafe - 1) * EVAL_PAGE_SIZE;
    return filteredEvaluators.slice(start, start + EVAL_PAGE_SIZE);
  }, [filteredEvaluators, evalPageSafe]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Evaluator Pool</h2>
        <div className="flex items-center gap-3">
          {flags.length > 0 && <span className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-full">{flags.length} open flags</span>}
          {pendingHours.length > 0 && <span className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full">{pendingHours.length} pending hours</span>}
          <a href="/service-provider/dashboard/scoring-guide" className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-ink bg-white rounded-lg text-sm font-semibold hover:bg-gray-50">
            <BookOpen size={14} /> Scoring guide
          </a>
          <button onClick={() => setShowSetRates(true)} className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-ink bg-white rounded-lg text-sm font-semibold hover:bg-gray-50">
            $ Set rates
          </button>
          <button
            onClick={() => downloadContactsCsv(filteredEvaluators.length ? filteredEvaluators : evaluators, "evaluator-contacts.csv")}
            title="Download name, email, phone and status for the evaluators currently shown"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-ink bg-white rounded-lg text-sm font-semibold hover:bg-gray-50">
            <Upload size={14} className="rotate-180" /> Export contacts
          </button>
          <button onClick={() => setComposeRecipient({ to_all_pool: true, label: "To everyone in your evaluator pool" })} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90">
            <MessageSquare size={14} /> Message all pool
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Invite Evaluators by Email</h3>
          <p className="text-xs text-gray-400 mt-0.5">Paste one or many — separated by commas, spaces, or new lines. Each gets their own invite.</p>
        </div>
        <div className="p-5">
          <textarea rows={3} placeholder={"evaluator1@example.com, evaluator2@example.com\nevaluator3@example.com"} value={evalInviteEmail} onChange={e => setEvalInviteEmail(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30 resize-y" />
          <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
            <span className="text-xs text-gray-400">{evalInviteEmail.split(/[\s,;]+/).map(e => e.trim()).filter(Boolean).length} email{evalInviteEmail.split(/[\s,;]+/).map(e => e.trim()).filter(Boolean).length === 1 ? "" : "s"}</span>
            <button disabled={!evalInviteEmail.trim() || evalInviteSending}
              onClick={async () => {
                const activeCode = joinCodeData?.codes?.find(c => c.uses < c.max_uses);
                if (!activeCode) { setEvalInviteMsg({ type: "error", text: "Generate a join code first" }); return; }
                const emails = evalInviteEmail.split(/[\s,;]+/).map(e => e.trim()).filter(Boolean);
                if (!emails.length) { setEvalInviteMsg({ type: "error", text: "Add at least one email" }); return; }
                setEvalInviteSending(true); setEvalInviteMsg(null);
                const signupUrl = `${window.location.origin}/evaluator/signup?code=${activeCode.code}`;
                const res = await fetch("/api/service-provider/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite_evaluators", emails, signup_url: signupUrl, sp_name: sp?.name }) });
                const data = await res.json();
                setEvalInviteSending(false);
                if (data.success) { setEvalInviteMsg({ type: "success", text: data.message || `Sent ${data.sent} invites` }); setEvalInviteEmail(""); }
                else { setEvalInviteMsg({ type: "error", text: data.error || "Failed" }); }
              }}
              className="px-5 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-40 whitespace-nowrap">
              {evalInviteSending ? "Sending..." : "Send Invites"}
            </button>
          </div>
          {evalInviteMsg && <p className={`text-xs font-medium mt-2 ${evalInviteMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>{evalInviteMsg.text}</p>}
        </div>
      </div>

      <OpenSpotsTracker open={evaluatorOpenSpots} sessions={evaluatorSessionsNeeding} noun="evaluator" />

      {bulkDeleteMsg && (() => {
        const isErr = bulkDeleteMsg.startsWith("⚠️");
        return (
          <div className={`rounded-xl px-4 py-3 flex items-center justify-between text-sm ${isErr ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
            <span>{bulkDeleteMsg}</span>
            <button onClick={() => setBulkDeleteMsg(null)} className={isErr ? "text-red-600 hover:text-red-800" : "text-green-600 hover:text-green-800"}><X size={14} /></button>
          </div>
        );
      })()}

      {ratesSavedMsg && (
        <div className="rounded-xl px-4 py-3 flex items-center justify-between text-sm bg-green-50 border border-green-200 text-green-700">
          <span>Rates saved.</span>
          <button onClick={() => setRatesSavedMsg(false)} className="text-green-600 hover:text-green-800"><X size={14} /></button>
        </div>
      )}

      {flags.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-red-800">Performance Flags</h3>
            {selFlags.length > 0 && (
              <button onClick={async () => { const data = await bulkAction({ action: "dismiss_flag", flag_ids: selFlags }); if (!data) return; setSelFlags([]); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); }} className="text-xs px-3 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium">Dismiss selected ({selFlags.length})</button>
            )}
          </div>
          <div className="space-y-2">
            {flags.map(flag => (
              <div key={flag.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-red-100">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={selFlags.includes(flag.id)} onChange={e => setSelFlags(e.target.checked ? [...selFlags, flag.id] : selFlags.filter(id => id !== flag.id))} className="rounded border-gray-300" />
                  <div>
                  <span className="font-medium text-gray-900 text-sm">{flag.evaluator_name}</span>
                  <span className="mx-2 text-gray-300">-</span>
                  <span className="text-xs text-gray-500">{flag.org_name} S{flag.session_number}</span>
                  <span className="mx-2 text-gray-300">-</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{flag.flag_type.replace(/_/g, " ")}</span>
                  </div>
                </div>
                <button onClick={async () => { await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss_flag", flag_id: flag.id }) }); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); }} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 hover:bg-gray-100 rounded">Dismiss</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingHours.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-amber-800">Pending Hours Approval</h3>
            {selHours.length > 0 && (
              <button onClick={async () => { const data = await bulkAction({ action: "approve_hours", hours_ids: selHours }); if (!data) return; setSelHours([]); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); }} className="text-xs px-3 py-1.5 bg-green-100 text-green-700 border border-green-200 rounded-lg hover:bg-green-200 font-medium">Approve selected ({selHours.length})</button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100"><tr><th className="px-4 py-2 text-center w-10"><input type="checkbox" checked={pendingHours.length > 0 && selHours.length === pendingHours.length} onChange={e => setSelHours(e.target.checked ? pendingHours.map(h => h.id) : [])} className="rounded border-gray-300" /></th><th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Evaluator</th><th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Session</th><th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Hours</th><th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Action</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {pendingHours.map(h => (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={selHours.includes(h.id)} onChange={e => setSelHours(e.target.checked ? [...selHours, h.id] : selHours.filter(id => id !== h.id))} className="rounded border-gray-300" /></td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{h.evaluator_name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{h.org_name} - {h.category_name} S{h.session_number}</td>
                  <td className="px-4 py-2.5 text-center font-bold text-gray-900">{parseFloat(h.hours_worked).toFixed(1)}h</td>
                  <td className="px-4 py-2.5 text-center"><button onClick={async () => { await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve_hours", hours_id: h.id }) }); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); }} className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200 font-medium">Approve</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MessagesSection />

      {selEvals.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-700 mr-1">{selEvals.length} selected</span>
          <button onClick={async () => { const data = await bulkAction({ action: "approve", evaluator_ids: selEvals }); if (!data) return; setSelEvals([]); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); }} className="text-xs px-3 py-1.5 bg-green-100 text-green-700 border border-green-200 rounded-lg hover:bg-green-200 font-medium">Approve ({selEvals.length})</button>
          <button onClick={async () => { if (confirm('Suspend ' + selEvals.length + ' evaluators?')) { const data = await bulkAction({ action: "suspend", evaluator_ids: selEvals }); if (!data) return; setSelEvals([]); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); } }} className="text-xs px-3 py-1.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-100 font-medium">Suspend ({selEvals.length})</button>
          <button onClick={() => setComposeRecipient({ to_user_ids: [...selEvals], label: `To ${selEvals.length} selected evaluator${selEvals.length === 1 ? "" : "s"}` })} className="text-xs px-3 py-1.5 bg-accent-soft text-accent border border-accent/20 rounded-lg hover:opacity-90 font-medium inline-flex items-center gap-1.5"><MessageSquare size={12} /> Message selected ({selEvals.length})</button>
          <button onClick={() => { setBulkDeleteMsg(null); setShowBulkDelete(true); }} className="text-xs px-3 py-1.5 bg-red-50 text-red-500 border border-red-200 rounded-lg hover:bg-red-100 font-medium">Delete ({selEvals.length})</button>
        </div>
      )}

      {/* Search + status filter toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search by name or email…"
            value={evalSearch}
            onChange={e => { setEvalSearch(e.target.value); setEvalPage(1); }}
            className="w-full border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          {evalSearch && (
            <button onClick={() => { setEvalSearch(""); setEvalPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 gap-0.5">
          {[{ id: "all", label: "All" }, { id: "pending", label: "Pending" }, { id: "active", label: "Active" }, { id: "suspended", label: "Suspended" }].map(s => (
            <button
              key={s.id}
              onClick={() => { setEvalStatusFilter(s.id); setEvalPage(1); }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${evalStatusFilter === s.id ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {(evalSearch || evalStatusFilter !== "all") && (
          <span className="text-xs text-gray-400 whitespace-nowrap">{filteredEvaluators.length} of {evaluators.length}</span>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-center w-10"><input type="checkbox" checked={filteredEvaluators.length > 0 && filteredEvaluators.every(ev => selEvals.includes(ev.id))} onChange={e => setSelEvals(e.target.checked ? filteredEvaluators.map(ev => ev.id) : selEvals.filter(id => !filteredEvaluators.find(ev => ev.id === id)))} className="rounded border-gray-300" /></th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Evaluator</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sessions</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Hours</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pending</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Rating</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredEvaluators.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-gray-400 text-sm">{evaluators.length === 0 ? "No evaluators in pool yet" : "No evaluators match your search"}</td></tr>
            ) : pagedEvaluators.map(ev => (
              <tr key={ev.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-center"><input type="checkbox" checked={selEvals.includes(ev.id)} onClick={e => e.stopPropagation()} onChange={e => setSelEvals(e.target.checked ? [...selEvals, ev.id] : selEvals.filter(id => id !== ev.id))} className="rounded border-gray-300" /></td>
                <td className="px-4 py-3 cursor-pointer" onClick={() => window.location.href = `/service-provider/evaluator/${ev.id}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 hover:text-[#0b5cd6]">{ev.name}</span>
                    {ev.membership_status === "pending" && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">Pending</span>}
                    {ev.membership_status === "suspended" && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">Suspended</span>}
                  </div>
                  <div className="text-xs text-gray-400">{ev.email}</div>
                </td>
                <td className="px-4 py-3 text-center text-gray-700">{ev.total_sessions || 0}</td>
                <td className="px-4 py-3 text-center font-semibold text-gray-900">{parseFloat(ev.total_hours || 0).toFixed(1)}h</td>
                <td className="px-4 py-3 text-center">{parseFloat(ev.pending_hours || 0) > 0 ? <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">{parseFloat(ev.pending_hours).toFixed(1)}h</span> : "-"}</td>
                <td className="px-4 py-3 text-center">{parseFloat(ev.avg_rating || 0) > 0 ? `${parseFloat(ev.avg_rating).toFixed(1)} *` : "-"}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {ev.membership_status === "pending" && <button onClick={async (e) => { e.stopPropagation(); await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", evaluator_id: ev.id }) }); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); }} className="text-xs px-2 py-1 bg-green-100 text-green-700 border border-green-200 rounded-lg hover:bg-green-200">Approve</button>}
                    {ev.membership_status !== "suspended" ? <button onClick={async (e) => { e.stopPropagation(); if (confirm(`Suspend ${ev.name}?`)) { await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "suspend", evaluator_id: ev.id }) }); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); } }} className="text-xs px-2 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-100">Suspend</button> : <button onClick={async (e) => { e.stopPropagation(); await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reinstate", evaluator_id: ev.id }) }); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); }} className="text-xs px-2 py-1 bg-green-50 text-green-600 border border-green-200 rounded-lg hover:bg-green-100">Reinstate</button>}
                    <button onClick={async (e) => { e.stopPropagation(); if (confirm(`Delete ${ev.name}?`)) { const res = await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_account", evaluator_id: ev.id }) }); const data = await res.json(); if (data.error) alert(data.error); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); } }} className="text-xs px-2 py-1 bg-red-50 text-red-500 border border-red-200 rounded-lg hover:bg-red-100">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {filteredEvaluators.length > EVAL_PAGE_SIZE && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-4">
            <span className="text-xs text-gray-500">
              {(evalPageSafe - 1) * EVAL_PAGE_SIZE + 1}–{Math.min(evalPageSafe * EVAL_PAGE_SIZE, filteredEvaluators.length)} of {filteredEvaluators.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={evalPageSafe <= 1}
                onClick={() => setEvalPage(p => Math.max(1, p - 1))}
                className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="text-xs text-gray-500 font-medium">{evalPageSafe} / {evalTotalPages}</span>
              <button
                disabled={evalPageSafe >= evalTotalPages}
                onClick={() => setEvalPage(p => Math.min(evalTotalPages, p + 1))}
                className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Join codes only — the email-invite panel now lives at the top of the tab */}
      <details className="group bg-white border border-gray-200 rounded-xl overflow-hidden">
        <summary className="px-5 py-4 cursor-pointer list-none flex items-center justify-between hover:bg-gray-50">
          <span className="text-sm font-semibold text-gray-900">Add evaluators — join codes</span>
          <span className="text-gray-400 text-xs group-open:hidden">Show</span>
          <span className="text-gray-400 text-xs hidden group-open:inline">Hide</span>
        </summary>
        <div className="border-t border-gray-100 p-5 space-y-6">
          <JoinCodesPanel orgId={sp?.id} data={joinCodeData} refetch={refetchCodes} />
        </div>
      </details>

      {showBulkDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">Delete {selEvals.length} evaluators?</h3>
              <button onClick={() => { setShowBulkDelete(false); setDeleteConfirm(""); }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">This permanently deletes the selected accounts. Any evaluator with session history will be skipped automatically.</p>
            <input type="text" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="type DELETE to confirm" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-4" />
            {bulkDeleteMsg && <p className="text-xs font-medium text-gray-600 mb-3">{bulkDeleteMsg}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setShowBulkDelete(false); setDeleteConfirm(""); }} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Cancel</button>
              <button
                disabled={deleteConfirm !== "DELETE"}
                onClick={async () => {
                  const data = await bulkAction({ action: "delete_account", evaluator_ids: selEvals });
                  if (!data) return;
                  setSelEvals([]); setShowBulkDelete(false); setDeleteConfirm("");
                  setBulkDeleteMsg(`${data.deleted} deleted, ${data.skipped} skipped`);
                  queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] });
                }}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showSetRates && (
        <SetRatesModal
          evaluators={evaluators.filter(ev => ev.membership_status !== "deleted" && ev.membership_status !== "suspended")}
          onClose={() => setShowSetRates(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["sp-evaluators", orgParam] });
            setRatesSavedMsg(true);
            setTimeout(() => setRatesSavedMsg(false), 4000);
          }}
        />
      )}

      {composeRecipient && (
        <ComposeMessageModal
          recipient={composeRecipient}
          onClose={() => setComposeRecipient(null)}
          onSent={() => { setSelEvals([]); queryClient.invalidateQueries({ queryKey: ["sp-messages"] }); }}
        />
      )}
    </div>
  );
}
