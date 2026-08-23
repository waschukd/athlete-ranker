"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Star, Ban, MessageSquare, Plus, Upload } from "lucide-react";
import { downloadContactsCsv } from "@/lib/spDashboardUtils";
import { OpenSpotsTracker } from "@/components/service-provider/OverviewWidgets";
import SetRatesModal from "@/components/service-provider/SetRatesModal";
import { ComposeMessageModal } from "@/components/service-provider/Messaging";

// Inline SP-private tester staffing on a testing row: signed-up / needed, editable.
export function TesterStaffingControl({ entry, spUrl, onSaved, onOpenRoster }) {
  const [val, setVal] = useState(String(entry.testers_required ?? 0));
  const [saving, setSaving] = useState(false);
  const signed = parseInt(entry.testers_signed_up || 0);
  const req = parseInt(val) || 0;
  const short = req > 0 && signed < req;
  const save = async () => {
    if (req === parseInt(entry.testers_required || 0)) return;
    setSaving(true);
    await fetch(spUrl("/api/service-provider/schedule"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_testers_required", schedule_id: entry.schedule_id, testers_required: req }) });
    setSaving(false);
    onSaved?.();
  };
  const [notified, setNotified] = useState(false);
  const notify = async () => {
    await fetch(spUrl("/api/service-provider/notify"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "notify_testers", schedule_id: entry.schedule_id }) });
    setNotified(true); setTimeout(() => setNotified(false), 2500);
  };
  return (
    <div className="text-center">
      <div className={`text-sm font-bold ${short ? "text-amber-600" : signed > 0 ? "text-green-600" : "text-gray-400"}`}>
        <button type="button" onClick={onOpenRoster} title="See who's signed up to test this session" className="underline decoration-dotted underline-offset-2 hover:opacity-70">{signed}</button>/<input type="number" min="0" value={val} onChange={e => setVal(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} className="w-9 text-center bg-transparent border-b border-gray-200 focus:outline-none focus:border-accent" />
      </div>
      <button type="button" onClick={onOpenRoster} className="text-xs text-gray-400 underline decoration-dotted underline-offset-2 hover:opacity-70">testers</button>
      {short && <button onClick={notify} className="mt-1 text-[11px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full hover:bg-amber-200 font-medium">{notified ? "Notified ✓" : "Notify testers"}</button>}
    </div>
  );
}

// Testing crew management — mirrors the evaluator pool, but a separate pool that
// associations never see. Testers join via a tester-flavoured code; the SP can
// approve a tester as an evaluator (one-directional) or remove them.
export default function TestersTab({ spUrl, spName, openSpots, sessionsNeeding }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["sp-testers"],
    queryFn: async () => { const r = await fetch(spUrl("/api/service-provider/testers")); return r.json(); },
  });
  const testers = data?.testers || [];
  const codes = data?.codes || [];
  const activeCode = codes.find(c => c.uses < c.max_uses);
  const meIsTester = !!data?.me?.is_tester;
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null);
  const [showSetRates, setShowSetRates] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const [actErr, setActErr] = useState(null);
  const act = async (body) => {
    setBusy(true); setActErr(null);
    try {
      const res = await fetch(spUrl("/api/service-provider/testers"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) setActErr(d.error || "Couldn't save — please refresh and try again.");
    } catch { setActErr("Network error — please try again."); }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["sp-testers"] });
  };
  const signupUrl = activeCode ? `${typeof window !== "undefined" ? window.location.origin : ""}/evaluator/signup?code=${activeCode.code}` : "";

  const sendInvite = async () => {
    if (!activeCode) { setInviteMsg({ type: "error", text: "Generate a join code first" }); return; }
    const emails = inviteEmail.split(/[\s,;]+/).map(e => e.trim()).filter(Boolean);
    if (!emails.length) { setInviteMsg({ type: "error", text: "Add at least one email" }); return; }
    setInviteSending(true); setInviteMsg(null);
    const res = await fetch(spUrl("/api/service-provider/notify"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite_testers", emails, signup_url: signupUrl, sp_name: spName }) });
    const d = await res.json().catch(() => ({}));
    setInviteSending(false);
    if (d.success) { setInviteMsg({ type: "success", text: d.message || `Sent ${d.sent} invites` }); setInviteEmail(""); }
    else setInviteMsg({ type: "error", text: d.error || "Failed to send" });
  };

  return (
    <div className="space-y-6">
      <OpenSpotsTracker open={openSpots} sessions={sessionsNeeding} noun="tester" />

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Your testing crew</h3>
            <p className="text-xs text-gray-400 mt-0.5">Testers run your objective testing sessions — a separate pool from evaluators that associations never see. Approve a tester as an evaluator once they're ready; it doesn't work the other way around.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer flex-shrink-0">
            <button onClick={() => act({ action: "set_self_tester", on: !meIsTester })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${meIsTester ? "bg-[#0b5cd6]" : "bg-gray-200"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${meIsTester ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            I'm a tester too
          </label>
        </div>
        {actErr && <p className="text-xs text-red-500 mt-2">{actErr}</p>}
        {meIsTester && <p className="text-xs text-accent mt-2">You're in the tester pool — head to your <a href="/tester/dashboard" className="underline font-medium">tester dashboard</a> to sign up for testing sessions (or use the role switcher in the top bar).</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-900">Testers ({testers.length})</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSetRates(true)} className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-ink bg-white rounded-lg text-sm font-semibold hover:bg-gray-50">$ Set rates</button>
            <button
              onClick={() => downloadContactsCsv(testers, "tester-contacts.csv")}
              title="Download name, email, phone and status for your testers"
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-ink bg-white rounded-lg text-sm font-semibold hover:bg-gray-50">
              <Upload size={14} className="rotate-180" /> Export contacts
            </button>
            <button onClick={() => setComposeOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90"><MessageSquare size={14} /> Message all testers</button>
          </div>
        </div>
        {testers.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">No testers yet — share your join code above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr><th className="text-left px-5 py-2.5">Name</th><th className="text-left px-4 py-2.5">Email</th><th className="text-left px-4 py-2.5">Rate</th><th className="text-left px-4 py-2.5">Upcoming</th><th className="text-right px-5 py-2.5">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {testers.map(t => (
                  <tr key={t.id}>
                    <td className="px-5 py-3 font-medium text-ink">{t.name}{t.status === "pending" && <span className="ml-2 text-[11px] px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full font-semibold">Pending</span>}{t.is_evaluator && <span className="ml-2 text-[11px] px-2 py-0.5 bg-accent-soft text-accent rounded-full font-semibold">Also evaluator</span>}</td>
                    <td className="px-4 py-3 text-gray-500">{t.email}</td>
                    <td className="px-4 py-3 text-gray-600 tabular-nums">{t.tester_hourly_rate != null ? `$${t.tester_hourly_rate}/hr` : <span className="text-gray-300">—</span>}{t.is_evaluator && t.eval_hourly_rate != null && <span className="ml-1 text-[10px] text-gray-400">(eval ${t.eval_hourly_rate})</span>}</td>
                    <td className="px-4 py-3 text-gray-600 tabular-nums">{t.upcoming_signups || 0}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {t.status === "pending" && <button onClick={() => act({ action: "approve", tester_id: t.id })} className="text-xs px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium mr-2 inline-flex items-center gap-1"><CheckCircle size={12} /> Approve</button>}
                      {t.status !== "pending" && !t.is_evaluator && <button onClick={() => { if (confirm(`Approve ${t.name} as an evaluator? They'll be able to sign up for evaluation sessions too.`)) act({ action: "promote", tester_id: t.id }); }} className="text-xs px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium mr-2 inline-flex items-center gap-1"><Star size={12} /> Approve as evaluator</button>}
                      <button onClick={() => { if (confirm(`Remove ${t.name} from your testers?`)) act({ action: "remove", tester_id: t.id }); }} className="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 inline-flex items-center gap-1"><Ban size={12} /> Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add testers — join code & email invites, tucked below the crew */}
      <details className="group bg-white border border-gray-200 rounded-xl overflow-hidden">
        <summary className="px-5 py-4 cursor-pointer list-none flex items-center justify-between hover:bg-gray-50">
          <span className="text-sm font-semibold text-gray-900">Add testers — join code &amp; email invites</span>
          <span className="text-gray-400 text-xs group-open:hidden">Show</span>
          <span className="text-gray-400 text-xs hidden group-open:inline">Hide</span>
        </summary>
        <div className="border-t border-gray-100 p-5 space-y-6">
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Tester Join Code</h3>
              <button onClick={() => act({ action: "generate_code" })} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-50"><Plus size={15} /> New code</button>
            </div>
            <div className="p-5">
              {!activeCode ? (
                <p className="text-sm text-gray-400">Generate a code, then share the signup link so your testers can join.</p>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <code className="text-lg font-mono font-bold text-[#0b5cd6] bg-[#e8f0fd] px-3 py-1.5 rounded-lg tracking-wider">{activeCode.code}</code>
                  <span className="text-xs text-gray-400">{activeCode.uses}/{activeCode.max_uses} used</span>
                  <button onClick={() => { navigator.clipboard.writeText(signupUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5">{copied ? <><CheckCircle size={13} className="text-green-600" /> Copied</> : "Copy signup link"}</button>
                  <button onClick={() => { if (confirm("Deactivate this code?")) act({ action: "deactivate_code", code_id: activeCode.id }); }} className="text-xs px-3 py-1.5 border border-red-100 text-red-400 rounded-lg hover:bg-red-50">Deactivate</button>
                </div>
              )}
            </div>
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Invite Testers by Email</h3><p className="text-xs text-gray-400 mt-0.5">Paste one or many — separated by commas, spaces, or new lines. Each gets their own invite.</p></div>
            <div className="p-5">
              <textarea rows={3} placeholder={"tester1@example.com, tester2@example.com\ntester3@example.com"} value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30 resize-y" />
              <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
                <span className="text-xs text-gray-400">{inviteEmail.split(/[\s,;]+/).map(e => e.trim()).filter(Boolean).length} email{inviteEmail.split(/[\s,;]+/).map(e => e.trim()).filter(Boolean).length === 1 ? "" : "s"}</span>
                <button disabled={!inviteEmail.trim() || inviteSending} onClick={sendInvite} className="px-5 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-40 whitespace-nowrap">{inviteSending ? "Sending…" : "Send Invites"}</button>
              </div>
              {inviteMsg && <p className={`text-xs font-medium mt-2 ${inviteMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>{inviteMsg.text}</p>}
              {!activeCode && <p className="text-xs text-gray-400 mt-2">Generate a join code above first — invites use it.</p>}
            </div>
          </div>
        </div>
      </details>

      {showSetRates && (
        <SetRatesModal
          evaluators={testers}
          postUrl={spUrl("/api/service-provider/testers")}
          idKey="tester_id"
          rateKey="tester_hourly_rate"
          title="Tester hourly rates"
          noun="tester"
          onClose={() => setShowSetRates(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["sp-testers"] })}
        />
      )}
      {composeOpen && (
        <ComposeMessageModal
          recipient={{ to_all_testers: true, noun: "tester", label: "To everyone in your tester pool" }}
          onClose={() => setComposeOpen(false)}
        />
      )}
    </div>
  );
}
