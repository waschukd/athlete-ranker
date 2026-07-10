"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Building2, Calendar, LogOut, Clock, MapPin, CheckCircle, ExternalLink, X, Plus, CalendarDays, List, Pencil, Ban, RotateCcw, MessageSquare, Send, Reply, Inbox, AlertTriangle, Star, ArrowRight, Upload, Shield } from "lucide-react";
import SmartScheduleImport from "@/components/SmartScheduleImport";
import GoalieTemplateEditor from "@/components/GoalieTemplateEditor";
import { colorForOrg, buildOrgColorMap, OrgChip, OrgAvatar } from "@/lib/orgVisuals";
import { DateStripBar, MonthCalendar, WeekGrid } from "@/components/SessionDateNav";
import { useTrackPageView } from "@/lib/useAnalytics";
import ConfirmDialog from "@/components/ConfirmDialog";
import NotificationBell from "@/components/NotificationBell";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

// Today in the viewer's LOCAL timezone (UTC toISOString rolls over mid-evening).
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatDate(d) {
  if (!d) return "";
  const str = d.toString().split("T")[0];
  const [year, month, day] = str.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// Compact session line used on the Overview (home) tab for Today's / Upcoming lists.
function SessionRow({ s, showDate }) {
  const spots = s.spots_open;
  return (
    <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-gray-900 truncate">{s.org_name} · {s.category_name}</div>
        <div className="text-xs text-gray-400 flex items-center gap-2 flex-wrap mt-0.5">
          <span>S{s.session_number}{s.group_number ? ` · G${s.group_number}` : ""}</span>
          {showDate && <><span className="text-gray-300">·</span><span>{formatDate(s.scheduled_date)}</span></>}
          {s.start_time && <><span className="text-gray-300">·</span><span className="inline-flex items-center gap-1"><Clock size={11} />{formatTime(s.start_time)}{s.end_time ? `–${formatTime(s.end_time)}` : ""}</span></>}
          {s.location && <><span className="text-gray-300">·</span><span className="inline-flex items-center gap-1"><MapPin size={11} />{s.location}</span></>}
        </div>
      </div>
      {spots > 0
        ? <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium flex-shrink-0">{spots} spot{spots === 1 ? "" : "s"} open</span>
        : <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium flex-shrink-0">Staffed</span>}
      {!s.is_goalie_sp && <a href={`/checkin/${s.schedule_id}`} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 flex-shrink-0">Check-in</a>}
    </div>
  );
}

function JoinCodesPanel({ orgId, data, refetch }) {
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(null);
  const codes = data?.codes || [];
  const activeCodes = codes.filter(c => c.uses < c.max_uses);
  const generateCode = async () => {
    setGenerating(true);
    await fetch(`/api/organizations/${orgId}/join-codes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", max_uses: 100 }) });
    await refetch();
    setGenerating(false);
  };
  const copySignupLink = (code) => {
    navigator.clipboard.writeText(`${window.location.origin}/evaluator/signup?code=${code}`);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Evaluator Join Codes</h3>
          <p className="text-xs text-gray-400 mt-0.5">Share with evaluators so they can join</p>
        </div>
        <button onClick={generateCode} disabled={generating} className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-50">
          {generating ? "Generating..." : "+ Generate Code"}
        </button>
      </div>
      {activeCodes.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">No active codes. Generate one to start recruiting evaluators.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {activeCodes.map(code => (
            <div key={code.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg font-bold text-gray-900 tracking-widest bg-gray-50 px-3 py-1 rounded-lg border border-gray-200">{code.code}</span>
                <div className="text-xs text-gray-400">{code.uses} / {code.max_uses} uses</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => copySignupLink(code.code)} className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${copied === code.code ? "bg-green-100 text-green-700 border-green-200" : "bg-white text-gray-600 border-gray-200"}`}>
                  {copied === code.code ? "Copied!" : "Copy Signup Link"}
                </button>
                <button onClick={async () => { if (confirm("Deactivate this code?")) { await fetch(`/api/organizations/${orgId}/join-codes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deactivate", code_id: code.id }) }); refetch(); } }} className="text-xs px-3 py-1.5 border border-red-100 text-red-400 rounded-lg hover:bg-red-50">Deactivate</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Inline SP-private tester staffing on a testing row: signed-up / needed, editable.
function TesterStaffingControl({ entry, spUrl, onSaved }) {
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
        {signed}/<input type="number" min="0" value={val} onChange={e => setVal(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} className="w-9 text-center bg-transparent border-b border-gray-200 focus:outline-none focus:border-accent" />
      </div>
      <div className="text-xs text-gray-400">{saving ? "saving…" : "testers"}</div>
      {short && <button onClick={notify} className="mt-1 text-[11px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full hover:bg-amber-200 font-medium">{notified ? "Notified ✓" : "Notify testers"}</button>}
    </div>
  );
}

// Testing crew management — mirrors the evaluator pool, but a separate pool that
// associations never see. Testers join via a tester-flavoured code; the SP can
// approve a tester as an evaluator (one-directional) or remove them.
function TestersTab({ spUrl, spName }) {
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

  const act = async (body) => {
    setBusy(true);
    await fetch(spUrl("/api/service-provider/testers"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
        {meIsTester && <p className="text-xs text-accent mt-2">You're in the tester pool — head to your <a href="/tester/dashboard" className="underline font-medium">tester dashboard</a> to sign up for testing sessions (or use the role switcher in the top bar).</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Testers ({testers.length})</h3></div>
        {testers.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">No testers yet — share your join code above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr><th className="text-left px-5 py-2.5">Name</th><th className="text-left px-4 py-2.5">Email</th><th className="text-left px-4 py-2.5">Upcoming</th><th className="text-right px-5 py-2.5">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {testers.map(t => (
                  <tr key={t.id}>
                    <td className="px-5 py-3 font-medium text-ink">{t.name}{t.status === "pending" && <span className="ml-2 text-[11px] px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full font-semibold">Pending</span>}{t.is_evaluator && <span className="ml-2 text-[11px] px-2 py-0.5 bg-accent-soft text-accent rounded-full font-semibold">Also evaluator</span>}</td>
                    <td className="px-4 py-3 text-gray-500">{t.email}</td>
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
    const res = await fetch("/api/service-provider/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule_id: scheduleId, message }) });
    setResult(await res.json());
    setSending(false);
  };
  return (
    <>
      <button onClick={() => setShowModal(true)} className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-200 font-medium">Blast ({spotsOpen} open)</button>
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h3 className="font-bold text-gray-900 mb-1">Blast Evaluator Pool</h3>
            <p className="text-sm text-gray-500 mb-4">{spotsOpen} spot{spotsOpen !== 1 ? "s" : ""} need to be filled.</p>
            {result ? (
              <div className="text-center py-4">
                <p className="font-semibold text-gray-900 mb-2">{result.message}</p>
                <button onClick={() => { setShowModal(false); setResult(null); }} className="px-5 py-2 bg-[#0b5cd6] text-white rounded-lg text-sm">Done</button>
              </div>
            ) : (
              <>
                <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Optional message..." className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6] resize-none mb-4" rows={3} />
                <div className="flex gap-3">
                  <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm">Cancel</button>
                  <button onClick={sendBlast} disabled={sending} className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50">{sending ? "Sending..." : "Send Blast"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Shared modal shell for the schedule add/edit forms — Minimal Athletic look.
function ScheduleFormModal({ title, subtitle, form, setForm, showSessionGroup, busy, error, onSubmit, onClose, submitLabel }) {
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30";
  const labelCls = "text-xs font-medium text-gray-500 mb-1 block";
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-1">
          <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">{title}</h3>
          <button onClick={onClose} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-50"><X size={18} /></button>
        </div>
        {subtitle && <p className="text-xs text-gray-400 mb-4">{subtitle}</p>}
        <div className="space-y-3 mt-3">
          {showSessionGroup && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Session # *</label><input type="number" min="1" value={form.session_number} onChange={set("session_number")} className={inputCls} /></div>
              <div><label className={labelCls}>Group #</label><input type="number" min="1" value={form.group_number} onChange={set("group_number")} className={inputCls} /></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Date *</label><input type="date" value={form.scheduled_date} onChange={set("scheduled_date")} className={inputCls} /></div>
            <div>
              <label className={labelCls}>Day</label>
              <select value={form.day_of_week || ""} onChange={set("day_of_week")} className={inputCls}>
                <option value="">Auto</option>
                {DAYS_OF_WEEK.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Start time</label><input type="time" value={form.start_time || ""} onChange={set("start_time")} className={inputCls} /></div>
            <div><label className={labelCls}>End time</label><input type="time" value={form.end_time || ""} onChange={set("end_time")} className={inputCls} /></div>
          </div>
          <div><label className={labelCls}>Location</label><input type="text" placeholder="Arena / rink" value={form.location || ""} onChange={set("location")} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Player evaluators</label><input type="number" min="0" value={form.evaluators_required} onChange={set("evaluators_required")} className={inputCls} /></div>
            <div><label className={labelCls}>Goalie evaluators</label><input type="number" min="0" value={form.goalie_evaluators_required ?? 0} onChange={set("goalie_evaluators_required")} className={inputCls} /></div>
          </div>
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} disabled={busy} className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm disabled:opacity-50">Cancel</button>
            <button onClick={onSubmit} disabled={busy} className="flex-1 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40">{busy ? "Saving…" : submitLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Per-row schedule controls: Edit / Cancel / Reinstate, calling the per-category
// schedule endpoints. Reports back to the parent via onSaved (which refetches and
// shows the confirmation line). Self-contained so no existing state changes.
function ScheduleRowControls({ entry, onSaved }) {
  const catId = entry.age_category_id;
  const [showEdit, setShowEdit] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);

  const toTime = (t) => (t ? t.toString().slice(0, 5) : "");
  const openEdit = () => {
    setError(null);
    setForm({
      scheduled_date: entry.scheduled_date?.toString().split("T")[0] || "",
      day_of_week: entry.day_of_week || "",
      start_time: toTime(entry.start_time),
      end_time: toTime(entry.end_time),
      location: entry.location || "",
      evaluators_required: entry.evaluators_required ?? 4,
      goalie_evaluators_required: entry.goalie_evaluators_required ?? 0,
    });
    setShowEdit(true);
  };

  const submitEdit = async () => {
    setBusy(true); setError(null);
    const res = await fetch(`/api/categories/${catId}/schedule`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: entry.id,
        scheduled_date: form.scheduled_date,
        day_of_week: form.day_of_week || null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        location: form.location || null,
        evaluators_required: form.evaluators_required,
        goalie_evaluators_required: form.goalie_evaluators_required,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || data.error) { setError(data.error || "Failed to save"); return; }
    setShowEdit(false);
    onSaved();
  };

  const doCancel = async () => {
    setBusy(true);
    const res = await fetch(`/api/categories/${catId}/schedule?id=${entry.id}`, { method: "DELETE" });
    setBusy(false);
    setShowCancel(false);
    if (res.ok) onSaved();
  };

  const doRemove = async () => {
    setBusy(true);
    const res = await fetch(`/api/categories/${catId}/schedule?id=${entry.id}&hard=1`, { method: "DELETE" });
    setBusy(false);
    setShowRemove(false);
    if (res.ok) onSaved();
  };

  const doReinstate = async () => {
    setBusy(true);
    const res = await fetch(`/api/categories/${catId}/schedule`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, status: "scheduled" }),
    });
    setBusy(false);
    if (res.ok) onSaved();
  };

  const isCancelled = entry.status === "cancelled";

  return (
    <>
      <button onClick={openEdit} disabled={busy} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-50">
        <Pencil size={11} /> Edit
      </button>
      {isCancelled ? (
        <button onClick={doReinstate} disabled={busy} className="text-xs px-3 py-1.5 border border-green-200 text-green-700 bg-green-50 rounded-lg hover:bg-green-100 inline-flex items-center gap-1 disabled:opacity-50">
          <RotateCcw size={11} /> Reinstate
        </button>
      ) : (
        <button onClick={() => setShowCancel(true)} disabled={busy} className="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 inline-flex items-center gap-1 disabled:opacity-50">
          <Ban size={11} /> Cancel session
        </button>
      )}
      <button onClick={() => setShowRemove(true)} disabled={busy} title="Permanently remove this session" className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 hover:text-red-600 inline-flex items-center gap-1 disabled:opacity-50">
        <X size={12} /> Remove
      </button>

      <ConfirmDialog
        open={showRemove}
        title="Remove this session?"
        message="This permanently deletes the session and frees any signed-up evaluators. Use this when fixing or redoing a schedule. It can't be undone — to keep it on the books but call it off, use Cancel instead."
        confirmLabel="Remove permanently"
        cancelLabel="Keep session"
        busy={busy}
        onConfirm={doRemove}
        onCancel={() => setShowRemove(false)}
      />

      {showEdit && form && (
        <ScheduleFormModal
          title="Edit session"
          subtitle={`${entry.org_name} · ${entry.category_name} · S${entry.session_number}${entry.group_number ? ` G${entry.group_number}` : ""}`}
          form={form} setForm={setForm} showSessionGroup={false}
          busy={busy} error={error} onSubmit={submitEdit} onClose={() => setShowEdit(false)} submitLabel="Save changes"
        />
      )}

      <ConfirmDialog
        open={showCancel}
        title="Cancel this session?"
        message="The association admin, directors, and any signed-up evaluators will all be notified."
        confirmLabel="Cancel session"
        cancelLabel="Keep session"
        busy={busy}
        onConfirm={doCancel}
        onCancel={() => setShowCancel(false)}
      />
    </>
  );
}

// "Add session" affordance scoped to a single association/category context.
function AddSessionButton({ category, onSaved }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const blank = { session_number: "", group_number: "1", scheduled_date: "", day_of_week: "", start_time: "", end_time: "", location: "", evaluators_required: "4", goalie_evaluators_required: "0" };
  const [form, setForm] = useState(blank);

  const submit = async () => {
    if (!form.session_number || !form.scheduled_date) { setError("Session # and date are required."); return; }
    setBusy(true); setError(null);
    const res = await fetch(`/api/categories/${category.age_category_id}/schedule`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        add: {
          session_number: form.session_number,
          group_number: form.group_number || 1,
          scheduled_date: form.scheduled_date,
          day_of_week: form.day_of_week || null,
          start_time: form.start_time || null,
          end_time: form.end_time || null,
          location: form.location || null,
          evaluators_required: form.evaluators_required,
          goalie_evaluators_required: form.goalie_evaluators_required,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || data.error) { setError(data.error || "Failed to add session"); return; }
    setOpen(false);
    setForm(blank);
    onSaved();
  };

  return (
    <>
      <button onClick={() => { setForm(blank); setError(null); setOpen(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold hover:opacity-90">
        <Plus size={13} /> Add session
      </button>
      {open && (
        <ScheduleFormModal
          title="Add session"
          subtitle={`${category.org_name} · ${category.category_name}`}
          form={form} setForm={setForm} showSessionGroup={true}
          busy={busy} error={error} onSubmit={submit} onClose={() => setOpen(false)} submitLabel="Add session"
        />
      )}
    </>
  );
}

// Batch schedule import for the master schedule: pick an association/category,
// then drop the ice schedule file. Reuses SmartScheduleImport (same bulk endpoint
// the association setup uses) so re-uploading corrected rows updates in place.
function BatchScheduleImport({ categories, org, onSaved }) {
  const [open, setOpen] = useState(false);
  const [catId, setCatId] = useState("");
  const [cat, setCat] = useState(null);       // { category, sessions } from setup
  const [loading, setLoading] = useState(false);

  const picked = categories.find(c => String(c.age_category_id) === String(catId));

  const pick = async (id) => {
    setCatId(id);
    setCat(null);
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/categories/${id}/setup`);
      const d = await res.json();
      setCat({ sessions: d.sessions || [] });
    } catch { setCat({ sessions: [] }); }
    setLoading(false);
  };

  const close = () => { setOpen(false); setCatId(""); setCat(null); };

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-ink bg-white rounded-lg text-xs font-semibold hover:bg-gray-50">
        <Upload size={13} /> Import schedule
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 mt-10 mb-10">
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">Import a schedule</h3>
              <button onClick={close} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-400 mb-4">Pick the association &amp; category, then drop the ice-schedule file. Existing sessions with the same session/group update in place — re-upload a corrected file to redo the whole schedule.</p>

            <label className="text-xs font-medium text-gray-500 mb-1 block">Association · Category</label>
            <select value={catId} onChange={(e) => pick(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 mb-4">
              <option value="">Choose…</option>
              {categories.map(c => <option key={c.age_category_id} value={c.age_category_id}>{c.org_name} · {c.category_name}</option>)}
            </select>

            {loading && <div className="py-8 text-center text-sm text-gray-400">Loading category…</div>}
            {picked && cat && !loading && (
              <SmartScheduleImport
                catId={picked.age_category_id}
                categoryName={picked.category_name}
                sessions={cat.sessions}
                org={org || undefined}
                onImported={() => { onSaved(); }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

// SP-owned testing sessions (a testing-only client, not an association you
// evaluate for). Belongs with the schedule, not the tester pool. Add one, bulk
// upload a CSV, and manage the list. Only the SP's testers ever see these.
function TestingSessionsControls({ spUrl, onSaved }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: evData } = useQuery({ queryKey: ["sp-testing-events"], queryFn: async () => { const r = await fetch(spUrl("/api/service-provider/testing-events")); return r.json(); } });
  const events = evData?.events || [];
  const blankEv = { client_label: "", age_label: "", scheduled_date: "", start_time: "", end_time: "", location: "", testers_required: "6" };
  const [evForm, setEvForm] = useState(blankEv);
  const [evBusy, setEvBusy] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const setEv = (k, v) => setEvForm(f => ({ ...f, [k]: v }));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["sp-testing-events"] }); onSaved?.(); };

  const addEvent = async () => {
    if (!evForm.client_label.trim() || !evForm.scheduled_date) return;
    setEvBusy(true);
    await fetch(spUrl("/api/service-provider/testing-events"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(evForm) });
    setEvBusy(false); setEvForm(blankEv); refresh();
  };
  const delEvent = async (id) => { await fetch(spUrl(`/api/service-provider/testing-events?id=${id}`), { method: "DELETE" }); refresh(); };
  const onCsv = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadMsg(null);
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { setUploadMsg({ type: "error", text: "That CSV looks empty." }); e.target.value = ""; return; }
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const idx = (names) => headers.findIndex(h => names.some(n => h.includes(n)));
    const ci = { client: idx(["client"]), age: idx(["age"]), date: idx(["date"]), start: idx(["start"]), end: idx(["end"]), loc: idx(["location", "rink"]), testers: idx(["tester"]) };
    const evs = lines.slice(1).map(l => { const c = l.split(",").map(x => x.trim()); return {
      client_label: ci.client >= 0 ? c[ci.client] : "", age_label: ci.age >= 0 ? c[ci.age] : "", scheduled_date: ci.date >= 0 ? c[ci.date] : "",
      start_time: ci.start >= 0 ? c[ci.start] : "", end_time: ci.end >= 0 ? c[ci.end] : "",
      location: ci.loc >= 0 ? c[ci.loc] : "", testers_required: ci.testers >= 0 ? c[ci.testers] : "",
    }; }).filter(ev => ev.client_label && ev.scheduled_date);
    e.target.value = "";
    if (!evs.length) { setUploadMsg({ type: "error", text: "No valid rows — the CSV needs Client and Date columns." }); return; }
    const res = await fetch(spUrl("/api/service-provider/testing-events"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: evs }) });
    const d = await res.json().catch(() => ({}));
    if (d.success) { setUploadMsg({ type: "success", text: `Added ${d.created} session${d.created === 1 ? "" : "s"}${d.skipped ? `, skipped ${d.skipped}` : ""}.` }); refresh(); }
    else setUploadMsg({ type: "error", text: d.error || "Upload failed" });
  };
  const downloadTemplate = () => {
    const csv = "Client,Age Category,Date,Start Time,End Time,Location,Testers Needed\nRingette Association,U12,2026-09-15,17:00,18:00,Demo Arena - Rink A,6\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "testing-sessions-template.csv"; a.click();
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-ink bg-white rounded-lg text-xs font-semibold hover:bg-gray-50">
        <Plus size={13} /> Testing session
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 mt-10 mb-10">
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">Testing sessions you run</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-400 mb-4">Testing you schedule directly for a client (e.g. a Ringette association) — not an association you evaluate for. Only your testers see these; associations never do.</p>
            <div className="flex items-center gap-2 justify-end mb-3">
              <button onClick={downloadTemplate} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 whitespace-nowrap">↓ Template</button>
              <label className="text-xs px-3 py-1.5 bg-[#e8f0fd] text-[#0b5cd6] rounded-lg hover:bg-[#dbe8fc] font-medium cursor-pointer whitespace-nowrap">Upload CSV<input type="file" accept=".csv" onChange={onCsv} className="hidden" /></label>
            </div>
            {uploadMsg && <div className={`mb-3 text-xs font-medium ${uploadMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>{uploadMsg.text}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={evForm.client_label} onChange={e => setEv("client_label", e.target.value)} placeholder="Client (e.g. Ringette Association)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" />
              <input value={evForm.age_label} onChange={e => setEv("age_label", e.target.value)} placeholder="Age category (e.g. U12)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" />
              <input type="date" value={evForm.scheduled_date} onChange={e => setEv("scheduled_date", e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" />
              <input value={evForm.location} onChange={e => setEv("location", e.target.value)} placeholder="Rink / location" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" />
              <div className="flex items-center gap-2"><span className="text-xs text-gray-400 w-10">Start</span><input type="time" value={evForm.start_time} onChange={e => setEv("start_time", e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
              <div className="flex items-center gap-2"><span className="text-xs text-gray-400 w-10">End</span><input type="time" value={evForm.end_time} onChange={e => setEv("end_time", e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
              <div className="flex items-center gap-2"><span className="text-xs text-gray-400 whitespace-nowrap">Testers needed</span><input type="number" min="0" value={evForm.testers_required} onChange={e => setEv("testers_required", e.target.value)} className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
            </div>
            <div className="flex justify-end mt-3">
              <button onClick={addEvent} disabled={evBusy || !evForm.client_label.trim() || !evForm.scheduled_date} className="inline-flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-40"><Plus size={14} /> {evBusy ? "Adding…" : "Add testing session"}</button>
            </div>
            {events.length > 0 && (
              <div className="mt-5 border border-gray-100 rounded-xl divide-y divide-gray-100">
                {events.map(ev => {
                  const short = parseInt(ev.testers_required || 0) > 0 && parseInt(ev.testers_signed_up || 0) < parseInt(ev.testers_required || 0);
                  return (
                    <div key={ev.id} className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink">{ev.client_label}{ev.age_label && <span className="ml-2 text-[11px] px-2 py-0.5 bg-accent-soft text-accent rounded-full font-semibold">{ev.age_label}</span>}</div>
                        <div className="text-xs text-gray-400 flex items-center gap-2 flex-wrap mt-0.5">
                          <span>{ev.scheduled_date?.toString().split("T")[0]}</span>
                          {ev.start_time && <span>{formatTime(ev.start_time)}{ev.end_time ? ` - ${formatTime(ev.end_time)}` : ""}</span>}
                          {ev.location && <span>{ev.location}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-bold ${short ? "text-amber-600" : parseInt(ev.testers_signed_up || 0) > 0 ? "text-green-600" : "text-gray-400"}`}>{ev.testers_signed_up || 0}/{ev.testers_required || 0} <span className="text-xs font-normal text-gray-400">testers</span></span>
                        <button onClick={() => { if (confirm("Delete this testing session?")) delEvent(ev.id); }} className="p-1.5 text-gray-300 hover:text-red-400"><Ban size={14} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
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

function StaffingReports() {
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

function LeadsSection({ spUrl, orgParam, associations }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedAssocs, setSelectedAssocs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ["sp-leads", orgParam],
    queryFn: async () => {
      const res = await fetch(spUrl("/api/service-provider/leads"));
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const leads = leadsData?.leads || [];

  const toggleAssoc = (id) =>
    setSelectedAssocs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const assignLead = async () => {
    setSaving(true);
    setMsg(null);
    const res = await fetch(spUrl("/api/service-provider/leads"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name: name || null, association_ids: selectedAssocs }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || data.error) {
      setMsg({ type: "error", text: data.error || "Failed to assign lead" });
      return;
    }
    setMsg({ type: "success", text: `Lead assigned to ${data.count} association${data.count !== 1 ? "s" : ""}.` });
    setName("");
    setEmail("");
    setSelectedAssocs([]);
    queryClient.invalidateQueries({ queryKey: ["sp-leads", orgParam] });
  };

  const removeAssoc = async (userId, associationId) => {
    await fetch(spUrl(`/api/service-provider/leads?user_id=${userId}&association_id=${associationId}`), { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["sp-leads", orgParam] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Association Leads <span className="text-accent text-sm font-medium">· scoped access</span></h2>
          <p className="text-xs text-gray-400 mt-0.5">A lead manages <b className="text-gray-500">only the associations you pick</b> — for someone running one or two clubs. Need someone with full access to everything? Add a <b className="text-gray-500">Co-Admin</b> instead.</p>
        </div>
        <p className="text-sm text-gray-400 flex-shrink-0">{leads.length} lead{leads.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Current leads */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Current Leads</h3>
          <p className="text-xs text-gray-400 mt-0.5">Each lead has scoped admin access to the associations they cover.</p>
        </div>
        {isLoading ? (
          <div className="py-10 text-center text-gray-400 text-sm">Loading...</div>
        ) : leads.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">No leads assigned yet. Use the form below to add one.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {leads.map(lead => (
              <div key={lead.user_id} className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">{lead.name || lead.email}</div>
                  <div className="text-xs text-gray-400">{lead.email}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {lead.associations.map(a => (
                    <span key={a.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                      {a.name}
                      <button
                        onClick={() => removeAssoc(lead.user_id, a.id)}
                        className="text-blue-400 hover:text-blue-700"
                        aria-label={`Remove ${a.name}`}
                        title="Remove access"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign new lead */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Assign New Lead</h3>
          <p className="text-xs text-gray-400 mt-0.5">Grant a person scoped admin access to one or more of your associations.</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Name (optional)</label>
              <input type="text" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Email *</label>
              <input type="email" placeholder="jane@club.com" value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Associations *</label>
            {associations.length === 0 ? (
              <p className="text-xs text-gray-400">No associations available.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {associations.map(assoc => (
                  <label key={assoc.id} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={selectedAssocs.includes(assoc.id)} onChange={() => toggleAssoc(assoc.id)} className="rounded border-gray-300" />
                    <span className="truncate text-gray-700" title={assoc.name}>{assoc.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {msg && <p className={`text-xs font-medium ${msg.type === "success" ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>}
          <div>
            <button
              disabled={!email || selectedAssocs.length === 0 || saving}
              onClick={assignLead}
              className="px-5 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-40">
              {saving ? "Assigning..." : "Assign Lead"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Set hourly rates modal — batch editor for the full evaluator pool.
// evaluators: full list (all non-deleted/non-suspended as caller prefers)
// onClose: () => void
// onSaved: () => void  (caller refetches + shows banner)
function SetRatesModal({ evaluators, onClose, onSaved }) {
  // Seed local map: evaluatorId (string) → input string value
  const [rates, setRates] = useState(() => {
    const m = {};
    for (const ev of evaluators) {
      m[String(ev.id)] = ev.hourly_rate != null ? String(ev.hourly_rate) : "";
    }
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const inputCls = "w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-accent/30";

  const save = async () => {
    setSaving(true);
    setError(null);
    // Only send rows where value changed vs. original
    const changed = evaluators
      .filter(ev => {
        const orig = ev.hourly_rate != null ? String(ev.hourly_rate) : "";
        return rates[String(ev.id)] !== orig;
      })
      .map(ev => ({
        evaluator_id: ev.id,
        hourly_rate: rates[String(ev.id)] === "" ? null : parseFloat(rates[String(ev.id)]),
      }));
    if (changed.length === 0) { onClose(); return; }
    const res = await fetch("/api/service-provider/evaluators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_rates", rates: changed }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || data.error) { setError(data.error || "Failed to save rates"); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col" style={{ maxHeight: "90vh" }}>
        <div className="flex items-start justify-between mb-1 flex-shrink-0">
          <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">Evaluator hourly rates</h3>
          <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600 disabled:opacity-50"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4 flex-shrink-0">Enter $/hour for each evaluator. Blank = no rate.</p>

        {evaluators.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No active evaluators.</p>
        ) : (
          <div className="overflow-y-auto flex-1 divide-y divide-gray-100 -mx-6 px-6">
            {evaluators.map(ev => (
              <div key={ev.id} className="flex items-center justify-between py-2.5 gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink truncate">{ev.name}</div>
                  <div className="text-xs text-gray-400 truncate">{ev.email}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-sm text-gray-400">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={rates[String(ev.id)]}
                    onChange={e => setRates(p => ({ ...p, [String(ev.id)]: e.target.value }))}
                    className={inputCls}
                    placeholder="—"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-xs font-medium text-red-500 mt-3 flex-shrink-0">{error}</p>}

        <div className="flex gap-3 pt-4 flex-shrink-0">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm disabled:opacity-50">Cancel</button>
          <button onClick={save} disabled={saving || evaluators.length === 0} className="flex-1 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40">
            {saving ? "Saving…" : "Save all"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Compose-message modal — Minimal Athletic look. Self-contained: takes a recipient
// descriptor and posts to the global /api/messages endpoint, then reports back.
//   recipient = { to_all_pool: true, label } | { to_user_ids: [...], label }
function ComposeMessageModal({ recipient, initialSubject = "", onClose, onSent }) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sentCount, setSentCount] = useState(null);

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30";

  const send = async () => {
    setSending(true);
    setError(null);
    const payload = recipient.to_all_pool
      ? { subject, body, to_all_pool: true }
      : { subject, body, to_user_ids: recipient.to_user_ids };
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok || data.error) { setError(data.error || "Failed to send"); return; }
    const n = data.sent ?? (recipient.to_user_ids ? recipient.to_user_ids.length : data.count ?? 0);
    setSentCount(n);
    onSent?.();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && !sending && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-1">
          <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">Message evaluators</h3>
          <button onClick={onClose} disabled={sending} className="text-gray-400 hover:text-gray-600 disabled:opacity-50"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4">{recipient.label}</p>
        {sentCount !== null ? (
          <div className="text-center py-4">
            <p className="font-semibold text-ink mb-3">Sent to {sentCount} evaluator{sentCount === 1 ? "" : "s"}.</p>
            <button onClick={onClose} className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90">Done</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Subject</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Message</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" rows={5} className={`${inputCls} resize-none`} />
            </div>
            {error && <p className="text-xs font-medium text-red-500">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} disabled={sending} className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm disabled:opacity-50">Cancel</button>
              <button onClick={send} disabled={sending || (!subject && !body)} className="flex-1 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
                <Send size={14} /> {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Messages inbox — replies from evaluators. Reads the global /api/messages feed,
// marks read on click, and offers a Reply affordance that re-uses ComposeMessageModal.
function MessagesSection() {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState(null);
  const [replyTo, setReplyTo] = useState(null); // { to_user_ids, label, subject }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["sp-messages"],
    queryFn: async () => {
      const res = await fetch("/api/messages");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const inbox = data?.inbox || [];

  const markRead = async (id) => {
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_read: id }),
    });
    queryClient.invalidateQueries({ queryKey: ["sp-messages"] });
  };

  const onRowClick = (m) => {
    const next = openId === m.id ? null : m.id;
    setOpenId(next);
    if (next && !m.read_at) markRead(m.id);
  };

  const fmt = (d) => {
    if (!d) return "";
    try { return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
    catch { return d.toString(); }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Inbox size={15} className="text-accent" /> Messages from Evaluators</h3>
          <p className="text-xs text-gray-400 mt-0.5">Replies land here. Click to read; reply inline.</p>
        </div>
        {data?.unread > 0 && <span className="text-xs px-2.5 py-1 bg-accent-soft text-accent rounded-full font-medium">{data.unread} unread</span>}
      </div>
      {isLoading ? (
        <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
      ) : inbox.length === 0 ? (
        <div className="py-10 text-center text-gray-400 text-sm">No messages yet.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {inbox.map((m) => {
            const isOpen = openId === m.id;
            return (
              <div key={m.id} className={!m.read_at ? "bg-accent-soft/40" : ""}>
                <button onClick={() => onRowClick(m)} className="w-full text-left px-5 py-3 hover:bg-gray-50 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {!m.read_at && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />}
                      <span className="font-medium text-gray-900 truncate">{m.from_user_name}</span>
                    </div>
                    <div className="text-sm text-gray-700 truncate">{m.subject || "(no subject)"}</div>
                    {!isOpen && <div className="text-xs text-gray-400 truncate">{m.body}</div>}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">{fmt(m.created_at)}</span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 -mt-1">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{m.body}</p>
                    <button
                      onClick={() => setReplyTo({ to_user_ids: [m.from_user_id], label: `Reply to ${m.from_user_name}`, subject: m.subject ? `Re: ${m.subject}` : "" })}
                      className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5">
                      <Reply size={12} /> Reply
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {replyTo && (
        <ComposeMessageModal
          recipient={{ to_user_ids: replyTo.to_user_ids, label: replyTo.label }}
          initialSubject={replyTo.subject}
          onClose={() => setReplyTo(null)}
          onSent={refetch}
        />
      )}
    </div>
  );
}

// The SP's own logo — shown top-right on every report for their athletes.
// Stored on the org (transparent PNG/SVG renders white on the dark report cover).
function SpLogoControl({ sp, onChange }) {
  const [busy, setBusy] = useState(false);
  if (!sp?.id) return null;
  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    const fd = new FormData(); fd.append("logo", file);
    await fetch(`/api/organizations/${sp.id}/logo`, { method: "POST", body: fd });
    setBusy(false); onChange?.();
  };
  const remove = async () => { setBusy(true); await fetch(`/api/organizations/${sp.id}/logo`, { method: "DELETE" }); setBusy(false); onChange?.(); };
  return (
    <div className="mt-4 flex items-center gap-3 flex-wrap">
      {sp.logo_url ? (
        <>
          <div className="h-11 w-28 rounded-lg border border-gray-200 flex items-center justify-center px-2" style={{ background: "#0f0f12" }} title="Preview as it appears on reports">
            <img src={sp.logo_url} alt="Report logo" style={{ maxHeight: "30px", maxWidth: "98px", objectFit: "contain", filter: "brightness(0) invert(1)" }} />
          </div>
          <label className="text-xs text-accent hover:underline cursor-pointer font-medium">{busy ? "Saving…" : "Replace report logo"}<input type="file" accept="image/png,image/svg+xml,image/webp" className="hidden" onChange={upload} disabled={busy} /></label>
          <button onClick={remove} disabled={busy} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
        </>
      ) : (
        <label className="inline-flex items-center gap-1.5 text-xs px-3 py-2 border border-dashed border-gray-300 text-gray-600 rounded-lg cursor-pointer hover:border-accent hover:text-accent font-medium">
          {busy ? "Saving…" : "+ Add report logo"}<span className="text-gray-400">(transparent PNG)</span>
          <input type="file" accept="image/png,image/svg+xml,image/webp" className="hidden" onChange={upload} disabled={busy} />
        </label>
      )}
    </div>
  );
}

function SPDashboard() {
  useTrackPageView("dashboard.service-provider.viewed");
  const searchParams = useSearchParams();
  const orgParam = searchParams.get("org");
  const spUrl = (path) => {
    if (!orgParam) return path;
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}org=${orgParam}`;
  };

  const [activeTab, setActiveTab] = useState("overview");
  const [theme, toggleTheme] = useTheme();
  const queryClient = useQueryClient();
  const [showPastSessions, setShowPastSessions] = useState(false);
  const [scheduleView, setScheduleViewRaw] = useState("week"); // "week" | "month" | "list"
  useEffect(() => {
    const saved = typeof window !== "undefined" && window.localStorage.getItem("sp-schedule-view");
    if (saved === "week" || saved === "month" || saved === "list") setScheduleViewRaw(saved);
  }, []);
  const setScheduleView = (v) => { setScheduleViewRaw(v); try { window.localStorage.setItem("sp-schedule-view", v); } catch {} };
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [calLinks, setCalLinks] = useState(null);
  const [showGoalieTemplate, setShowGoalieTemplate] = useState(false);
  // Persisted so the date selection is retained across tab navigation (and reloads).
  const [scheduleSelectedDate, setScheduleSelectedDateState] = useState(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("sp-schedule-selected-date") || null;
  }); // YYYY-MM-DD or null
  const setScheduleSelectedDate = (val) => {
    setScheduleSelectedDateState(val);
    if (typeof window !== "undefined") {
      if (val) window.localStorage.setItem("sp-schedule-selected-date", val);
      else window.localStorage.removeItem("sp-schedule-selected-date");
    }
  };
  const [evalInviteEmail, setEvalInviteEmail] = useState("");
  const [evalInviteSending, setEvalInviteSending] = useState(false);
  const [evalInviteMsg, setEvalInviteMsg] = useState(null);
  const [adminInviteEmail, setAdminInviteEmail] = useState("");
  const [adminInviteName, setAdminInviteName] = useState("");
  const [adminInviteSending, setAdminInviteSending] = useState(false);
  const [adminInviteMsg, setAdminInviteMsg] = useState(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", contact_name: "", contact_email: "", contact_phone: "", address: "" });
  const [newClientSaving, setNewClientSaving] = useState(false);
  const [newClientMsg, setNewClientMsg] = useState(null);
  const [selHours, setSelHours] = useState([]);
  const [selFlags, setSelFlags] = useState([]);
  const [selEvals, setSelEvals] = useState([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [evalSearch, setEvalSearch] = useState("");
  const [evalStatusFilter, setEvalStatusFilter] = useState("all");
  const [evalPage, setEvalPage] = useState(1);
  const EVAL_PAGE_SIZE = 25;
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

  const { data: assocData, isLoading: assocLoading } = useQuery({
    queryKey: ["sp-associations", orgParam],
    queryFn: async () => {
      const res = await fetch(spUrl("/api/service-provider/associations"));
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

  const { data: evalData } = useQuery({
    queryKey: ["sp-evaluators", orgParam],
    queryFn: async () => {
      const res = await fetch(spUrl("/api/service-provider/evaluators"));
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: schedData, isLoading: schedLoading, refetch: refetchSchedule } = useQuery({
    queryKey: ["sp-schedule", orgParam],
    queryFn: async () => {
      const res = await fetch(spUrl("/api/service-provider/schedule"));
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  // Master Schedule editing: brief confirmation line + add-session category context.
  const [scheduleSavedMsg, setScheduleSavedMsg] = useState(false);
  const [addSessionCatId, setAddSessionCatId] = useState("");
  const onScheduleSaved = () => {
    refetchSchedule();
    setScheduleSavedMsg(true);
    setTimeout(() => setScheduleSavedMsg(false), 4000);
  };

  const sp = assocData?.sp;
  const associations = assocData?.associations || [];
  const evaluatorStats = assocData?.evaluatorStats || {};
  const evaluators = evalData?.evaluators || [];
  const flags = evalData?.flags || [];
  const pendingHours = evalData?.pendingHours || [];

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
  }, [filteredEvaluators, evalPageSafe, EVAL_PAGE_SIZE]);
  const rawSchedule = schedData?.schedule || [];
  const byDate = rawSchedule.reduce((acc, entry) => {
    const date = entry.scheduled_date?.toString().split("T")[0];
    if (!date) return acc;
    if (!acc[date]) acc[date] = [];
    acc[date].push({ ...entry, spots_open: parseInt(entry.evaluators_required) - parseInt(entry.evaluators_signed_up || 0) });
    return acc;
  }, {});
  const schedule = Object.values(byDate).flat();
  const today = localToday();
  const allDates = Object.keys(byDate).sort();
  const upcomingDates = showPastSessions ? allDates : allDates.filter(d => d >= today);
  const pastCount = allDates.filter(d => d < today).length;
  const needsEvaluators = schedule.filter(s => s.spots_open > 0 && s.scheduled_date?.toString().split("T")[0] >= today).length;
  const totalUpcoming = schedule.filter(s => s.scheduled_date?.toString().split("T")[0] >= today).length;

  // ── Overview (home) data ──
  const dateOf = (s) => s.scheduled_date?.toString().split("T")[0];
  const byDateTime = (a, b) => (dateOf(a) + (a.start_time || "")).localeCompare(dateOf(b) + (b.start_time || ""));
  const liveSessions = schedule.filter(s => s.status !== "cancelled");
  const todaySessions = liveSessions.filter(s => dateOf(s) === today).sort(byDateTime);
  const upcomingSessions = liveSessions.filter(s => dateOf(s) > today).sort(byDateTime).slice(0, 8);
  const needsAttention = liveSessions
    .filter(s => s.spots_open > 0 && dateOf(s) >= today)
    .sort(byDateTime)
    .slice(0, 6);
  const topEvaluators = [...evaluators]
    .filter(ev => ev.membership_status !== "pending" && ev.membership_status !== "suspended")
    .map(ev => ({ ...ev, _sessions: parseInt(ev.total_sessions || 0) }))
    .filter(ev => ev._sessions > 0)
    .sort((a, b) => b._sessions - a._sessions || parseFloat(b.total_hours || 0) - parseFloat(a.total_hours || 0))
    .slice(0, 5);

  // Org -> palette map for the master schedule (deterministic, distinct).
  // Built from the orgs actually present in the current schedule view.
  const scheduleOrgColorMap = useMemo(() => {
    const orgs = Array.from(new Set(schedule.map(s => s.org_name).filter(Boolean)));
    return buildOrgColorMap(orgs);
  }, [schedule]);
  const scheduleOrgPalette = (name) => scheduleOrgColorMap.get(name) || colorForOrg(name);

  // Distinct association/category contexts present in the schedule — drives the
  // "Add session" picker (the POST endpoint is keyed by age_category_id).
  const scheduleCategories = useMemo(() => {
    const map = new Map();
    for (const s of schedule) {
      if (s.age_category_id && !map.has(s.age_category_id)) {
        map.set(s.age_category_id, { age_category_id: s.age_category_id, org_name: s.org_name, category_name: s.category_name });
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.org_name + a.category_name).localeCompare(b.org_name + b.category_name));
  }, [schedule]);
  const addSessionCategory = scheduleCategories.find(c => String(c.age_category_id) === String(addSessionCatId));

  // Date filter: when a specific date is picked from strip / calendar, show
  // only that day's sessions in the list.
  const visibleDates = scheduleSelectedDate
    ? upcomingDates.filter(d => d === scheduleSelectedDate)
    : upcomingDates;

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-end items-center gap-3">
          <NotificationBell />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1">
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 pt-1">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="min-w-0">
              <div className="font-display text-xs font-bold tracking-[0.2em] uppercase text-accent mb-2">{sp?.type === "goalie_service_provider" ? "Goalie Service Provider" : "Service Provider"}</div>
              <div className="flex items-end gap-4 flex-wrap">
                <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">{sp?.name || "Service Provider"}</h1>
                <img src="/s-mark-dark.svg" style={{width:"44px",height:"44px",objectFit:"contain"}} alt="Sideline Star" />
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap text-sm text-gray-500 font-medium">
                <span><b className="text-ink">{associations.length}</b> client association{associations.length === 1 ? "" : "s"}</span>
                <span className="text-gray-300">·</span>
                <span><b className="text-ink">{totalUpcoming}</b> upcoming session{totalUpcoming === 1 ? "" : "s"}</span>
                <span className="text-gray-300">·</span>
                <span><b className="text-ink">{needsEvaluators}</b> need{needsEvaluators === 1 ? "s" : ""} evaluators</span>
                <span className="text-gray-300">·</span>
                <span><b className="text-ink">{evaluatorStats.total_evaluators || 0}</b> evaluators in pool</span>
              </div>
              <SpLogoControl sp={sp} onChange={() => queryClient.invalidateQueries({ queryKey: ["sp-associations"] })} />
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {[{ id: "overview", label: "Overview" }, { id: "schedule", label: "Master Schedule" }, { id: "associations", label: "Associations" }, { id: "evaluators", label: "Evaluator Pool" }, { id: "testers", label: "Testers" }, { id: "leads", label: "Leads" }, { id: "reports", label: "Reports" }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === tab.id ? "border-[#0b5cd6] text-[#0b5cd6]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {activeTab === "testers" && <TestersTab spUrl={spUrl} spName={sp?.name} />}

        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Client Associations", value: associations.length, Icon: Building2 },
                { label: "Sessions Today", value: todaySessions.length, Icon: CalendarDays, gold: true },
                { label: "Upcoming Sessions", value: totalUpcoming, Icon: Calendar },
                { label: "Need Evaluators", value: needsEvaluators, Icon: AlertTriangle, amber: needsEvaluators > 0 },
              ].map((c, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{c.label}</div>
                    <c.Icon size={16} className={c.amber ? "text-amber-500" : "text-accent"} />
                  </div>
                  <div className={`mt-2 font-display font-black text-3xl ${c.gold ? "text-accent" : c.amber ? "text-amber-600" : "text-ink"}`}>{c.value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* LEFT: sessions */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="font-display font-bold text-ink text-lg leading-tight flex items-center gap-2"><CalendarDays size={17} className="text-accent" /> Today's scheduled sessions</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(today)}</p>
                    </div>
                    <span className="text-sm text-gray-400">{todaySessions.length} session{todaySessions.length === 1 ? "" : "s"}</span>
                  </div>
                  {schedLoading ? (
                    <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
                  ) : todaySessions.length === 0 ? (
                    <div className="py-10 text-center text-gray-400 text-sm">Nothing on the ice today.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {todaySessions.map(s => <SessionRow key={s.schedule_id} s={s} />)}
                    </div>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-display font-bold text-ink text-lg leading-tight flex items-center gap-2"><Calendar size={17} className="text-accent" /> Upcoming sessions</h3>
                    <button onClick={() => setActiveTab("schedule")} className="text-xs font-semibold text-accent hover:opacity-70 inline-flex items-center gap-1">View all <ArrowRight size={12} /></button>
                  </div>
                  {schedLoading ? (
                    <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
                  ) : upcomingSessions.length === 0 ? (
                    <div className="py-10 text-center text-gray-400 text-sm">No upcoming sessions scheduled.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {upcomingSessions.map(s => <SessionRow key={s.schedule_id} s={s} showDate />)}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: attention + top evaluators */}
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <h3 className="font-display font-bold text-ink text-lg leading-tight flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> Needs attention</h3>
                  <p className="text-xs text-gray-400 mt-0.5 mb-3">{needsEvaluators} session{needsEvaluators === 1 ? "" : "s"} short on evaluators</p>
                  {needsAttention.length === 0 ? (
                    <p className="text-sm text-gray-400 py-3">All upcoming sessions are fully staffed.</p>
                  ) : (
                    <div>
                      {needsAttention.map(s => (
                        <div key={s.schedule_id} className="flex items-start gap-3 py-2.5 border-t border-gray-100 first:border-t-0">
                          <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-ink truncate">{s.org_name} · {s.category_name}</div>
                            <div className="text-xs text-gray-400">{formatDate(s.scheduled_date)} · needs {s.spots_open} more</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <h3 className="font-display font-bold text-ink text-lg leading-tight flex items-center gap-2"><Star size={16} className="text-accent" /> Top evaluators</h3>
                  <p className="text-xs text-gray-400 mt-0.5 mb-3">By sessions worked</p>
                  {topEvaluators.length === 0 ? (
                    <p className="text-sm text-gray-400 py-3">No session history yet.</p>
                  ) : (
                    <div>
                      {topEvaluators.map(ev => (
                        <div key={ev.id} className="flex items-center gap-3 py-2.5 border-t border-gray-100 first:border-t-0">
                          <div className="w-9 h-9 rounded-full bg-accent-soft text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">{(ev.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}</div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-ink truncate">{ev.name}</div>
                            <div className="text-xs text-gray-400 truncate">{ev._sessions} session{ev._sessions === 1 ? "" : "s"}{parseFloat(ev.total_hours || 0) > 0 ? ` · ${parseFloat(ev.total_hours).toFixed(0)}h` : ""}</div>
                          </div>
                          {parseFloat(ev.avg_rating || 0) > 0 && <span className="text-xs font-mono text-accent flex-shrink-0">{parseFloat(ev.avg_rating).toFixed(1)}★</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setActiveTab("evaluators")} className="mt-3 text-xs font-semibold text-accent hover:opacity-70 inline-flex items-center gap-1">Full pool <ArrowRight size={12} /></button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "associations" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Client Associations</h2>
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-400">{associations.length} clients</p>
                <button onClick={() => setShowGoalieTemplate(true)} className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-ink bg-white rounded-lg text-sm font-semibold hover:bg-gray-50">
                  <Shield size={15} /> Goalie template
                </button>
                <button onClick={() => { setShowNewClient(true); setNewClientMsg(null); }} className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow">
                  <Plus size={15} /> New Client
                </button>
              </div>
            </div>

            {showGoalieTemplate && sp?.id && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && setShowGoalieTemplate(false)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 mt-10 mb-10">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">Goalie template</h3>
                    <button onClick={() => setShowGoalieTemplate(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">Your standard goalie scoring setup — scale, skills, sessions. Saving applies it to every association you evaluate goalies for.</p>
                  <GoalieTemplateEditor orgId={sp.id} context="sp" onSaved={() => queryClient.invalidateQueries({ queryKey: ["sp-schedule", orgParam] })} />
                </div>
              </div>
            )}

            {showNewClient && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-base font-bold text-gray-900">Add New Client Association</h3>
                    <button onClick={() => setShowNewClient(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                  </div>
                  <div className="space-y-3">
                    <div><label className="text-xs font-medium text-gray-500 mb-1 block">Organization Name *</label><input type="text" placeholder="e.g. Calgary Minor Hockey" value={newClient.name} onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs font-medium text-gray-500 mb-1 block">Contact Name *</label><input type="text" placeholder="Jane Smith" value={newClient.contact_name} onChange={e => setNewClient(p => ({ ...p, contact_name: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
                      <div><label className="text-xs font-medium text-gray-500 mb-1 block">Contact Email *</label><input type="email" placeholder="jane@org.com" value={newClient.contact_email} onChange={e => setNewClient(p => ({ ...p, contact_email: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs font-medium text-gray-500 mb-1 block">Phone</label><input type="text" placeholder="403-555-1234" value={newClient.contact_phone} onChange={e => setNewClient(p => ({ ...p, contact_phone: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
                      <div><label className="text-xs font-medium text-gray-500 mb-1 block">City / Address</label><input type="text" placeholder="Calgary, AB" value={newClient.address} onChange={e => setNewClient(p => ({ ...p, address: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
                    </div>
                    {newClientMsg && (
                      <div className={`text-xs font-medium ${newClientMsg.type === "success" ? "text-green-600" : newClientMsg.type === "warn" ? "text-amber-600" : "text-red-500"}`}>
                        <p>{newClientMsg.text}</p>
                        {newClientMsg.url && (
                          <div className="mt-2 flex items-center gap-2">
                            <input readOnly value={newClientMsg.url} className="flex-1 text-[11px] bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-700 font-mono" />
                            <button type="button" onClick={() => navigator.clipboard.writeText(newClientMsg.url)} className="px-2.5 py-1.5 bg-accent text-white rounded text-xs font-semibold hover:opacity-90">Copy</button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setShowNewClient(false)} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Close</button>
                      <button disabled={!newClient.name || !newClient.contact_email || !newClient.contact_name || newClientSaving}
                        onClick={async () => {
                          setNewClientSaving(true);
                          setNewClientMsg(null);
                          const res = await fetch("/api/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newClient, type: "association" }) });
                          const data = await res.json();
                          if (!data.organization) { setNewClientMsg({ type: "error", text: data.error || "Failed to create" }); setNewClientSaving(false); return; }
                          await fetch(spUrl("/api/service-provider/associations"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ association_id: data.organization.id }) });
                          const inv = data.invite;
                          setNewClientMsg(
                            inv?.sent
                              ? { type: "success", text: `${newClient.name} created — ${inv.message}` }
                              : { type: inv?.url ? "warn" : "success", text: inv?.message || `${newClient.name} created and linked!`, url: inv?.url || null }
                          );
                          setNewClientSaving(false);
                          setNewClient({ name: "", contact_name: "", contact_email: "", contact_phone: "", address: "" });
                          queryClient.invalidateQueries({ queryKey: ["sp-associations"] });
                          if (inv?.sent) setTimeout(() => setShowNewClient(false), 1800);
                        }}
                        className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-40">
                        {newClientSaving ? "Creating..." : "Create and Link"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {assocLoading ? <div className="py-12 text-center text-gray-400">Loading...</div> : associations.length === 0 ? (
              <div className="py-16 text-center bg-white border border-dashed border-gray-200 rounded-2xl">
                <Building2 size={48} className="mx-auto text-gray-200 mb-4" />
                <h3 className="font-semibold text-gray-600 mb-2">No client associations yet</h3>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {associations.map(assoc => {
                  const assocSessions = schedule.filter(s => s.org_id === assoc.id && s.scheduled_date >= today);
                  const needsEval = assocSessions.filter(s => s.spots_open > 0).length;
                  const uploadLogo = async (file) => {
                    const fd = new FormData();
                    fd.append("logo", file);
                    const res = await fetch(`/api/organizations/${assoc.id}/logo`, { method: "POST", body: fd });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Upload failed");
                    queryClient.invalidateQueries({ queryKey: ["sp-associations"] });
                  };
                  const removeLogo = async () => {
                    const res = await fetch(`/api/organizations/${assoc.id}/logo`, { method: "DELETE" });
                    if (res.ok) queryClient.invalidateQueries({ queryKey: ["sp-associations"] });
                  };
                  return (
                    <div key={assoc.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-[#0b5cd6]/50 hover:shadow-md transition-all">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <OrgAvatar
                            name={assoc.name}
                            logoUrl={assoc.logo_url}
                            size={48}
                            onUpload={uploadLogo}
                            onRemove={removeLogo}
                          />
                          <div className="min-w-0">
                            <h3 className="font-bold text-gray-900 truncate" title={assoc.name}>{assoc.name}</h3>
                            <p className="text-xs text-gray-400 truncate">{assoc.contact_email}</p>
                          </div>
                        </div>
                        {needsEval > 0 && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium flex-shrink-0">{needsEval} needs eval</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                        <div className="bg-gray-50 rounded-lg py-2"><div className="text-lg font-bold text-gray-900">{assoc.age_categories || 0}</div><div className="text-xs text-gray-400">Categories</div></div>
                        <div className="bg-gray-50 rounded-lg py-2"><div className="text-lg font-bold text-gray-900">{assoc.athletes || 0}</div><div className="text-xs text-gray-400">Athletes</div></div>
                        <div className="bg-gray-50 rounded-lg py-2"><div className="text-lg font-bold text-gray-900">{assocSessions.length}</div><div className="text-xs text-gray-400">Upcoming</div></div>
                      </div>
                      {sp?.type !== "goalie_service_provider" && (
                        <label className="flex items-start gap-2.5 mb-3 px-3 py-2.5 bg-gray-50 rounded-lg cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!assoc.allow_association_evaluators}
                            onChange={async (e) => {
                              const allow = e.target.checked;
                              try {
                                const res = await fetch(`/api/service-provider/associations${sp?.id ? `?org=${sp.id}` : ""}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ action: "set_evaluator_access", association_id: assoc.id, allow }),
                                });
                                if (!res.ok) throw new Error();
                                queryClient.invalidateQueries({ queryKey: ["sp-associations"] });
                              } catch {
                                queryClient.invalidateQueries({ queryKey: ["sp-associations"] });
                              }
                            }}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#0b5cd6] focus:ring-[#0b5cd6]/30"
                          />
                          <span className="text-xs text-gray-600 leading-snug">
                            <span className="font-semibold text-gray-800">Let them add their own evaluators</span><br />
                            Their coaches' scores show as a <b>comparison only</b> — your evaluators' scores stay the official ranking.
                          </span>
                        </label>
                      )}
                      {sp?.type === "goalie_service_provider" ? (
                        <a href={`/goalie-provider/rankings?org=${assoc.id}`} className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow">
                          <Star size={14} /> View goalie rankings
                        </a>
                      ) : (
                        <a href={`/association/dashboard?org=${assoc.id}`} className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow">
                          <ExternalLink size={14} /> Open Dashboard
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Add Co-Admin <span className="text-accent font-medium">· full access</span></h3>
                <p className="text-xs text-gray-500 mt-0.5">Sees and manages <b className="text-ink">every</b> association under {sp?.name || "this service provider"} — for a partner who helps anywhere.</p>
                <p className="text-xs text-gray-400 mt-1">Only need them on one or two associations? Use the <b className="text-gray-500">Leads</b> tab instead.</p>
              </div>
              <div className="p-5">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <input type="text" placeholder="Name (optional)" value={adminInviteName} onChange={e => setAdminInviteName(e.target.value)} className="sm:w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" />
                  <input type="email" placeholder="Admin email address" value={adminInviteEmail} onChange={e => setAdminInviteEmail(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" />
                  <button disabled={!adminInviteEmail || adminInviteSending || !sp?.id}
                    onClick={async () => {
                      setAdminInviteSending(true);
                      setAdminInviteMsg(null);
                      try {
                        const res = await fetch("/api/admin/invite-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organization_id: sp.id, email: adminInviteEmail, name: adminInviteName || null }) });
                        const data = await res.json();
                        if (data.success) {
                          setAdminInviteMsg({ type: "success", text: data.message || `Invitation sent to ${adminInviteEmail}` });
                          setAdminInviteEmail("");
                          setAdminInviteName("");
                        } else {
                          setAdminInviteMsg({ type: "error", text: data.error || "Failed to send invite" });
                        }
                      } catch {
                        setAdminInviteMsg({ type: "error", text: "Failed to send invite" });
                      }
                      setAdminInviteSending(false);
                    }}
                    className="px-5 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-40 whitespace-nowrap">
                    {adminInviteSending ? "Sending..." : "Send Invite"}
                  </button>
                </div>
                {adminInviteMsg && <p className={`text-xs font-medium mt-2 break-words ${adminInviteMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>{adminInviteMsg.text}</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === "schedule" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Master Schedule</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Week / Month / List toggle — Google-style views */}
                <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
                  {[
                    { id: "week", label: "Week", Icon: CalendarDays },
                    { id: "month", label: "Month", Icon: Calendar },
                    { id: "list", label: "List", Icon: List },
                  ].map(({ id, label, Icon }) => (
                    <button key={id} onClick={() => setScheduleView(id)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        scheduleView === id ? "bg-[#0b5cd6] text-white" : "text-gray-600 hover:bg-gray-50"
                      }`}>
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>
                {/* Subscribe — add the master schedule to Google/Apple Calendar */}
                <button
                  onClick={async () => {
                    setShowSubscribe(true);
                    if (!calLinks) {
                      try { const r = await fetch(spUrl("/api/service-provider/calendar-link")); if (r.ok) setCalLinks(await r.json()); } catch {}
                    }
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg border font-medium bg-white text-gray-600 border-gray-200 inline-flex items-center gap-1"
                >
                  <Calendar size={12} /> Subscribe
                </button>
                <button onClick={() => setShowPastSessions(!showPastSessions)} className="text-xs px-3 py-1.5 rounded-lg border font-medium bg-white text-gray-600 border-gray-200">
                  {showPastSessions ? "Hide Past" : `Show Past (${pastCount})`}
                </button>
                {/* Batch import — drop a schedule file for a chosen category */}
                {scheduleCategories.length > 0 && (
                  <BatchScheduleImport categories={scheduleCategories} org={orgParam} onSaved={onScheduleSaved} />
                )}
                {/* SP-owned testing sessions — add / bulk upload (belongs here, not in Testers) */}
                <TestingSessionsControls spUrl={spUrl} onSaved={onScheduleSaved} />
                {/* Add session — pick an association/category context first */}
                {scheduleCategories.length > 0 && (
                  <div className="inline-flex items-center gap-2">
                    <select
                      value={addSessionCatId}
                      onChange={(e) => setAddSessionCatId(e.target.value)}
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent/30 max-w-[14rem]"
                    >
                      <option value="">Add to…</option>
                      {scheduleCategories.map(c => (
                        <option key={c.age_category_id} value={c.age_category_id}>{c.org_name} · {c.category_name}</option>
                      ))}
                    </select>
                    {addSessionCategory && <AddSessionButton category={addSessionCategory} onSaved={onScheduleSaved} />}
                  </div>
                )}
              </div>
            </div>

            {scheduleSavedMsg && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm text-green-700">
                Saved — association, directors and evaluators notified.
              </div>
            )}

            {showSubscribe && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && setShowSubscribe(false)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 mt-16">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">Add to your calendar</h3>
                    <button onClick={() => setShowSubscribe(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">Subscribe once and every session across your client associations shows up in Google, Apple, or Outlook Calendar — and stays in sync as the schedule changes.</p>
                  {!calLinks ? (
                    <div className="py-6 text-center text-sm text-gray-400">Generating your calendar link…</div>
                  ) : (
                    <div className="space-y-3">
                      <a href={calLinks.googleUrl} target="_blank" rel="noopener noreferrer" className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold hover:shadow-md">
                        <Calendar size={15} /> Add to Google Calendar
                      </a>
                      <a href={calLinks.webcalUrl} className="w-full inline-flex items-center justify-center gap-2 py-2.5 border border-gray-300 text-ink rounded-lg text-sm font-semibold hover:bg-gray-50">
                        Add to Apple Calendar
                      </a>
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">Or paste this URL into any calendar app (“From URL” / “Subscribe”)</label>
                        <div className="flex items-center gap-2">
                          <input readOnly value={calLinks.httpsUrl} className="flex-1 text-[11px] bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-700 font-mono" />
                          <button onClick={() => navigator.clipboard.writeText(calLinks.httpsUrl)} className="px-2.5 py-1.5 bg-accent text-white rounded text-xs font-semibold hover:opacity-90">Copy</button>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400">Keep this link private — anyone with it can see your master schedule. Google refreshes subscribed calendars roughly every few hours.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Selected-date chip when a specific date is picked */}
            {scheduleSelectedDate && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                <Calendar size={14} className="text-blue-600" />
                <span className="text-sm text-blue-900">
                  Showing only <strong>{(() => {
                    const [y, m, d] = scheduleSelectedDate.split("-").map(Number);
                    return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
                  })()}</strong>
                </span>
                <button
                  onClick={() => setScheduleSelectedDate(null)}
                  className="ml-auto text-blue-600 hover:text-blue-900"
                  aria-label="Clear date filter"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {schedLoading ? <div className="py-12 text-center text-gray-400">Loading schedule...</div> : upcomingDates.length === 0 ? (
              <div className="py-16 text-center bg-white border border-dashed border-gray-200 rounded-2xl">
                <Calendar size={48} className="mx-auto text-gray-200 mb-4" />
                <h3 className="font-semibold text-gray-600">No upcoming sessions</h3>
              </div>
            ) : scheduleView === "week" ? (
              <WeekGrid
                sessions={schedule.filter(s => showPastSessions || s.scheduled_date?.toString().split("T")[0] >= today)}
                paletteFor={scheduleOrgPalette}
                onSelect={(dateKey) => { setScheduleSelectedDate(dateKey); setScheduleView("list"); }}
                onOpen={(s) => { const k = s.scheduled_date?.toString().split("T")[0]; if (k) { setScheduleSelectedDate(k); setScheduleView("list"); } }}
              />
            ) : scheduleView === "month" ? (
              <MonthCalendar
                sessions={schedule.filter(s => showPastSessions || s.scheduled_date?.toString().split("T")[0] >= today)}
                paletteFor={scheduleOrgPalette}
                onSelect={(dateKey) => { setScheduleSelectedDate(dateKey); setScheduleView("list"); }}
              />
            ) : (
              <>
                <DateStripBar
                  sessions={schedule.filter(s => showPastSessions || s.scheduled_date?.toString().split("T")[0] >= today)}
                  selectedDate={scheduleSelectedDate}
                  onSelect={setScheduleSelectedDate}
                  paletteFor={scheduleOrgPalette}
                />
                <div className="space-y-6">
                  {visibleDates.map(date => (
                    <div key={date}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-px flex-1 bg-gray-200" />
                        <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">{formatDate(date)}</span>
                        <div className="h-px flex-1 bg-gray-200" />
                      </div>
                      <div className="space-y-2">
                        {byDate[date].map(entry => {
                          const palette = scheduleOrgPalette(entry.org_name);
                          return (
                            <div
                              key={entry.schedule_id}
                              className={`bg-white border rounded-xl p-4 flex items-center gap-4 flex-wrap ${entry.status === "cancelled" ? "border-gray-200 opacity-60" : entry.spots_open > 0 ? "border-amber-200" : "border-gray-200"}`}
                              style={{ borderLeft: `4px solid ${palette.hex}` }}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <OrgChip name={entry.org_name} palette={palette} />
                                  <span className="text-gray-700 text-sm font-medium">{entry.category_name}</span>
                                  {entry.session_type && <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${SESSION_TYPE_COLORS[entry.session_type] || "bg-gray-100 text-gray-600"}`}>{entry.session_type}</span>}
                                  {entry.status === "cancelled" && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Cancelled</span>}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                                  <span className="flex items-center gap-1"><Clock size={11} />{formatTime(entry.start_time)}{entry.end_time ? ` - ${formatTime(entry.end_time)}` : ""}</span>
                                  {entry.location && <span className="flex items-center gap-1"><MapPin size={11} />{entry.location}</span>}
                                  <span className="font-mono">S{entry.session_number}{entry.group_number ? ` G${entry.group_number}` : ""}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                                {entry.status !== "cancelled" && (
                                  <>
                                    {entry.is_goalie_sp ? (
                                      <div className="text-center">
                                        <div className={`text-sm font-bold ${entry.spots_open > 0 ? "text-amber-600" : "text-green-600"}`}>{entry.evaluators_signed_up}/{entry.goalie_evaluators_required}</div>
                                        <div className="text-xs text-gray-400">goalie eval</div>
                                      </div>
                                    ) : entry.session_type === 'testing' ? (
                                      entry.is_goalie_sp
                                        ? <div className="text-center"><div className="text-sm font-bold text-gray-400">—</div><div className="text-xs text-gray-400">no evaluators needed</div></div>
                                        : <TesterStaffingControl entry={entry} spUrl={spUrl} onSaved={refetchSchedule} />
                                    ) : (
                                      <>
                                        <div className="text-center">
                                          <div className={`text-sm font-bold ${entry.spots_open > 0 ? "text-amber-600" : "text-green-600"}`}>{entry.evaluators_signed_up}/{entry.evaluators_required}</div>
                                          <div className="text-xs text-gray-400">player eval</div>
                                        </div>
                                        {parseInt(entry.goalie_evaluators_required) > 0 && (
                                          <div className="text-center">
                                            <div className="text-sm font-bold text-gray-600">{entry.goalie_evaluators_required}</div>
                                            <div className="text-xs text-gray-400">goalie eval</div>
                                          </div>
                                        )}
                                      </>
                                    )}
                                    {entry.session_type === 'testing' && !entry.is_goalie_sp
                                      ? (entry.tester_spots_open > 0 ? <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">{entry.tester_spots_open} tester{entry.tester_spots_open === 1 ? "" : "s"} needed</span> : parseInt(entry.testers_required || 0) > 0 ? <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full flex items-center gap-1"><CheckCircle size={11} /> Testers set</span> : null)
                                      : entry.session_type === 'testing' ? null
                                      : entry.spots_open > 0 ? <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">{entry.spots_open} open</span> : <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full flex items-center gap-1"><CheckCircle size={11} /> Full</span>}
                                    {!entry.is_goalie_sp && <a href={`/checkin/${entry.schedule_id}`} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Check-in</a>}
                                    {entry.spots_open > 0 && <BlastButton scheduleId={entry.schedule_id} spotsOpen={entry.spots_open} />}
                                  </>
                                )}
                                <ScheduleRowControls entry={entry} onSaved={onScheduleSaved} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "leads" && (
          <LeadsSection spUrl={spUrl} orgParam={orgParam} associations={associations} />
        )}

        {activeTab === "reports" && (
          <div className="space-y-6">
            <StaffingReports />
            <EvaluatorEfficiencyReport />
          </div>
        )}

        {activeTab === "evaluators" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Evaluator Pool</h2>
              <div className="flex items-center gap-3">
                {flags.length > 0 && <span className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-full">{flags.length} open flags</span>}
                {pendingHours.length > 0 && <span className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full">{pendingHours.length} pending hours</span>}
                <button onClick={() => setShowSetRates(true)} className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-ink bg-white rounded-lg text-sm font-semibold hover:bg-gray-50">
                  $ Set rates
                </button>
                <button onClick={() => setComposeRecipient({ to_all_pool: true, label: "To everyone in your evaluator pool" })} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90">
                  <MessageSquare size={14} /> Message all pool
                </button>
              </div>
            </div>

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

            <JoinCodesPanel orgId={assocData?.sp?.id} data={joinCodeData} refetch={refetchCodes} />

            <MessagesSection />

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
        )}
      </div>
    </div>
  );
}

export default function ServiceProviderDashboardPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>}>
        <SPDashboard />
      </Suspense>
    </QueryClientProvider>
  );
}
