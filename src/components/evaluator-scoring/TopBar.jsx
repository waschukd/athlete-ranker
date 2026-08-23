"use client";

import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { colorFor } from "@/lib/teamColors";

const sameTeam = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

export default function TopBar({
  online, pendingCount,
  orgName, sessionNumber, groupNumber,
  complete, partial, remaining,
  syncStatus,
  onOpenSettings,
  calibration, calibrationDismissed, onDismissCalibration,
  teamColors, teamFilter, setTeamFilter, athletes,
  hideCompleted, setHideCompleted,
  viewMode, collapseList, setCollapseList, setListExpanded,
  readOnly, onOpenConsensus,
  onResync,
}) {
  return (
    <>
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center justify-between px-3 py-3">
          <a href="/evaluator/dashboard" className="p-1.5 text-gray-500 hover:text-ink rounded-lg">
            <ArrowLeft size={20} />
          </a>
          <div className="text-center flex-1 mx-2">
            <div className="flex items-center justify-center gap-1.5">
              {/* Connection dot — moved inline with the title so status is a
                  glance, not its own row */}
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-500 ${
                  online ? 'bg-green-500 shadow-[0_0_6px_#4ade80]' : pendingCount > 0 ? 'bg-amber-400 animate-pulse' : 'bg-red-500'
                }`}
                title={online ? 'Connected' : pendingCount > 0 ? `${pendingCount} pending sync` : 'Offline'}
              />
              <span className="text-sm font-bold font-display text-ink leading-tight">
                {orgName} · S{sessionNumber} G{groupNumber}
              </span>
            </div>
            <div className="flex items-center justify-center gap-3 mt-1">
              <span className="text-xs text-green-600 font-semibold">{complete} ✓</span>
              <span className="text-xs text-amber-500 font-semibold">{partial} partial</span>
              <span className="text-xs text-gray-400">{remaining} left</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Transient "just happened" message — auto-clears in a couple seconds */}
            {syncStatus && (
              <span className={`text-xs px-2 py-1 rounded-lg ${
                syncStatus.includes('✓') ? 'text-green-600' :
                syncStatus.includes('fail') || syncStatus.includes('Error') ? 'text-red-500' :
                'text-amber-500'
              }`}>{syncStatus}</span>
            )}
            {/* The connection dot next to the title is the save indicator now --
                green = connected, red = save manually via Settings > Backup.
                This pill said the same thing with more words. */}
            {/* Everything else (scoring guide, floor/room calibration, layout,
                consensus, backup, theme) lives behind this one button now — the
                header was showing too much at once. */}
            <button onClick={onOpenSettings} className="p-1.5 text-gray-500 hover:text-ink rounded-lg" title="Settings">
              <SettingsIcon size={20} />
            </button>
          </div>
        </div>

        {/* Calibration check banner */}
        {calibration && !calibrationDismissed && (
          <div className="mx-3 mt-2 bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-accent-soft">
              <span className="text-xs font-semibold text-accent">📊 Session {calibration.prev_session} Review</span>
              <button onClick={onDismissCalibration} className="text-xs text-gray-400 hover:text-ink">Dismiss</button>
            </div>
            <div className="px-4 py-2 border-b border-gray-200">
              <p className="text-[11px] text-gray-500 leading-relaxed">Quick look at how your rankings compared to the group last session. This isn't about right or wrong — it's about awareness. If you ranked a player very differently from the group, keep an eye on them today.</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-4">
                <div className="text-center" title="How often your ranking order matched the group's order">
                  <div className={`text-lg font-bold font-display ${calibration.rank_match >= 85 ? "text-green-600" : calibration.rank_match >= 70 ? "text-amber-500" : "text-red-500"}`}>{calibration.rank_match}%</div>
                  <div className="text-[10px] text-gray-400">Ranking alignment</div>
                </div>
                <div className="text-center" title="How many points of the scoring scale you used (higher = better differentiation)">
                  <div className="text-lg font-bold font-display text-ink">{calibration.spread}</div>
                  <div className="text-[10px] text-gray-400">Score range</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold font-display text-ink">{calibration.athletes_scored}</div>
                  <div className="text-[10px] text-gray-400">Athletes</div>
                </div>
              </div>
              {calibration.disagreements?.length > 0 && (
                <div>
                  <div className="text-[10px] text-gray-400 mb-1">Players you ranked differently from the group — worth a closer look today:</div>
                  {calibration.disagreements.slice(0, 3).map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                      <span className="text-ink flex-1">{d.name}</span>
                      <span className="text-gray-500">You: #{d.your_rank}</span>
                      <span className="text-gray-500">Group: #{d.group_rank}</span>
                      <span className={`font-bold ${d.diff >= 5 ? "text-red-500" : "text-amber-500"}`}>±{d.diff}</span>
                    </div>
                  ))}
                </div>
              )}
              {Object.keys(calibration.category_bias || {}).length > 0 && (
                <div>
                  <div className="text-[10px] text-gray-400 mb-1">Your avg vs group avg per category (+ means you scored higher, - means lower):</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(calibration.category_bias).map(([cat, bias]) => (
                      <span key={cat} className={`text-[10px] px-1.5 py-0.5 rounded ${Math.abs(bias) > 0.5 ? "bg-amber-50 text-amber-600 border border-amber-200" : "bg-gray-100 text-gray-500"}`}>
                        {cat.split(/[\s/]/)[0]}: {bias > 0 ? "+" : ""}{bias}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={onDismissCalibration} className="w-full py-2 text-xs font-semibold text-accent bg-accent-soft hover:opacity-90 border-t border-accent/20">
              Got it — Start Scoring
            </button>
          </div>
        )}

        {/* Team filter tabs */}
        <div className="flex border-t border-gray-200">
          {["all", ...teamColors.map(c => c.name)].map(t => (
            <button key={t} onClick={() => setTeamFilter(t)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors capitalize flex items-center justify-center gap-1.5 ${
                teamFilter === t
                  ? "text-accent border-b-2 border-accent"
                  : "text-gray-400 border-b-2 border-transparent"
              }`}>
              {t !== "all" && (
                <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: colorFor(t, teamColors).hex, border: `1px solid ${colorFor(t, teamColors).border}` }} />
              )}
              {t === "all" ? `All (${athletes.length})` : `${t} (${athletes.filter(a => sameTeam(a.team_color, t)).length})`}
            </button>
          ))}
        </div>
          <div className="flex items-center justify-center gap-2 mt-1 mx-3 mb-1 flex-wrap">
            <button onClick={() => setHideCompleted(h => !h)} className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${hideCompleted ? "bg-green-600 border-green-500 text-white" : "bg-gray-100 border-gray-300 text-gray-500"}`}>
              {hideCompleted ? "✓ Hiding" : "Hide done"}
            </button>
            {viewMode !== "grid" && (
              <button
                onClick={() => { setCollapseList(v => !v); setListExpanded(false); }}
                title="When on, the player grid collapses after you pick someone so the score inputs are right at the top — no scrolling."
                className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${collapseList ? "bg-accent border-accent text-white" : "bg-gray-100 border-gray-300 text-gray-500"}`}
              >
                {collapseList ? "✓ Compact" : "Compact"}
              </button>
            )}
            {!readOnly && (
              <button onClick={onOpenConsensus} className="px-3 py-1 text-xs font-semibold rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
                Consensus
              </button>
            )}
            {pendingCount > 0 && (
              <button onClick={onResync} className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-accent/40 text-accent hover:bg-accent-soft">
                Resync now
              </button>
            )}
          </div>
      </div>
    </>
  );
}
