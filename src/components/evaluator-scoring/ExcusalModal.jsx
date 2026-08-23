"use client";

// Before closing a session, every checked-in player needs either a score or
// an excuse (absent/injured) -- this is how a director/evaluator marks the
// ones with no score so the close can go through.
export default function ExcusalModal({ needed, excusals, setExcusals, closing, onBack, onConfirm }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: "85vh" }}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-display font-extrabold text-ink text-lg leading-tight">Before you close</h3>
          <p className="text-xs text-gray-500 mt-1">
            {needed.length} player{needed.length === 1 ? "" : "s"} {needed.length === 1 ? "has" : "have"} no score. Mark why for each — that's the only way to close a player out without scoring them.
          </p>
        </div>
        <div className="overflow-y-auto px-5 py-2 flex-1 divide-y divide-gray-50">
          {needed.map(a => (
            <div key={a.athlete_id} className="py-2.5 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-gray-900 min-w-0 truncate">{a.name}</span>
              <div className="flex gap-1.5 flex-shrink-0">
                {[["absent", "Not here"], ["injured", "Got hurt"]].map(([val, label]) => (
                  <button key={val} onClick={() => setExcusals(e => ({ ...e, [a.athlete_id]: val }))}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium ${excusals[a.athlete_id] === val ? "bg-accent text-white border-accent" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <button onClick={onBack} disabled={closing} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium disabled:opacity-50">Back to scoring</button>
          <button onClick={onConfirm} disabled={closing || needed.some(a => !excusals[a.athlete_id])}
            className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            {closing ? "Closing…" : "Confirm & close"}
          </button>
        </div>
      </div>
    </div>
  );
}
