"use client";

import { MessageSquare } from "lucide-react";
import { colorFor, swatchStyle } from "@/lib/teamColors";
import { getStatus } from "@/lib/scoringStatus";

// Spreadsheet-mode scoring: one row per player, one column per category.
// Keyboard nav (Enter/arrows) jumps between cells by data-cell="row-col" so an
// evaluator can score straight down a column without reaching for the mouse.
export default function GridView({
  scoringCats, filtered, scores, selected, totalCats,
  teamColors, isAnon, anonLabel, increment, scale,
  updateScore, setNotesForId,
}) {
  return (
    <div className="flex-1 overflow-auto px-2 pt-2 pb-20">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-gray-50">
            <th className="text-left py-2 px-2 text-xs text-gray-600 font-medium sticky left-0 bg-gray-50 min-w-[140px]">Name</th>
            {scoringCats.map(cat => (
              <th key={cat.id} className="text-center py-2 px-1 text-xs text-gray-600 font-medium min-w-[60px]">{cat.name.split(/[\s/]/)[0]}</th>
            ))}
            <th className="text-center py-2 px-1 text-xs text-gray-600 font-medium w-[34px]" title="Notes"><MessageSquare size={13} className="inline-block" /></th>
            <th className="text-center py-2 px-1 text-xs text-gray-600 font-medium min-w-[40px]">✓</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((athlete, r) => {
            const status = getStatus(athlete.id, scores, totalCats);
            const athleteScores = scores[athlete.id]?.cats || {};
            const isSel = selected?.id === athlete.id;
            return (
              <tr key={athlete.id} className={`border-b border-gray-200 ${isSel ? "ring-2 ring-inset ring-accent" : ""} ${status === "complete" ? "bg-green-50" : status === "partial" ? "bg-amber-50" : ""}`}>
                <td className="py-1.5 px-2 text-xs text-ink font-medium sticky left-0 bg-white whitespace-nowrap">
                  {/* Bracket (arbitrary-value) classes on purpose -- same reason as
                      the big jersey circle below: [data-theme="premium"] remaps
                      .bg-white to --p-card (#1a1a1a), which repainted the "Light"
                      dot near-black and left it indistinguishable from bg-gray-800
                      (#1f2937) at 8px. Bracket classes aren't in that override. */}
                  <span className="inline-block w-3 h-3 rounded-full mr-1.5 align-middle"
                    style={{ ...swatchStyle(colorFor(athlete.team_color, teamColors)), borderWidth: "1px" }} />
                  {isAnon
                    ? anonLabel(athlete)
                    : <>{athlete.last_name}, {athlete.first_name?.[0]}.{athlete.jersey_number && <span className="text-gray-500 ml-1">#{athlete.jersey_number}</span>}</>}
                </td>
                {scoringCats.map((cat, c) => {
                  const val = athleteScores[cat.id];
                  return (
                    <td key={cat.id} className="text-center py-1 px-1">
                      <input
                        type="number"
                        inputMode="decimal"
                        step={increment}
                        min={0}
                        max={scale}
                        value={val ?? ""}
                        data-cell={`${r}-${c}`}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => {
                          // Enter / arrows jump to the next cell so you can score
                          // down a row without looking for the next box.
                          const go = (rr, cc) => {
                            const el = document.querySelector(`[data-cell="${rr}-${cc}"]`);
                            if (el) { e.preventDefault(); el.focus(); }
                          };
                          const lastC = scoringCats.length - 1;
                          const lastR = filtered.length - 1;
                          if (e.key === "Enter" || e.key === "ArrowRight") {
                            if (c < lastC) go(r, c + 1); else if (r < lastR) go(r + 1, 0);
                          } else if (e.key === "ArrowLeft") {
                            if (c > 0) go(r, c - 1); else if (r > 0) go(r - 1, lastC);
                          } else if (e.key === "ArrowDown") {
                            if (r < lastR) go(r + 1, c);
                          } else if (e.key === "ArrowUp") {
                            if (r > 0) go(r - 1, c);
                          }
                        }}
                        onChange={e => {
                          const v = e.target.value === "" ? null : parseFloat(e.target.value);
                          if (v !== null && (v < 0 || v > scale)) return;
                          updateScore(athlete.id, cat.id, v);
                        }}
                        className={`w-full bg-transparent text-center text-sm font-mono outline-none rounded py-1 ${
                          val !== null && val !== undefined ? "text-ink" : "text-gray-400"
                        } focus:bg-gray-50 focus:ring-1 focus:ring-accent`}
                        placeholder="–"
                      />
                    </td>
                  );
                })}
                {/* Notes — icon rather than a 13th text column: the table already
                    scrolls sideways on a phone, and an input per row would make
                    that worse. Filled accent = this player already has a note. */}
                <td className="text-center py-1 px-1">
                  {(() => {
                    const hasNote = !!(scores[athlete.id]?.notes || "").trim();
                    return (
                      <button
                        onClick={() => setNotesForId(athlete.id)}
                        title={hasNote ? "Edit note" : "Add note"}
                        aria-label={hasNote ? "Edit note" : "Add note"}
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-colors ${
                          hasNote
                            ? "bg-accent-soft border-accent text-accent"
                            : "bg-transparent border-gray-300 text-gray-400 hover:text-ink hover:border-gray-400"
                        }`}>
                        <MessageSquare size={14} />
                      </button>
                    );
                  })()}
                </td>
                <td className="text-center py-1 px-1">
                  {status === "complete" ? <span className="text-green-600 text-xs">✓</span>
                    : status === "partial" ? <span className="text-amber-600 text-xs">◐</span>
                    : <span className="text-gray-400 text-xs">○</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
