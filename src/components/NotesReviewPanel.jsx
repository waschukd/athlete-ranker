"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Check } from "lucide-react";

// Evaluator notes the recognizer likely cut off mid-thought ("...skates
// hunched over when carrying the") -- nothing auto-fixes these (no way to
// guess the intended ending), so this is a short worklist a director clears
// by hand before a note reaches a report. Empty and collapsed to nothing
// when there's nothing to review, which is the common case.
export default function NotesReviewPanel({ catId }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [savingId, setSavingId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["notes-review", catId],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/notes-review`);
      return res.json();
    },
  });

  const flagged = data?.flagged || [];
  if (isLoading || flagged.length === 0) return null;

  const startEdit = (n) => { setEditingId(n.id); setDraft(n.note_text); };

  const save = async (id) => {
    setSavingId(id);
    try {
      await fetch(`/api/categories/${catId}/notes-review`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_id: id, note_text: draft }),
      });
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["notes-review", catId] });
    } finally { setSavingId(null); }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={15} className="text-amber-600" />
        <span className="text-sm font-semibold text-amber-800">Notes to review ({flagged.length})</span>
      </div>
      <p className="text-xs text-amber-600 mb-3">These look cut off mid-thought (likely a dictation drop) -- worth a glance before they reach a report.</p>
      <div className="space-y-2">
        {flagged.map(n => (
          <div key={n.id} className="bg-white border border-amber-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-gray-700 mb-1">{n.athlete_name} · Session {n.session_number}</div>
            {editingId === n.id ? (
              <>
                <textarea
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={3}
                  className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
                />
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => save(n.id)} disabled={savingId === n.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-accent text-white rounded-lg font-semibold disabled:opacity-50">
                    {savingId === n.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-xs px-2.5 py-1 text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
              </>
            ) : (
              <button onClick={() => startEdit(n)} className="text-sm text-gray-700 text-left hover:text-ink w-full">
                "{n.note_text}"
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
