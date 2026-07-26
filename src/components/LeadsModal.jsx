"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Shield, Star } from "lucide-react";

// Promote/demote an association's leads. A lead can manage who evaluates each of
// the association's sessions (see the roster, add someone, take a spot).
// Backed by GET/PATCH /api/organizations/[orgId]/leads.
export default function LeadsModal({ orgId, orgName, onClose }) {
  const [people, setPeople] = useState(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await fetch(`/api/organizations/${orgId}/leads`);
      const d = await res.json();
      if (!res.ok) setErr(d.error || "Couldn't load evaluators.");
      else setPeople(d.evaluators || []);
    } catch { setErr("Couldn't load evaluators."); }
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (user_id, is_lead) => {
    setBusyId(user_id); setErr("");
    try {
      const res = await fetch(`/api/organizations/${orgId}/leads`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, is_lead }),
      });
      const d = await res.json();
      if (!res.ok) setErr(d.error || "That didn't work.");
      else await load();
    } catch { setErr("That didn't work."); }
    setBusyId(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: "88vh" }}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight flex items-center gap-2">
              <Shield size={17} className="text-accent" /> Evaluation Leads
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">A lead can manage who evaluates {orgName || "this association"}&apos;s sessions.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex-1">
          {err && <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-sm text-red-700 mb-3">{err}</div>}
          {people === null ? (
            <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
          ) : people.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">No evaluators for this association yet.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {people.map(p => (
                <div key={p.user_id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-gray-50">
                  <div className="min-w-0 flex items-center gap-2">
                    {p.is_lead && <Star size={13} className="text-accent flex-shrink-0" fill="currentColor" />}
                    <span className="text-sm text-gray-800 truncate">{p.name || p.email}</span>
                  </div>
                  <button
                    onClick={() => toggle(p.user_id, !p.is_lead)}
                    disabled={busyId === p.user_id}
                    className={`text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0 disabled:opacity-40 ${p.is_lead ? "border border-gray-200 text-gray-600 hover:bg-gray-100" : "bg-accent text-white hover:opacity-90"}`}
                  >
                    {busyId === p.user_id ? "…" : p.is_lead ? "Remove lead" : "Make lead"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
