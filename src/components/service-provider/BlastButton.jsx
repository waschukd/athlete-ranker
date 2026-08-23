"use client";

import { useState } from "react";

export default function BlastButton({ scheduleId, spotsOpen }) {
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
