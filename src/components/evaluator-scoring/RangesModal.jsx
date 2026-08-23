"use client";

import { X } from "lucide-react";

// Every group's score range for this session so far (not just earlier ones),
// so an evaluator who thinks a player deserves to beat another group's top
// score knows exactly what number that takes. Group-level only, never names
// a player.
export default function RangesModal({ rangesData, sessionNumber, groupNumber, scale, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h3 className="font-display font-bold text-ink">Ranges — Session {sessionNumber}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-4">
          <p className="text-xs text-gray-400 mb-3">Lowest-to-highest average score each group has landed so far, out of {scale}. If a player in front of you deserves to beat a group's top score, that's the number to give them.</p>
          {!rangesData ? (
            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : rangesData.ranges.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No groups set up yet for this session.</div>
          ) : (
            <div className="space-y-1.5">
              {rangesData.ranges.map(r => (
                <div key={r.group_number} className={`flex items-center justify-between rounded-lg px-3 py-2 ${r.group_number === groupNumber ? "bg-accent-soft border border-accent/30" : "bg-gray-50"}`}>
                  <span className="text-sm font-semibold text-ink">Group {r.group_number}{r.group_number === groupNumber ? " (you)" : ""}</span>
                  {r.floor != null ? (
                    <span className="text-sm font-mono font-bold text-amber-600">{r.ceiling}–{r.floor} <span className="text-xs text-gray-400 font-normal">({r.athletes_counted})</span></span>
                  ) : (
                    <span className="text-xs text-gray-300 italic">not scored yet</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
