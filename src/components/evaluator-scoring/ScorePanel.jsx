"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X, RotateCcw, WifiOff } from "lucide-react";
import { colorFor, swatchStyle, colorInitial } from "@/lib/teamColors";

// Card/Numpad view's per-player scoring panel: header (nav + compare toggle),
// the category inputs (numpad or button grid depending on viewMode), notes,
// sync status, and the "same overall score" compare-to-peers panel.
export default function ScorePanel({
  selected, viewMode, scoringCats, scores, teamColors, idOf,
  navigate, selectedIdx, filteredLength, setSelected,
  updateScore, advanceToNextUnscored, scoreValues, increment, scale,
  updateNotes, notesMode, voiceOn,
  pending, online,
  athletes, isAnon, helmetMode, teamLabel,
  currentUserId, catId,
}) {
  const [showCompare, setShowCompare] = useState(false);
  const [compareCount, setCompareCount] = useState(0);

  return (
    <div className="mx-3 mb-3 bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Player header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <button onClick={() => navigate(-1)} disabled={selectedIdx <= 0}
          className="p-1.5 text-gray-400 hover:text-ink disabled:opacity-30 rounded-lg">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 rounded-full" style={swatchStyle(colorFor(selected.team_color, teamColors))} />
            <span className="font-bold font-display text-ink">#{idOf(selected)}</span>
          </div>
          {selected.position && (
            <div className="text-xs text-gray-600 mt-0.5 font-medium">{selected.position}</div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => {
              const opening = !showCompare;
              setShowCompare(opening);
              if (opening) {
                setCompareCount(c => c + 1);
                // Log compare usage for evaluator scorecard tracking
                fetch(`/api/evaluator/scores`, { method: "OPTIONS" }).catch(() => {}); // lightweight ping
                if (currentUserId && catId) {
                  fetch(`/api/categories/${catId}/audit`, { method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "compare_used", athlete_id: selected?.id }),
                  }).catch(() => {});
                }
              }
            }}
            className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors ${showCompare ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500 hover:text-ink"}`}>
            ⚖
          </button>
          <button onClick={() => navigate(1)} disabled={selectedIdx >= filteredLength - 1}
            className="p-1.5 text-gray-400 hover:text-ink disabled:opacity-30 rounded-lg">
            <ChevronRight size={18} />
          </button>
          <button onClick={() => { setSelected(null); setShowCompare(false); }}
            className="p-1.5 text-gray-400 hover:text-ink rounded-lg">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Scoring categories */}
      <div className="px-4 py-3 space-y-4">
        {viewMode === "numpad" ? (
          /* ── Numpad mode: compact inline inputs ── */
          scoringCats.map((cat, i) => {
            const current = scores[selected.id]?.cats?.[cat.id];
            return (
              <div key={cat.id} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 flex-1">{cat.name}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step={increment}
                  min={0}
                  max={scale}
                  data-cat={i}
                  value={current ?? ""}
                  onChange={e => {
                    const v = e.target.value === "" ? null : parseFloat(e.target.value);
                    if (v !== null && (v < 0 || v > scale)) return;
                    updateScore(selected.id, cat.id, v);
                  }}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => {
                    // Enter = advance to next category input (Tab stays native).
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const next = document.querySelector('[data-cat="' + (i + 1) + '"]');
                    if (next) next.focus();
                    else e.target.blur(); // last category — done
                  }}
                  placeholder="—"
                  className={`w-20 py-3 text-center text-lg font-bold rounded-xl border-2 outline-none transition-colors ${
                    current !== null && current !== undefined
                      ? "bg-accent-soft border-accent text-ink"
                      : "bg-white border-gray-300 text-gray-600"
                  }`}
                />
              </div>
            );
          })
        ) : (
          /* ── Button mode: tappable score buttons ── */
          scoringCats.map((cat, i) => {
            const current = scores[selected.id]?.cats?.[cat.id];
            return (
              <div key={cat.id} data-catblock={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-gray-700">{cat.name}</span>
                  {current !== null && current !== undefined && (
                    <button onClick={() => updateScore(selected.id, cat.id, null)}
                      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                      <RotateCcw size={11} /> Clear
                    </button>
                  )}
                </div>
                <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(scoreValues.length, 10)}, 1fr)` }}>
                  {scoreValues.map(v => (
                    <button key={v} onClick={() => { updateScore(selected.id, cat.id, v); advanceToNextUnscored(i, v === current); }}
                      className={`py-2 md:py-3.5 rounded text-xs md:text-base font-bold transition-all ${
                        current === v
                          ? "bg-accent text-white shadow-md"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-accent active:text-white"
                      }`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            );
        })
        )}

        {/* Notes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">Notes</span>
            {notesMode && <span className="text-xs text-green-600 font-medium animate-pulse">● Recording</span>}
          </div>
          <textarea
            value={scores[selected.id]?.notes || ""}
            onChange={e => updateNotes(selected.id, e.target.value)}
            placeholder={voiceOn ? `Voice active — say "Notes" to dictate, or type here` : "Type notes here, or use voice..."}
            rows={3}
            className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-ink placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
          />
        </div>

        {/* Sync status for this player */}
        {pending[selected.id] && (
          <div className="flex items-center gap-2 text-xs text-amber-600">
            <WifiOff size={12} />
            {online ? "Syncing..." : "Saved locally — will sync when online"}
          </div>
        )}

        {/* Compare panel — find athletes I've rated with the same overall score.
            "Overall" matches the rest of the app: mean of category scores
            rounded to one decimal. Only my own scores are used; we
            deliberately don't peek at other evaluators' ratings here. */}
        {showCompare && selected && (() => {
          const myScores = scores[selected.id]?.cats || {};
          const myFilled = Object.values(myScores).filter(v => v !== null && v !== undefined);
          const totalCats = scoringCats.length;
          if (myFilled.length < totalCats) {
            return <div className="text-xs text-gray-400 mt-3">Score every category for this player to compare overall.</div>;
          }
          const myOverall = Math.round((myFilled.reduce((a, b) => a + b, 0) / myFilled.length) * 10) / 10;

          const same = athletes.filter(a => {
            if (a.id === selected.id) return false;
            const theirCats = scores[a.id]?.cats || {};
            const theirFilled = Object.values(theirCats).filter(v => v !== null && v !== undefined);
            if (theirFilled.length < totalCats) return false; // only fully-rated peers
            const theirOverall = Math.round((theirFilled.reduce((a, b) => a + b, 0) / theirFilled.length) * 10) / 10;
            return theirOverall === myOverall;
          }).map(a => (helmetMode || a.jersey_number) ? `${colorInitial(a.team_color)}${idOf(a)}` : (isAnon ? `${teamLabel(a)} ?` : `${a.last_name}, ${a.first_name?.[0]}.`));

          return (
            <div className="mt-3 bg-purple-50 border border-purple-200 rounded-xl p-3">
              <div className="text-xs font-semibold text-purple-700 mb-2">⚖ Same Overall Score — Are these players equal?</div>
              {same.length === 0 ? (
                <div className="text-xs text-gray-400">No other player you've rated has an overall of {myOverall}.</div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-gray-500 w-16 flex-shrink-0">Overall: {myOverall}</span>
                    {same.map((label, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{label}</span>
                    ))}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">If not equal, adjust to differentiate.</div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
