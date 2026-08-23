"use client";

import { X, Send } from "lucide-react";

const CANNED = ["Running late", "Taking a quick break", "Anyone see a black #?"];

// A quick shared board for the evaluators actually signed up to THIS session,
// for exactly the kind of thing that comes up mid-session: "running late",
// "anyone see a black #23?". Not a general chat and not tied to the
// SP<->evaluator messages inbox.
// text/setText are controlled from the parent (not owned here) because onSend
// only clears them on a successful send -- on a network failure the message
// stays put so the user can retry, which this component has no way to know
// on its own.
export default function TeamPingModal({ pings, meUserId, sending, text, setText, onSend, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <h3 className="font-display font-bold text-ink">Team ping</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {pings.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No pings yet — say hi to whoever else is on this session.</div>
          ) : (
            [...pings].reverse().map(p => (
              <div key={p.id} className={`rounded-xl px-3 py-2 max-w-[85%] ${p.user_id === meUserId ? "ml-auto bg-accent text-white" : "bg-gray-100 text-ink"}`}>
                {p.user_id !== meUserId && <div className="text-[10px] font-bold uppercase tracking-wide opacity-60 mb-0.5">{p.name}</div>}
                <div className="text-sm break-words">{p.message}</div>
              </div>
            ))
          )}
        </div>
        <div className="p-3 border-t border-gray-100 flex-shrink-0 space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {CANNED.map(canned => (
              <button key={canned} disabled={sending} onClick={() => onSend(canned)} className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-full text-gray-600 hover:bg-gray-50 disabled:opacity-50">{canned}</button>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); onSend(text); }} className="flex items-center gap-2">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Message the group…"
              maxLength={200}
              className="flex-1 min-w-0 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <button type="submit" disabled={!text.trim() || sending} className="p-2.5 bg-accent text-white rounded-full disabled:opacity-40 flex-shrink-0"><Send size={16} /></button>
          </form>
        </div>
      </div>
    </div>
  );
}
