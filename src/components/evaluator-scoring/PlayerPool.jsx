"use client";

import { ChevronDown } from "lucide-react";
import { colorFor, swatchStyle } from "@/lib/teamColors";
import { getStatus } from "@/lib/scoringStatus";

// The tap-to-select jersey grid for Buttons/Numpad view. Collapses to a single
// "Show all players" button once a player is selected and collapseList is on,
// so the score inputs land at the top of the screen without scrolling.
export default function PlayerPool({
  filtered, scores, totalCats, selected, setSelected, teamColors,
  idOf, collapseList, listExpanded, setListExpanded,
}) {
  if (collapseList && selected && !listExpanded) {
    return (
      <div className="px-3 pt-3 pb-1">
        <button onClick={() => setListExpanded(true)} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:border-gray-300">
          <ChevronDown size={15} /> Show all players ({filtered.length})
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 pt-3 pb-2">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 px-1">
        {[
          { color: "bg-gray-300", label: "Not started" },
          { color: "bg-amber-400", label: "Partial" },
          { color: "bg-green-500", label: "Complete" },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ${l.color}`} />
            <span className="text-xs text-gray-600">{l.label}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))" }}>
        {filtered.map(athlete => {
          const status = getStatus(athlete.id, scores, totalCats);
          const isActive = selected?.id === athlete.id;
          const jersey = colorFor(athlete.team_color, teamColors);

          return (
            <button
              key={athlete.id}
              onClick={() => { setSelected(isActive ? null : athlete); if (collapseList) setListExpanded(false); }}
              className="relative flex items-center justify-center select-none transition-transform"
              style={{ minHeight: "52px" }}
            >
              <div className="relative">
                {/* Identifier (jersey or helmet #) in the player's actual jersey
                    colour, from this session's palette. Styled inline rather than
                    with utility classes: globals.css's [data-theme="premium"]
                    override remaps bg-white/text-gray-900/etc with !important for
                    the dark evaluator theme, which used to repaint the "White"
                    jersey circle near-black. Inline styles win over that. */}
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-display font-extrabold leading-none transition-all ${String(idOf(athlete)).length > 2 ? "text-sm" : "text-lg"} ${isActive ? "ring-4 ring-accent/50 scale-110" : ""}`}
                  style={swatchStyle(jersey)}>
                  {idOf(athlete)}
                </div>
                {/* Done = small green check; partial = amber dot */}
                {status === "complete" && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-white text-white text-[9px] font-black flex items-center justify-center leading-none">✓</span>
                )}
                {status === "partial" && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-white" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
