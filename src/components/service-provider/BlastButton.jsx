"use client";

import { useState } from "react";
import { formatTime } from "@/lib/spDashboardUtils";

// `sessions` is the contiguous back-to-back block around the clicked session
// (lib/sessionBlocks.contiguousBlock) -- always at least the one session
// itself, plus any open siblings at the same rink on the same day within the
// gap threshold. Real complaint: evaluators' inboxes filling up with a
// separate blast per session when several open slots in a row at one arena
// got announced one at a time. Bundling them into one email (with a
// checkbox per session, in case one of the "siblings" shouldn't be
// included) is the same "want these back-to-back sessions too?" idea
// already offered to an evaluator signing up, just aimed at the admin
// announcing the openings instead.
export default function BlastButton({ sessions }) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(() => new Set(sessions.map(s => s.schedule_id)));

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const totalOpen = sessions.reduce((sum, s) => sum + (s.spots_open || 0), 0);
  const chosen = sessions.filter(s => selected.has(s.schedule_id));
  const isMulti = sessions.length > 1;

  const sendBlast = async () => {
    if (!chosen.length) return;
    setSending(true);
    const res = await fetch("/api/service-provider/notify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule_ids: chosen.map(s => s.schedule_id), message }),
    });
    setResult(await res.json());
    setSending(false);
  };

  return (
    <>
      <button onClick={() => setShowModal(true)} className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-200 font-medium">
        Blast ({totalOpen} open{isMulti ? ` · ${sessions.length} sessions` : ""})
      </button>
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h3 className="font-bold text-gray-900 mb-1">Blast Evaluator Pool</h3>
            {result ? (
              <div className="text-center py-4">
                <p className="font-semibold text-gray-900 mb-2">{result.message}</p>
                <button onClick={() => { setShowModal(false); setResult(null); }} className="px-5 py-2 bg-[#0b5cd6] text-white rounded-lg text-sm">Done</button>
              </div>
            ) : (
              <>
                {isMulti ? (
                  <p className="text-sm text-gray-500 mb-3">
                    {sessions.length} open sessions back to back at {sessions[0].location || "this rink"} — sent as ONE email listing all of them, not {sessions.length} separate ones.
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 mb-4">{sessions[0]?.spots_open} spot{sessions[0]?.spots_open !== 1 ? "s" : ""} need to be filled.</p>
                )}
                {isMulti && (
                  <div className="mb-4 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
                    {sessions.map(s => (
                      <label key={s.schedule_id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={selected.has(s.schedule_id)} onChange={() => toggle(s.schedule_id)} className="rounded border-gray-300" />
                        <span className="flex-1 text-gray-700">{formatTime(s.start_time)}{s.end_time ? ` – ${formatTime(s.end_time)}` : ""}</span>
                        <span className="text-amber-600 font-medium text-xs">{s.spots_open} open</span>
                      </label>
                    ))}
                  </div>
                )}
                <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Optional message..." className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6] resize-none mb-4" rows={3} />
                <div className="flex gap-3">
                  <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm">Cancel</button>
                  <button onClick={sendBlast} disabled={sending || !chosen.length} className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                    {sending ? "Sending..." : isMulti ? `Send Blast (${chosen.length} session${chosen.length === 1 ? "" : "s"})` : "Send Blast"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
