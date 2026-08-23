"use client";

import { X } from "lucide-react";
import { colorFor, swatchStyle } from "@/lib/teamColors";

// Opened from the Grid view's notes icon. Writes through the same updateNotes()
// the card view uses, so it syncs (and queues offline) identically and lands
// in the CSV export's Notes column.
export default function NotesSheetModal({ athleteId, athletes, scores, isAnon, anonLabel, teamColors, updateNotes, onClose }) {
  const a = athletes.find(x => x.id === athleteId);
  if (!a) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full" style={swatchStyle(colorFor(a.team_color, teamColors))} />
            <h3 className="font-display font-bold text-ink">
              {isAnon ? anonLabel(a) : `${a.last_name}, ${a.first_name?.[0]}.`}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-4">
          <textarea
            autoFocus
            value={scores[athleteId]?.notes || ""}
            onChange={e => updateNotes(athleteId, e.target.value)}
            placeholder="Type notes here..."
            rows={5}
            className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-ink placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
          />
          <button onClick={onClose} className="mt-3 w-full py-2.5 bg-accent text-white rounded-xl font-semibold text-sm">Done</button>
        </div>
      </div>
    </div>
  );
}
