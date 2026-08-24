"use client";

import { useState, useEffect, useRef } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";

// Per-recipient delivery status + individual resend for a non-session email
// type (welcome, report). Session/group-assignment emails have their own
// richer panel (GroupEmailDialog) grouped by session + group.
const STATUS = {
  delivered: { label: "Delivered", cls: "bg-green-100 text-green-700" },
  opened: { label: "Opened", cls: "bg-emerald-100 text-emerald-700" },
  clicked: { label: "Clicked", cls: "bg-emerald-100 text-emerald-700" },
  sent: { label: "Sent (pending)", cls: "bg-blue-100 text-blue-700" },
  delayed: { label: "Delayed", cls: "bg-amber-100 text-amber-700" },
  bounced: { label: "Bounced", cls: "bg-red-100 text-red-700" },
  complained: { label: "Spam complaint", cls: "bg-red-100 text-red-700" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-700" },
  skipped: { label: "Skipped", cls: "bg-gray-100 text-gray-500" },
};

export default function ParentEmailStatusPanel({ catId, type, onResend, reloadToken }) {
  const [data, setData] = useState(null);
  const [resendingKey, setResendingKey] = useState(null);
  const pollRef = useRef(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/categories/${catId}/email-status?type=${type}`);
      const d = await res.json();
      if (res.ok) setData(d);
    } catch { /* keep last-known statuses on a transient fetch failure */ }
  };

  useEffect(() => {
    load();
    let ticks = 0;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => { ticks++; await load(); if (ticks >= 18) clearInterval(pollRef.current); }, 5000);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catId, type, reloadToken]);

  const statuses = data?.statuses || [];
  const counts = data?.counts || {};
  if (!statuses.length) return null;

  const resend = async (row) => {
    const key = `${row.athlete_id}:${row.recipient_email}`;
    setResendingKey(key);
    try { await onResend(row); await load(); } finally { setResendingKey(null); }
  };

  return (
    <div className="mt-3 border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(STATUS).filter(k => counts[k]).map(k => (
            <span key={k} className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS[k].cls}`}>{counts[k]} {STATUS[k].label}</span>
          ))}
        </div>
        <button onClick={load} className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 inline-flex items-center gap-1"><RefreshCw size={11} /> Refresh</button>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
        {statuses.map((r, i) => {
          const key = `${r.athlete_id}:${r.recipient_email}`;
          return (
            <div key={i} className="px-4 py-1.5 flex items-center justify-between gap-2 text-xs">
              <span className="text-gray-700 truncate">{r.athlete_name}<span className="text-gray-400"> · {r.recipient_email}</span></span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`px-2 py-0.5 rounded-full font-medium ${(STATUS[r.status] || STATUS.failed).cls}`} title={r.error || ""}>{(STATUS[r.status] || { label: r.status }).label}</span>
                <button onClick={() => resend(r)} disabled={resendingKey === key} title="Resend to this family" className="text-gray-400 hover:text-accent disabled:opacity-40">
                  <RotateCcw size={12} className={resendingKey === key ? "animate-spin" : ""} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
