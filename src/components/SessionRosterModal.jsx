"use client";

import { useState, useEffect, useCallback } from "react";
import { X, UserPlus, Clock, MapPin, Shield, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";

// Who's on a session, and (for those authorized) place or take a spot.
// Self-contained: give it a scheduleId, it fetches /api/schedule/[id]/roster.
export default function SessionRosterModal({ scheduleId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [addKind, setAddKind] = useState(null); // 'evaluator' | 'tester' while a picker is open
  const [messageKind, setMessageKind] = useState(null); // 'evaluator' | 'tester' while composing
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [messageResult, setMessageResult] = useState(null); // { sent } | { error }
  const [dayFor, setDayFor] = useState(null); // user_id whose day is expanded
  const [dayData, setDayData] = useState({}); // user_id -> 'loading' | { user, date, sessions } | { error }
  const [pending, setPending] = useState(null); // { kind, user_id, name, subsequent: [], selected: Set } while confirming which later sessions to add them to

  // Real complaint: too many evaluators take the convenient slot and skip a
  // harder one later the same day, with no quick way to check. Click a name
  // here and see their whole day right away, not just this session's org.
  const toggleDay = async (user_id) => {
    if (dayFor === user_id) { setDayFor(null); return; }
    setDayFor(user_id);
    if (dayData[user_id] && dayData[user_id] !== "error") return;
    setDayData(d => ({ ...d, [user_id]: "loading" }));
    try {
      const res = await fetch(`/api/schedule/${scheduleId}/roster/day?user_id=${user_id}`);
      const d = await res.json();
      setDayData(dd => ({ ...dd, [user_id]: res.ok ? d : { error: d.error || "Couldn't load their day." } }));
    } catch { setDayData(dd => ({ ...dd, [user_id]: { error: "Couldn't load their day." } })); }
  };

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/schedule/${scheduleId}/roster`);
      const d = await res.json();
      if (!res.ok) setErr(d.error || "Couldn't load the session.");
      else setData(d);
    } catch { setErr("Couldn't load the session."); }
    setLoading(false);
  }, [scheduleId]);

  useEffect(() => { load(); }, [load]);

  const act = async (method, user_id, kind) => {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/schedule/${scheduleId}/roster`, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, kind }),
      });
      const d = await res.json();
      if (!res.ok) setErr(d.error || "That didn't work.");
      else { setAddKind(null); await load(); }
    } catch { setErr("That didn't work."); }
    setBusy(false);
  };

  // Picking a name from the Add list doesn't add them right away -- first
  // check whether this category has later groups at the same rink that day
  // they aren't already on (the classic BAHA/EFHA/SEERA multi-group block).
  // If so, offer to add them to those too instead of making the director
  // repeat "Add" once per group. No later groups -> add immediately, same as
  // before.
  const pickToAdd = async (kind, m) => {
    try {
      const res = await fetch(`/api/schedule/${scheduleId}/roster/subsequent?user_id=${m.user_id}&kind=${kind}`);
      const d = await res.json();
      const subsequent = res.ok ? (d.sessions || []) : [];
      if (subsequent.length) {
        setPending({ kind, user_id: m.user_id, name: m.name || m.email, subsequent, selected: new Set(subsequent.map(s => s.schedule_id)) });
      } else {
        await act("POST", m.user_id, kind);
      }
    } catch {
      await act("POST", m.user_id, kind);
    }
  };
  const toggleSubsequent = (sid) => {
    setPending(p => {
      if (!p) return p;
      const selected = new Set(p.selected);
      if (selected.has(sid)) selected.delete(sid); else selected.add(sid);
      return { ...p, selected };
    });
  };
  const confirmAdd = async () => {
    if (!pending) return;
    setBusy(true); setErr("");
    try {
      const targets = [scheduleId, ...pending.selected];
      for (const sid of targets) {
        const res = await fetch(`/api/schedule/${sid}/roster`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: pending.user_id, kind: pending.kind }),
        });
        if (!res.ok) { const d = await res.json(); setErr(d.error || "That didn't work for one of the sessions."); }
      }
    } catch { setErr("That didn't work."); }
    setPending(null); setAddKind(null);
    await load();
    setBusy(false);
  };
  const addJustThisOne = async () => {
    if (!pending) return;
    const { user_id, kind } = pending;
    setPending(null);
    await act("POST", user_id, kind);
  };

  const reopen = async (user_id) => {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/schedule/${scheduleId}/roster`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen", user_id }),
      });
      const d = await res.json();
      if (!res.ok) setErr(d.error || "Couldn't reopen.");
      else await load();
    } catch { setErr("Couldn't reopen."); }
    setBusy(false);
  };

  // Instructions to exactly the people working THIS session -- reuses the
  // general staff-messaging endpoint (in-app notification + email) rather
  // than a new send path, scoped to this group's own user_ids so a director
  // can say "here's what to watch for tonight" without a broader blast.
  const openMessage = (kind) => {
    const s = data.session;
    setMessageKind(kind);
    setMessageSubject(`${s.category_name} — Session ${s.session_number}${s.group_number ? ` Group ${s.group_number}` : ""}`);
    setMessageBody("");
    setMessageResult(null);
  };
  const closeMessage = () => { setMessageKind(null); setMessageBody(""); setMessageResult(null); };
  const sendMessage = async () => {
    const people = messageKind === "evaluator" ? data.evaluators : data.testers;
    const to_user_ids = people.map(p => p.user_id);
    setMessageSending(true); setMessageResult(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: messageSubject, body: messageBody, to_user_ids }),
      });
      const d = await res.json();
      setMessageResult(res.ok ? { sent: d.sent } : { error: d.error || "Couldn't send." });
    } catch { setMessageResult({ error: "Couldn't send." }); }
    setMessageSending(false);
  };

  const s = data?.session;
  const fmtTime = (t) => { if (!t) return ""; const [h, m] = String(t).split(":"); const hr = parseInt(h); return `${hr % 12 === 0 ? 12 : hr % 12}:${m} ${hr >= 12 ? "PM" : "AM"}`; };
  const fmtDate = (d) => d ? new Date(String(d).split("T")[0] + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: "88vh" }}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">Who's on this session</h3>
            {s && (
              <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-gray-700">{s.category_name}</span>
                <span className="font-mono">S{s.session_number}{s.group_number ? ` G${s.group_number}` : ""}</span>
                <span className="flex items-center gap-1"><Clock size={11} />{fmtDate(s.scheduled_date)} · {fmtTime(s.start_time)}</span>
                {s.location && <span className="flex items-center gap-1"><MapPin size={11} />{s.location}</span>}
              </p>
            )}
          </div>
          <button onClick={() => !busy && onClose()} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex-1">
          {loading ? (
            <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
          ) : err && !data ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{err}</div>
          ) : (
            <>
              {err && <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-sm text-red-700 mb-3">{err}</div>}

              {data.canManage && (
                <div className="mb-4 flex items-center gap-2 text-[11px] text-gray-400">
                  <Shield size={12} className="text-accent" /> You can manage this session's evaluators.
                </div>
              )}

              {(s.evaluators_required > 0 || data.evaluators.length > 0) && (
                <RosterGroup
                  title="Evaluators" kind="evaluator"
                  people={data.evaluators} required={s.evaluators_required}
                  canManage={data.canManage} addable={data.addable?.evaluators || []}
                  addOpen={addKind === "evaluator"} onOpenAdd={() => setAddKind(addKind === "evaluator" ? null : "evaluator")}
                  onPick={(m) => pickToAdd("evaluator", m)} onRemove={(uid) => act("DELETE", uid, "evaluator")}
                  onReopen={reopen}
                  busy={busy}
                  messageOpen={messageKind === "evaluator"} onOpenMessage={() => openMessage("evaluator")} onCloseMessage={closeMessage}
                  messageSubject={messageSubject} setMessageSubject={setMessageSubject}
                  messageBody={messageBody} setMessageBody={setMessageBody}
                  onSendMessage={sendMessage} messageSending={messageSending} messageResult={messageResult}
                  dayFor={dayFor} dayData={dayData} onToggleDay={toggleDay}
                  pending={pending?.kind === "evaluator" ? pending : null}
                  onToggleSubsequent={toggleSubsequent} onConfirmAdd={confirmAdd} onAddJustThisOne={addJustThisOne} onCancelPending={() => setPending(null)}
                />
              )}

              {(s.testers_required > 0 || data.testers.length > 0) && (
                <div className={s.evaluators_required > 0 || data.evaluators.length > 0 ? "mt-5" : ""}>
                  <RosterGroup
                    title="Testers" kind="tester"
                    people={data.testers} required={s.testers_required}
                    canManage={data.canManage} addable={data.addable?.testers || []}
                    addOpen={addKind === "tester"} onOpenAdd={() => setAddKind(addKind === "tester" ? null : "tester")}
                    onPick={(m) => pickToAdd("tester", m)} onRemove={(uid) => act("DELETE", uid, "tester")}
                    messageOpen={messageKind === "tester"} onOpenMessage={() => openMessage("tester")} onCloseMessage={closeMessage}
                    messageSubject={messageSubject} setMessageSubject={setMessageSubject}
                    messageBody={messageBody} setMessageBody={setMessageBody}
                    onSendMessage={sendMessage} messageSending={messageSending} messageResult={messageResult}
                    busy={busy}
                    dayFor={dayFor} dayData={dayData} onToggleDay={toggleDay}
                    pending={pending?.kind === "tester" ? pending : null}
                    onToggleSubsequent={toggleSubsequent} onConfirmAdd={confirmAdd} onAddJustThisOne={addJustThisOne} onCancelPending={() => setPending(null)}
                  />
                </div>
              )}

              {s.evaluators_required <= 0 && data.evaluators.length === 0 && s.testers_required <= 0 && data.testers.length === 0 && (
                <div className="text-sm text-gray-400 py-4 text-center">Nobody's signed up to this session yet.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtDayTime(t) { if (!t) return ""; const [h, m] = String(t).split(":"); const hr = parseInt(h); return `${hr % 12 === 0 ? 12 : hr % 12}:${m} ${hr >= 12 ? "PM" : "AM"}`; }

// Inline "their whole day" panel, shown under a name once clicked. Sorted by
// time so it reads as a timeline -- the convenient slot next to whatever else
// they're on (or skipping) that same day, across every org, not just this one.
function DayPanel({ userId, dayData }) {
  const d = dayData[userId];
  if (d === "loading" || d === undefined) return <div className="px-3 pb-2.5 text-xs text-gray-400">Loading their day…</div>;
  if (d?.error) return <div className="px-3 pb-2.5 text-xs text-red-600">{d.error}</div>;
  if (!d.sessions?.length) return <div className="px-3 pb-2.5 text-xs text-gray-400">No other active sessions found for {d.date}.</div>;
  return (
    <div className="px-3 pb-2.5">
      <div className="border-l-2 border-gray-200 ml-1 pl-3 flex flex-col gap-1.5">
        {d.sessions.map(s => (
          <div key={`${s.role}-${s.id}`} className={`text-xs flex items-center gap-2 flex-wrap ${s.id === d.this_schedule_id ? "font-semibold text-accent" : "text-gray-600"}`}>
            <span className="font-mono tabular-nums">{fmtDayTime(s.start_time)}{s.end_time ? `–${fmtDayTime(s.end_time)}` : ""}</span>
            <span>{s.org_name} · {s.label}</span>
            {s.session_number != null && <span className="text-gray-400">S{s.session_number}{s.group_number ? `G${s.group_number}` : ""}</span>}
            {s.location && <span className="text-gray-400">@ {s.location}</span>}
            <span className="text-[10px] uppercase tracking-wide text-gray-400">{s.role}</span>
            {s.id === d.this_schedule_id && <span className="text-[10px] uppercase tracking-wide">this session</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RosterGroup({
  title, people, required, canManage, addable, addOpen, onOpenAdd, onPick, onRemove, onReopen, busy,
  messageOpen, onOpenMessage, onCloseMessage, messageSubject, setMessageSubject, messageBody, setMessageBody,
  onSendMessage, messageSending, messageResult, dayFor, dayData, onToggleDay,
  pending, onToggleSubsequent, onConfirmAdd, onAddJustThisOne, onCancelPending,
}) {
  const [filter, setFilter] = useState("");
  const filteredAddable = filter.trim()
    ? addable.filter(m => (m.name || m.email || "").toLowerCase().includes(filter.trim().toLowerCase()))
    : addable;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
          {title} <span className="text-gray-400 font-medium">· {people.length}{required ? ` of ${required}` : ""}</span>
        </div>
        <div className="flex items-center gap-3">
          {canManage && people.length > 0 && (
            <button onClick={onOpenMessage} disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:opacity-70 disabled:opacity-40">
              <MessageSquare size={13} /> Message
            </button>
          )}
          {canManage && addable.length > 0 && (
            <button onClick={onOpenAdd} disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:opacity-70 disabled:opacity-40">
              <UserPlus size={13} /> Add
            </button>
          )}
        </div>
      </div>

      {canManage && messageOpen && (
        <div className="mb-3 border border-accent/30 bg-accent-soft/30 rounded-lg p-3">
          {messageResult?.sent != null ? (
            <div className="text-sm text-gray-700 flex items-center justify-between">
              <span>Sent to {messageResult.sent} {title.toLowerCase()}.</span>
              <button onClick={onCloseMessage} className="text-xs font-semibold text-accent hover:opacity-70">Done</button>
            </div>
          ) : (
            <>
              <div className="text-[11px] font-semibold text-gray-500 mb-1.5">Message these {people.length} {title.toLowerCase()} — sent as an email + in-app notification.</div>
              <input value={messageSubject} onChange={e => setMessageSubject(e.target.value)} placeholder="Subject"
                className="w-full mb-2 px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              <textarea value={messageBody} onChange={e => setMessageBody(e.target.value)} rows={3} placeholder="What do they need to know for this session?"
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/30" />
              {messageResult?.error && <div className="mt-1.5 text-xs text-red-600">{messageResult.error}</div>}
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={onCloseMessage} disabled={messageSending} className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700 disabled:opacity-40">Cancel</button>
                <button onClick={onSendMessage} disabled={messageSending || !messageBody.trim()}
                  className="text-xs px-3 py-1.5 bg-accent text-white rounded-md font-semibold hover:opacity-90 disabled:opacity-40">
                  {messageSending ? "Sending…" : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {people.length === 0 ? (
        <div className="text-sm text-gray-400 py-2">Nobody signed up yet.</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {people.map(p => (
            <div key={p.user_id} className="rounded-lg bg-gray-50 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <button onClick={() => onToggleDay?.(p.user_id)} disabled={!onToggleDay}
                  title="See their full schedule that day"
                  className="min-w-0 flex items-center gap-1 text-left hover:text-accent disabled:cursor-default disabled:hover:text-inherit">
                  {onToggleDay && (dayFor === p.user_id ? <ChevronUp size={12} className="flex-shrink-0 text-gray-400" /> : <ChevronDown size={12} className="flex-shrink-0 text-gray-400" />)}
                  <span className="text-sm text-gray-800 truncate">{p.name || p.email}</span>
                  {p.assigned && <span className="ml-1 text-[10px] uppercase tracking-wide text-accent bg-accent-soft rounded px-1.5 py-0.5 flex-shrink-0">assigned</span>}
                  {p.closed && <span className="ml-1 text-[10px] uppercase tracking-wide text-green-700 bg-green-100 rounded px-1.5 py-0.5 flex-shrink-0">closed</span>}
                </button>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {canManage && onReopen && p.closed && (
                    <button onClick={() => onReopen(p.user_id)} disabled={busy}
                      className="text-xs font-semibold text-accent hover:opacity-70 disabled:opacity-40">Reopen</button>
                  )}
                  {canManage && (
                    <button onClick={() => onRemove(p.user_id)} disabled={busy}
                      className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-40">Remove</button>
                  )}
                </div>
              </div>
              {dayFor === p.user_id && <DayPanel userId={p.user_id} dayData={dayData} />}
            </div>
          ))}
        </div>
      )}

      {canManage && addOpen && pending && (
        <div className="mt-2 border border-accent/30 bg-accent-soft/30 rounded-lg p-3">
          <div className="text-sm text-gray-800 mb-2">
            Add <strong>{pending.name}</strong> to this session — also add them to these later sessions the same day?
          </div>
          <div className="flex flex-col gap-1 mb-3 max-h-40 overflow-y-auto">
            {pending.subsequent.map(s => (
              <label key={s.schedule_id} className="flex items-center gap-2 text-xs text-gray-700 px-1 py-1 rounded hover:bg-white/60">
                <input type="checkbox" checked={pending.selected.has(s.schedule_id)} onChange={() => onToggleSubsequent(s.schedule_id)} />
                <span className="font-mono tabular-nums">{fmtDayTime(s.start_time)}{s.end_time ? `–${fmtDayTime(s.end_time)}` : ""}</span>
                <span>S{s.session_number}G{s.group_number}</span>
                {s.spots_open <= 0 && <span className="text-amber-600">(full — will still add)</span>}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onCancelPending} disabled={busy} className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700 disabled:opacity-40">Cancel</button>
            <button onClick={onAddJustThisOne} disabled={busy} className="text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md font-medium disabled:opacity-40">Just this one</button>
            <button onClick={onConfirmAdd} disabled={busy} className="text-xs px-3 py-1.5 bg-accent text-white rounded-md font-semibold hover:opacity-90 disabled:opacity-40">
              Add to {1 + pending.selected.size} session{1 + pending.selected.size === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}

      {canManage && addOpen && !pending && (
        <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
          {addable.length > 5 && (
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search name…" autoFocus
              className="w-full px-3 py-2 text-sm border-b border-gray-100 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-inset" />
          )}
          <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {addable.length === 0 ? (
              <div className="text-sm text-gray-400 px-3 py-2">Everyone eligible is already on.</div>
            ) : filteredAddable.length === 0 ? (
              <div className="text-sm text-gray-400 px-3 py-2">No match for "{filter}".</div>
            ) : filteredAddable.map(m => (
              <button key={m.user_id} onClick={() => onPick(m)} disabled={busy}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-accent-soft disabled:opacity-40 flex items-center justify-between">
                <span>{m.name || m.email}{m.is_lead ? <span className="ml-2 text-[10px] uppercase text-accent">lead</span> : ""}</span>
                <UserPlus size={13} className="text-accent" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
