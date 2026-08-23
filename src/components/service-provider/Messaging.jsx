"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Send, Inbox, Reply } from "lucide-react";

// Compose-message modal — Minimal Athletic look. Self-contained: takes a recipient
// descriptor and posts to the global /api/messages endpoint, then reports back.
//   recipient = { to_all_pool: true, label } | { to_user_ids: [...], label }
export function ComposeMessageModal({ recipient, initialSubject = "", onClose, onSent }) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sentCount, setSentCount] = useState(null);

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30";

  const send = async () => {
    setSending(true);
    setError(null);
    const payload = recipient.to_all_testers
      ? { subject, body, to_all_testers: true }
      : recipient.to_all_pool
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
          <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">Message {recipient.noun ? `${recipient.noun}s` : "evaluators"}</h3>
          <button onClick={onClose} disabled={sending} className="text-gray-400 hover:text-gray-600 disabled:opacity-50"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4">{recipient.label}</p>
        {sentCount !== null ? (
          <div className="text-center py-4">
            <p className="font-semibold text-ink mb-3">Sent to {sentCount} {recipient.noun || "evaluator"}{sentCount === 1 ? "" : "s"}.</p>
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
export function MessagesSection() {
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
