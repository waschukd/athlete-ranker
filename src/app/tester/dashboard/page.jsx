"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, MapPin, Check, Loader2, ClipboardList, Users, DollarSign, Inbox, Send, X, AlertTriangle, LogOut } from "lucide-react";
import ScheduleBoard from "@/components/ScheduleBoard";
import BatchSignupPrompt from "@/components/BatchSignupPrompt";
import { contiguousBlock } from "@/lib/sessionBlocks";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import InstallAppButton from "@/components/InstallAppButton";
import { isSessionPast } from "@/lib/sessionTiming";

const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.toString().split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, "0")} ${ampm}`;
};
export default function TesterDashboard() {
  const [theme, toggleTheme] = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [tab, setTab] = useState("mine");
  const [actMsg, setActMsg] = useState(null);

  const load = useCallback(async () => {
    try { const res = await fetch("/api/tester/sessions"); setData(await res.json()); }
    catch { setData({ isTester: false, available: [], mine: [] }); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Sessions signed up for THIS visit (schedule_id → snapshot). After load()
  // drops them from the server's available list, we re-insert the snapshot so
  // the card stays exactly where it was — flipped to "Signed up ✓" — instead of
  // the list reflowing and losing the person's scroll spot. Cleared on tab switch.
  const [justSignedUp, setJustSignedUp] = useState(() => new Map());

  const act = async (schedule_id, action) => {
    setBusyId(`${action}-${schedule_id}`); setActMsg(null);
    try {
      const res = await fetch("/api/tester/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule_id, action }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) setActMsg({ type: "error", text: d.error || "Something went wrong." });
      else if (action === "signup") {
        const snap = (data?.available || []).find(s => s.schedule_id === schedule_id);
        if (snap) setJustSignedUp(m => new Map(m).set(schedule_id, snap));
      }
      await load();
    } catch { setActMsg({ type: "error", text: "Network error — please try again." }); }
    setBusyId(null);
  };

  const mine = data?.mine || [];
  const available = data?.available || [];
  // What the Available tab renders: fresh server list + just-signed-up snapshots
  // re-inserted (ScheduleBoard sorts by date/time, so each lands back in place).
  const availDisplay = justSignedUp.size === 0 ? available
    : [...available, ...[...justSignedUp.entries()].filter(([id]) => !available.some(s => s.schedule_id === id)).map(([, s]) => s)];

  // Flag an available session that overlaps one you're already signed up for —
  // you can't be at two testing sessions at once.
  const myOccupied = mine
    .filter(s => (!s.signup_status || s.signup_status === "signed_up") && s.start_time && s.end_time)
    .map(s => ({ dateKey: s.scheduled_date?.toString().split("T")[0], start: s.start_time?.toString(), end: s.end_time?.toString(),
      label: `${fmtTime(s.start_time)}–${fmtTime(s.end_time)}${s.location ? ` @ ${s.location}` : ""}` }));
  const conflictFor = (s) => {
    const dateKey = s.scheduled_date?.toString().split("T")[0];
    const start = s.start_time?.toString(), end = s.end_time?.toString();
    if (!dateKey || !start || !end) return null;
    return myOccupied.find(o => o.dateKey === dateKey && o.start < end && o.end > start) || null;
  };

  // Batch signup for a back-to-back block at the same rink/day.
  const [batchPrompt, setBatchPrompt] = useState(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const handleSignup = (schedule_id) => {
    const clicked = available.find(s => s.schedule_id === schedule_id);
    const block = clicked ? contiguousBlock(clicked, available) : [];
    if (block.length > 1) setBatchPrompt({ sessions: block, anchorId: schedule_id });
    else act(schedule_id, "signup");
  };
  const signupBlock = async (ids) => {
    setBatchBusy(true); setActMsg(null);
    let failed = null;
    try {
      for (const sid of ids) {
        const res = await fetch("/api/tester/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule_id: sid, action: "signup" }) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || d.error) { failed = d.error || "Some sessions in the block couldn't be added."; break; }
        const snap = available.find(s => s.schedule_id === sid);
        if (snap) setJustSignedUp(m => new Map(m).set(sid, snap));
      }
      // Stay on Available, in place — the cards flip to "Signed up ✓" instead
      // of the page jumping to My Sessions.
      await load(); setBatchPrompt(null);
      if (failed) setActMsg({ type: "error", text: failed });
    } finally { setBatchBusy(false); }
  };

  const Row = ({ s, mineRow }) => {
    const filled = parseInt(s.testers_signed_up || 0), need = parseInt(s.testers_required || 0);
    const isPast = isSessionPast(s);
    const signedUp = !mineRow && justSignedUp.has(s.schedule_id);
    const conflict = !mineRow && !signedUp ? conflictFor(s) : null;
    return (
      <div className={`bg-white border rounded-xl p-4 flex items-center gap-4 flex-wrap ${signedUp ? "border-green-300 bg-green-50/30" : "border-gray-200"}`}>
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
            {isPast
              ? <span className="text-xs text-green-600 font-medium inline-flex items-center gap-1"><Check size={12} /> Hours auto-logged</span>
              : <button onClick={() => act(s.schedule_id, "cancel")} disabled={busyId === `cancel-${s.schedule_id}`} className="text-xs px-4 py-2 border border-red-200 text-red-500 rounded-lg font-medium hover:bg-red-50 disabled:opacity-50">
                  {busyId === `cancel-${s.schedule_id}` ? "…" : "Cancel"}
                </button>}
          </div>
        ) : signedUp ? (
          <span className="inline-flex items-center gap-1.5 text-sm px-4 py-2 bg-green-50 text-green-700 border border-green-300 rounded-lg font-semibold whitespace-nowrap">
            <Check size={14} /> Signed up
          </span>
        ) : conflict ? (
          <span title={`You're already booked ${conflict.label}`} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg font-semibold whitespace-nowrap cursor-not-allowed">
            <AlertTriangle size={13} /> Busy at this time
          </span>
        ) : (
          <button onClick={() => handleSignup(s.schedule_id)} disabled={busyId === `signup-${s.schedule_id}`} className="inline-flex items-center gap-1.5 text-sm px-4 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg font-semibold hover:shadow-md disabled:opacity-50">
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
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2 flex justify-end items-center gap-3">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <InstallAppButton />
          <NotificationBell />
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1">
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-1 pb-5">
          <div className="font-display text-xs font-bold tracking-[0.2em] uppercase text-accent mb-2">Tester</div>
          <div className="flex items-end gap-4 flex-wrap">
            <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">Testing</h1>
            <img src="/mark-gold.svg" style={{ width: "48px", height: "44px", objectFit: "contain" }} alt="" />
          </div>
          <p className="text-sm text-gray-500 mt-3">Sign up for testing sessions, track your hours &amp; pay, and message your service provider.</p>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-8">

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
            {actMsg && (
              <div className={`mb-4 rounded-xl px-4 py-3 text-sm flex items-start justify-between gap-3 ${actMsg.type === "error" ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
                <span>{actMsg.text}</span>
                <button onClick={() => setActMsg(null)} className="text-current opacity-60 hover:opacity-100 flex-shrink-0">✕</button>
              </div>
            )}
            <div className="flex gap-1 border-b border-gray-200 mb-5 overflow-x-auto">
              {tabs.map(t => (
                <button key={t.id} onClick={() => { setTab(t.id); setJustSignedUp(new Map()); }} className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? "border-accent text-accent" : "border-transparent text-gray-500 hover:text-gray-700"}`}>{t.label}</button>
              ))}
            </div>

            {tab === "mine" && (
              <ScheduleBoard sessions={mine} storageKey="tester-mine-view" subscribeEndpoint="/api/tester/calendar-link"
                emptyText="You haven't signed up for any testing sessions yet — check Available." renderRow={(s) => <Row s={s} mineRow />} />
            )}
            {tab === "available" && (
              <ScheduleBoard sessions={availDisplay} storageKey="tester-avail-view"
                emptyText="No open testing sessions right now." renderRow={(s) => <Row s={s} />} />
            )}
            {tab === "pay" && <HoursPay />}
            {tab === "messages" && <Messages />}
          </>
        )}
      </div>

      <BatchSignupPrompt
        data={batchPrompt} busy={batchBusy} role="tester"
        onAll={() => signupBlock(batchPrompt.sessions.map(s => s.schedule_id))}
        onJustOne={() => { const id = batchPrompt.anchorId; setBatchPrompt(null); act(id, "signup"); }}
        onClose={() => setBatchPrompt(null)}
      />
    </div>
  );
}

// Reuses the evaluator pay summary — it reads by membership, so a tester's hours
// and rate (on their SP membership) surface here with no separate endpoint.
function HoursPay() {
  const [orgs, setOrgs] = useState(null);
  useEffect(() => { fetch("/api/evaluator/pay").then(r => r.json()).then(d => setOrgs(d.orgs || [])).catch(() => setOrgs([])); }, []);
  if (!orgs) return <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>;
  if (!orgs.length) return <div className="py-10 text-center bg-white border border-dashed border-gray-200 rounded-xl text-sm text-gray-400">No hours yet. Once you&apos;ve worked a testing session, your hours are calculated automatically from your schedule; your SP approves and pays them.</div>;
  return (
    <div className="space-y-3">
      {orgs.map(o => (
        <div key={o.org_id} className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink">{o.org_name}</h3>
            {o.tester_hourly_rate != null && <span className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent font-semibold" title="Testing rate">${o.tester_hourly_rate}/hr</span>}
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
