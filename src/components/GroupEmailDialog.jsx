"use client";

import { useState, useEffect, useRef } from "react";
import { Mail, X, CheckCircle, AlertTriangle, RefreshCw, Send, Clock } from "lucide-react";

// Group-assignment email sender + live delivery panel for the Groups page.
// Preview (who gets what, per group) → confirm → send → poll delivered/bounced.
const STATUS = {
  delivered: { label: "Delivered", cls: "bg-green-100 text-green-700" },
  sent: { label: "Sent (pending)", cls: "bg-blue-100 text-blue-700" },
  delayed: { label: "Delayed", cls: "bg-amber-100 text-amber-700" },
  bounced: { label: "Bounced", cls: "bg-red-100 text-red-700" },
  complained: { label: "Spam complaint", cls: "bg-red-100 text-red-700" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-700" },
  no_email: { label: "No email", cls: "bg-gray-100 text-gray-500" },
};

export default function GroupEmailDialog({ catId, sessionNumber, unassignedCount = 0 }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/categories/${catId}/group-emails?session=${sessionNumber}`);
      const d = await res.json();
      if (!res.ok) setError(d.error || "Failed to load");
      else setData(d);
    } catch { setError("Failed to load"); }
    setLoading(false);
  };

  useEffect(() => {
    if (open) { setConfirm(false); load(); }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, sessionNumber]);

  const hasSent = data?.statuses?.length > 0;
  const totalRecipients = (data?.groups || []).reduce((n, g) => n + g.recipients, 0);
  const missingNames = (data?.groups || []).flatMap(g => g.missing);

  const send = async () => {
    setSending(true); setError("");
    try {
      const res = await fetch(`/api/categories/${catId}/group-emails`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_number: sessionNumber }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Send failed"); setSending(false); return; }
      setConfirm(false);
      await load();
      // Poll for delivered/bounced webhook updates for ~90s.
      let ticks = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => { ticks++; await load(); if (ticks >= 18) clearInterval(pollRef.current); }, 5000);
    } catch { setError("Send failed"); }
    setSending(false);
  };

  const counts = data?.counts || {};
  const byGroup = {};
  for (const s of (data?.statuses || [])) { (byGroup[s.group_number] ||= []).push(s); }

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90">
        <Mail size={14} /> Email group assignments
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && !sending && setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: "88vh" }}>
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight flex items-center gap-2"><Mail size={17} className="text-accent" /> Group assignment emails</h3>
                <p className="text-xs text-gray-400 mt-0.5">{data?.session?.name || `Session ${sessionNumber}`}{data?.session?.session_type ? ` · ${data.session.session_type}` : ""} · each parent gets their child's group, rink, date & time</p>
              </div>
              <button onClick={() => !sending && setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="overflow-y-auto px-6 py-4 flex-1">
              {loading && !data ? (
                <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
              ) : error ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
              ) : (
                <>
                  {/* Delivery summary (after a send) */}
                  {hasSent && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {["delivered", "sent", "bounced", "complained", "failed", "no_email"].filter(k => counts[k]).map(k => (
                        <span key={k} className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS[k].cls}`}>{counts[k]} {STATUS[k].label}</span>
                      ))}
                      <button onClick={load} className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 inline-flex items-center gap-1"><RefreshCw size={11} /> Refresh</button>
                    </div>
                  )}

                  {/* Per-group breakdown */}
                  <div className="space-y-3">
                    {(data?.groups || []).map(g => {
                      const rows = byGroup[g.group_number] || [];
                      return (
                        <div key={g.group_number} className="border border-gray-200 rounded-xl overflow-hidden">
                          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                            <div className="font-semibold text-gray-900 text-sm">Group {g.group_number}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                              {g.scheduled ? (<><Clock size={12} /><span>{g.date} · {g.time}</span>{g.location && <span>· {g.location}</span>}</>) : <span className="text-amber-600">⚠ No rink/time set for this group</span>}
                            </div>
                          </div>
                          <div className="px-4 py-2 text-xs text-gray-500 flex items-center justify-between">
                            <span>{g.recipients} email{g.recipients === 1 ? "" : "s"}{g.missing.length ? ` · ${g.missing.length} missing` : ""}</span>
                          </div>
                          {hasSent && rows.length > 0 && (
                            <div className="divide-y divide-gray-50 border-t border-gray-100">
                              {rows.map((r, i) => (
                                <div key={i} className="px-4 py-1.5 flex items-center justify-between gap-2 text-xs">
                                  <span className="text-gray-700 truncate">{r.athlete_name}{r.recipient_email ? <span className="text-gray-400"> · {r.recipient_email}</span> : ""}</span>
                                  <span className={`px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${(STATUS[r.status] || STATUS.failed).cls}`} title={r.error || ""}>{(STATUS[r.status] || { label: r.status }).label}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {missingNames.length > 0 && (
                    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                      <b>{missingNames.length}</b> player{missingNames.length === 1 ? "" : "s"} have no parent email and won't be sent: {missingNames.slice(0, 8).join(", ")}{missingNames.length > 8 ? "…" : ""}
                    </div>
                  )}
                  {unassignedCount > 0 && (
                    <div className="mt-2 text-xs text-gray-400">{unassignedCount} athlete{unassignedCount === 1 ? "" : "s"} not assigned to a group this session won't be emailed.</div>
                  )}
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
              <div className="text-xs text-gray-400">{hasSent ? "Statuses update live as parents' mail servers respond." : `Will email ${totalRecipients} parent${totalRecipients === 1 ? "" : "s"}.`}</div>
              {confirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Send to {totalRecipients}?</span>
                  <button onClick={() => setConfirm(false)} className="px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Cancel</button>
                  <button onClick={send} disabled={sending} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-50"><Send size={14} /> {sending ? "Sending…" : "Confirm send"}</button>
                </div>
              ) : (
                <button onClick={() => setConfirm(true)} disabled={!totalRecipients || loading} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-40">
                  <Send size={14} /> {hasSent ? "Re-send all" : "Send emails"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
