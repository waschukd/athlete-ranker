"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, MapPin, Check, Loader2, ClipboardList, Users, DollarSign, Inbox, Send, X } from "lucide-react";
import ScheduleBoard from "@/components/ScheduleBoard";

const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.toString().split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, "0")} ${ampm}`;
};
const todayKey = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; };

export default function TesterDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [tab, setTab] = useState("mine");

  const load = useCallback(async () => {
    try { const res = await fetch("/api/tester/sessions"); setData(await res.json()); }
    catch { setData({ isTester: false, available: [], mine: [] }); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (schedule_id, action) => {
    setBusyId(`${action}-${schedule_id}`);
    try { await fetch("/api/tester/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule_id, action }) }); await load(); } catch {}
    setBusyId(null);
  };

  const mine = data?.mine || [];
  const available = data?.available || [];

  const Row = ({ s, mineRow }) => {
    const filled = parseInt(s.testers_signed_up || 0), need = parseInt(s.testers_required || 0);
    const isPast = (s.scheduled_date?.toString().split("T")[0] || "") < todayKey();
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-ink truncate">{s.org_name}</span>
            {s.category_name && <span className="text-xs text-gray-500">· {s.category_name}</span>}
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600">testing</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            {s.start_time && <span className="flex items-center gap-1"><Clock size={11} />{fmtTime(s.start_time)}{s.end_time ? ` – ${fmtTime(s.end_time)}` : ""}</span>}
            {s.location && <span className="flex items-center gap-1"><MapPin size={11} />{s.location}</span>}
            {need > 0 && <span className="flex items-center gap-1"><Users size={11} />{filled}/{need} testers</span>}
          </div>
        </div>
        {mineRow ? (
          <div className="flex items-center gap-2">
            {isPast && <LogHours scheduleId={s.schedule_id} onSaved={load} />}
            <button onClick={() => act(s.schedule_id, "cancel")} disabled={busyId === `cancel-${s.schedule_id}`} className="text-xs px-4 py-2 border border-red-200 text-red-500 rounded-lg font-medium hover:bg-red-50 disabled:opacity-50">
              {busyId === `cancel-${s.schedule_id}` ? "…" : "Cancel"}
            </button>
          </div>
        ) : (
          <button onClick={() => act(s.schedule_id, "signup")} disabled={busyId === `signup-${s.schedule_id}`} className="inline-flex items-center gap-1.5 text-sm px-4 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg font-semibold hover:shadow-md disabled:opacity-50">
            {busyId === `signup-${s.schedule_id}` ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Sign up
          </button>
        )}
      </div>
    );
  };

  const tabs = [
    { id: "mine", label: `My Sessions (${mine.length})` },
    { id: "available", label: `Available (${available.length})` },
    { id: "pay", label: "Hours & Pay" },
    { id: "messages", label: "Messages" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-1">
          <ClipboardList size={22} className="text-accent" />
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">Testing</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">Sign up for testing sessions, track your hours &amp; pay, and message your service provider. Switch roles from the top bar.</p>

        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading…</div>
        ) : !data?.isTester ? (
          <div className="py-14 text-center bg-white border border-dashed border-gray-200 rounded-2xl">
            <ClipboardList size={40} className="mx-auto text-gray-200 mb-3" />
            <h3 className="font-semibold text-gray-600">You're not set up as a tester yet</h3>
            <p className="text-sm text-gray-400 mt-1">On your Service Provider dashboard → Testers, turn on <b>“I'm a tester too.”</b></p>
          </div>
        ) : (
          <>
            <div className="flex gap-1 border-b border-gray-200 mb-5 overflow-x-auto">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? "border-accent text-accent" : "border-transparent text-gray-500 hover:text-gray-700"}`}>{t.label}</button>
              ))}
            </div>

            {tab === "mine" && (
              <ScheduleBoard sessions={mine} storageKey="tester-mine-view" subscribeEndpoint="/api/tester/calendar-link"
                emptyText="You haven't signed up for any testing sessions yet — check Available." renderRow={(s) => <Row s={s} mineRow />} />
            )}
            {tab === "available" && (
              <ScheduleBoard sessions={available} storageKey="tester-avail-view"
                emptyText="No open testing sessions right now." renderRow={(s) => <Row s={s} />} />
            )}
            {tab === "pay" && <HoursPay />}
            {tab === "messages" && <Messages />}
          </>
        )}
      </div>
    </div>
  );
}

// Log hours for a past testing session → shared evaluator_hours (pending).
function LogHours({ scheduleId, onSaved }) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const save = async () => {
    if (!(parseFloat(hours) > 0)) return;
    setBusy(true);
    try { const r = await fetch("/api/tester/hours", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule_id: scheduleId, hours: parseFloat(hours) }) }); if (r.ok) { setDone(true); setOpen(false); onSaved?.(); } } catch {}
    setBusy(false);
  };
  if (done) return <span className="text-xs text-green-600 font-medium inline-flex items-center gap-1"><Check size={12} /> Hours logged</span>;
  if (!open) return <button onClick={() => setOpen(true)} className="text-xs px-3 py-2 border border-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-50">Log hours</button>;
  return (
    <div className="inline-flex items-center gap-1.5">
      <input type="number" min="0" step="0.5" value={hours} onChange={e => setHours(e.target.value)} placeholder="hrs" className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center" />
      <button onClick={save} disabled={busy} className="text-xs px-3 py-2 bg-accent text-white rounded-lg font-semibold disabled:opacity-50">{busy ? "…" : "Save"}</button>
    </div>
  );
}

// Reuses the evaluator pay summary — it reads by membership, so a tester's hours
// and rate (on their SP membership) surface here with no separate endpoint.
function HoursPay() {
  const [orgs, setOrgs] = useState(null);
  useEffect(() => { fetch("/api/evaluator/pay").then(r => r.json()).then(d => setOrgs(d.orgs || [])).catch(() => setOrgs([])); }, []);
  if (!orgs) return <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>;
  if (!orgs.length) return <div className="py-10 text-center bg-white border border-dashed border-gray-200 rounded-xl text-sm text-gray-400">No hours yet. Log hours on a past session in <b>My Sessions</b>; your SP approves and pays them.</div>;
  return (
    <div className="space-y-3">
      {orgs.map(o => (
        <div key={o.org_id} className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink">{o.org_name}</h3>
            {o.hourly_rate != null && <span className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent font-semibold">${o.hourly_rate}/hr</span>}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <div className="bg-gray-50 rounded-lg py-2"><div className="text-lg font-bold text-amber-600">{o.pending_hours}</div><div className="text-xs text-gray-400">Pending</div></div>
            <div className="bg-gray-50 rounded-lg py-2"><div className="text-lg font-bold text-green-600">{o.approved_hours}</div><div className="text-xs text-gray-400">Approved</div></div>
            <div className="bg-gray-50 rounded-lg py-2"><div className="text-lg font-bold text-gray-700">{o.paid_hours}</div><div className="text-xs text-gray-400">Paid</div></div>
          </div>
          {o.earned != null && (
            <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-3">
              <span className="text-gray-500 inline-flex items-center gap-1"><DollarSign size={14} /> Earned</span>
              <span className="font-bold text-ink">${o.earned}{o.paid_amount ? <span className="text-xs font-normal text-gray-400"> · ${o.paid_amount} paid</span> : null}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Reuses the role-agnostic /api/messages inbox; a tester's messages route to
// their SP admins.
function Messages() {
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [compose, setCompose] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => { fetch("/api/messages").then(r => r.json()).then(setData).catch(() => setData({ inbox: [], sent: [] })); }, []);
  useEffect(() => { load(); }, [load]);

  const openMsg = async (m) => {
    setOpenId(openId === m.id ? null : m.id);
    if (!m.read_at) { try { await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mark_read: m.id }) }); load(); } catch {} }
  };
  const send = async () => {
    if (!body.trim()) return;
    setSending(true); setMsg(null);
    try { const r = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body }) }); const d = await r.json(); if (r.ok && d.success) { setMsg({ ok: true, text: `Sent to ${d.sent}` }); setSubject(""); setBody(""); setCompose(false); load(); } else setMsg({ ok: false, text: d.error || "Failed" }); } catch { setMsg({ ok: false, text: "Failed" }); }
    setSending(false);
  };

  const inbox = data?.inbox || [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink inline-flex items-center gap-1.5"><Inbox size={15} className="text-accent" /> Messages</h3>
        <button onClick={() => setCompose(c => !c)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90"><Send size={14} /> Message my SP</button>
      </div>
      {compose && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <textarea rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Message…" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y" />
          <div className="flex items-center justify-end gap-2">
            {msg && <span className={`text-xs ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</span>}
            <button onClick={() => setCompose(false)} className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs">Cancel</button>
            <button onClick={send} disabled={sending || !body.trim()} className="px-4 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold disabled:opacity-50">{sending ? "Sending…" : "Send"}</button>
          </div>
        </div>
      )}
      {!data ? <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
        : inbox.length === 0 ? <div className="py-10 text-center bg-white border border-dashed border-gray-200 rounded-xl text-sm text-gray-400">No messages yet.</div>
        : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {inbox.map(m => (
              <div key={m.id} className={!m.read_at ? "bg-accent-soft/30" : ""}>
                <button onClick={() => openMsg(m)} className="w-full text-left px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">{m.subject}</div>
                    <div className="text-xs text-gray-400 truncate">From {m.from_user_name || m.from_name}</div>
                  </div>
                  {!m.read_at && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />}
                </button>
                {openId === m.id && <div className="px-4 pb-3 text-sm text-gray-700 whitespace-pre-wrap">{m.body}</div>}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
