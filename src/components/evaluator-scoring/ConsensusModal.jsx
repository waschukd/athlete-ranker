"use client";

import { X } from "lucide-react";

export default function ConsensusModal({
  data, loading, error, onRetry,
  evalFilter, setEvalFilter,
  reviewedFlags, onDiscussed,
  isAnon, anonLabel, athletes,
  onFixScore,
  closing, onCloseSession,
  onClose,
}) {
  const findFull = (athleteId) => (athletes || []).find(x => x.id === athleteId);
  const matchesFilter = (a) => !evalFilter || a.per_evaluator?.some(ev => ev.evaluator_name === evalFilter);

  return (
    <div className="fixed inset-0 z-30 bg-black/40 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl border border-gray-200 px-4 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-ink">Consensus Review</h2>
            <p className="text-xs text-gray-500 mt-0.5">Do evaluators rank athletes in the same tier?</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-ink rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto" /></div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-sm text-gray-500 mb-3">Couldn't load consensus — check your connection.</p>
            <button onClick={onRetry} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90">Retry</button>
          </div>
        ) : !data?.athletes?.length ? (
          <div className="text-center py-20 text-gray-500 text-sm">No scores submitted yet</div>
        ) : (
          <>
            {/* Evaluator filter — narrow the discussion list to just one
                evaluator's disagreements, useful when several evaluators
                are reviewing together and want to focus on one at a time. */}
            {(() => {
              const evalNames = [...new Set(data.athletes.flatMap(a => (a.per_evaluator || []).map(e => e.evaluator_name)).filter(Boolean))].sort();
              return evalNames.length > 1 ? (
                <div className="mb-4">
                  <select value={evalFilter} onChange={e => setEvalFilter(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/30">
                    <option value="">All evaluators</option>
                    {evalNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              ) : null;
            })()}

            {/* Summary */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-center">
                <div className="text-xl font-bold text-ink">{data.athletes.length}</div>
                <div className="text-[10px] text-gray-500">Athletes</div>
              </div>
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-center">
                <div className={`text-xl font-bold ${data.flagged_count > 0 ? "text-amber-600" : "text-green-600"}`}>{data.flagged_count}</div>
                <div className="text-[10px] text-gray-500">Need Discussion</div>
              </div>
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-center">
                <div className="text-xl font-bold text-green-600">{data.athletes.length - data.flagged_count}</div>
                <div className="text-[10px] text-gray-500">Agreed</div>
              </div>
            </div>

            {/* Tier info */}
            {data.tier_info && (
              <div className="flex items-center gap-2 mb-4 text-[10px] text-gray-500">
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">Top {data.tier_info.top}</span>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded">Middle</span>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Bottom {data.tier_info.total - data.tier_info.bottom + 1}</span>
                <span className="text-gray-400">of {data.tier_info.total} athletes</span>
              </div>
            )}

            {/* Flagged athletes — tier splits */}
            {data.flagged_count > 0 && (
              <div className="mb-5">
                <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Needs Discussion — Evaluators Ranked in Different Tiers</div>
                <div className="space-y-2">
                  {data.athletes.filter(a => a.flagged && matchesFilter(a)).map(a => {
                    const full = findFull(a.athlete_id) || a;
                    return (
                    <div key={a.athlete_id} className={`bg-white border rounded-xl p-4 ${reviewedFlags.has(a.athlete_id) ? "border-green-200" : a.severity === "critical" ? "border-red-200" : "border-amber-200"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${a.severity === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {a.severity === "critical" ? "TOP↔BOTTOM" : "TIER SPLIT"}
                          </span>
                          {isAnon ? (
                            <span className="text-sm font-semibold text-ink">{anonLabel(full)}</span>
                          ) : (
                            <>
                              <span className="text-sm font-semibold text-ink">{a.first_name} {a.last_name}</span>
                              {a.jersey_number && <span className="text-xs text-gray-500">#{a.jersey_number}</span>}
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => onFixScore(a.athlete_id)}
                            className="text-xs px-2.5 py-1 bg-accent-soft text-accent rounded-lg hover:opacity-90 font-semibold">Fix score →</button>
                          {!reviewedFlags.has(a.athlete_id) ? (
                            <button onClick={() => onDiscussed(a.athlete_id, a.severity)} className="text-xs px-2.5 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">Discussed ✓</button>
                          ) : (
                            <span className="text-xs text-green-600">✓ Done</span>
                          )}
                        </div>
                      </div>

                      {/* Per-evaluator rankings */}
                      <div className="space-y-1.5">
                        {a.per_evaluator?.map(ev => (
                          <div key={ev.evaluator_id} className={`flex items-center gap-2 ${evalFilter && ev.evaluator_name === evalFilter ? "bg-accent-soft rounded-lg px-1.5 py-0.5 -mx-1.5" : ""}`}>
                            <span className="text-xs text-gray-600 w-28 truncate">{ev.evaluator_name}</span>
                            <span className={`text-xs font-bold w-8 text-center ${ev.tier === "top" ? "text-green-600" : ev.tier === "bottom" ? "text-amber-600" : "text-gray-700"}`}>#{ev.rank}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${ev.tier === "top" ? "bg-green-100 text-green-700" : ev.tier === "bottom" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{ev.tier}</span>
                            <span className="text-xs text-gray-400 ml-auto">avg {ev.avg_score}</span>
                          </div>
                        ))}
                      </div>

                      {/* Category detail */}
                      <div className="mt-3 pt-2 border-t border-gray-200">
                        <div className="flex flex-wrap gap-3">
                          {a.categories?.map(cat => (
                            <div key={cat.name} className="text-xs">
                              <span className="text-gray-500">{cat.name}: </span>
                              <span className="text-ink font-mono">{cat.avg}</span>
                              {cat.spread > 0 && <span className={`ml-1 ${cat.spread > 2 ? "text-red-600" : cat.spread > 1 ? "text-amber-600" : "text-gray-500"}`}>(±{cat.spread})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );})}
                </div>
              </div>
            )}

            {/* Agreed athletes */}
            {data.athletes.filter(a => !a.flagged && matchesFilter(a)).length > 0 && (
              <div className="mb-5">
                <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">All Evaluators Agree on Tier — No Discussion Needed</div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <div className="grid grid-cols-2 gap-1">
                    {data.athletes.filter(a => !a.flagged && matchesFilter(a)).map(a => {
                      const full = findFull(a.athlete_id) || a;
                      return (
                      <div key={a.athlete_id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-100">
                        <span className="text-xs text-gray-700">{isAnon ? anonLabel(full) : `${a.first_name} ${a.last_name}`}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${a.unique_tiers?.[0] === "top" ? "bg-green-100 text-green-700" : a.unique_tiers?.[0] === "bottom" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{a.unique_tiers?.[0]}</span>
                      </div>
                      );})}
                  </div>
                </div>
              </div>
            )}

            {/* Close Session */}
            <div className="border-t border-gray-200 pt-4">
              <p className="text-xs text-gray-500 mb-3">
                {data.flagged_count > 0 && [...reviewedFlags].length < data.flagged_count
                  ? `Discuss ${data.flagged_count - [...reviewedFlags].length} remaining athlete(s) before closing, or they'll be reported as unreviewed.`
                  : "All flagged athletes reviewed. Ready to close."}
              </p>
              <button onClick={onCloseSession} disabled={closing}
                className="w-full py-3 bg-accent text-white rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-50">
                {closing ? "Closing..." : "Close Session"}
              </button>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
