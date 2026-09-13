"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, X } from "lucide-react";

// Slipped-finger scores waiting for the SP's approval. Loads on every dashboard
// visit (the GET also runs the scan), so a new slip is in front of Dan the
// next time he logs in without anyone having to report it.
//
// Rendered above whatever tab is open, but only when there is something to
// review -- an empty "nothing to approve" box on every visit is noise.
export default function ScoreSlipsPanel({ spUrl }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(null);
  const { data } = useQuery({
    queryKey: ["score-slips"],
    queryFn: async () => { const r = await fetch(spUrl("/api/service-provider/score-slips")); if (!r.ok) throw new Error("failed"); return r.json(); },
    staleTime: 60_000,
  });
  const pending = data?.pending || [];
  if (!pending.length) return null;

  const act = async (id, action) => {
    setBusy(id);
    try {
      await fetch(spUrl("/api/service-provider/score-slips"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      queryClient.invalidateQueries({ queryKey: ["score-slips"] });
    } finally { setBusy(null); }
  };

  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-amber-900">
            {pending.length} score{pending.length === 1 ? "" : "s"} that look like a slipped finger
          </h3>
          <p className="text-xs text-amber-800 mt-0.5 mb-3">
            Each is far below the same evaluator's other scores for that player. Approve to change it to their median; dismiss if it was meant.
          </p>
          <div className="space-y-2">
            {pending.map(s => (
              <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 px-3 py-2 text-sm" style={{ background: "#fff" }}>
                <span className="font-semibold text-gray-900">{s.athlete}</span>
                <span className="text-gray-500">{s.org} · {s.category} · S{s.session_number}</span>
                <span className="text-gray-500">{s.evaluator}</span>
                <span className="text-gray-700">{s.criterion}:</span>
                <span className="font-mono font-bold text-red-600">{s.original}</span>
                <span className="text-gray-400">→</span>
                <span className="font-mono font-bold text-green-700">{s.suggested}</span>
                <span className="text-xs text-gray-400 hidden sm:inline">({s.reason})</span>
                <span className="ml-auto flex items-center gap-1.5">
                  <button onClick={() => act(s.id, "approve")} disabled={busy === s.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                    <Check size={12} /> Approve
                  </button>
                  <button onClick={() => act(s.id, "dismiss")} disabled={busy === s.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-300 text-gray-600 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50">
                    <X size={12} /> It was meant
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
