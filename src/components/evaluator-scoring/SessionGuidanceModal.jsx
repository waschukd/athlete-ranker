"use client";

import { X, TrendingUp, TrendingDown } from "lucide-react";
import { suggestedRange } from "@/lib/scoringGuidance";

// Shown automatically when an evaluator opens a session (session 2+ — session
// 1 is conventionally testing, with no scoring to calibrate against), and
// reachable again anytime from Settings. Two things a live evaluator
// otherwise has no way to know walking in: (1) whether THEY personally run
// hot or cold compared to every other evaluator scoring this category (the
// BAHA "Grant factor" — a systematic bias that used to only get corrected
// after the fact, in the rankings math, never surfaced to the person
// actually causing it), and (2) what range to aim for.
//
// Standard-format categories (group_number = a skill TIER) get a bold
// suggested/established range and a "beat the tier above" floor. Tournament
// (round_robin) categories rotate a different evaluator panel every night and
// group_number there means "which matchup," not a tier — there's no fixed
// range to hold anyone to, so those get an explicitly open range plus a
// plain reference point instead: what the field actually scored last time.
function BiasCallout({ bias }) {
  if (!bias) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 flex items-start gap-2.5">
      {bias.direction === "higher" ? <TrendingUp size={18} className="text-amber-600 flex-shrink-0 mt-0.5" /> : <TrendingDown size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />}
      <p className="text-sm text-amber-800 leading-snug">
        You're currently averaging <b>{bias.delta} pts {bias.direction}</b> than other evaluators in this category. Try to bring your scores more in line with the rest of the group.
      </p>
    </div>
  );
}

function TournamentBody({ guidance }) {
  const { scale, last_session, bias } = guidance;
  return (
    <>
      <BiasCallout bias={bias} />
      <div>
        <p className="text-xs text-gray-400 mb-1.5">
          Tournament format — score each player on their own merits, out of {scale}. There's no fixed range to hold anyone to.
        </p>
        {last_session ? (
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-center">
            <span className="font-mono font-black text-2xl text-ink">{last_session.high} – {last_session.low}</span>
            <div className="text-[11px] text-gray-400 mt-1">
              What the field scored in Session {last_session.session_number} (avg {last_session.avg}, {last_session.athletes_counted} players)
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-center text-sm text-gray-400">
            No scores yet from an earlier session — nothing to reference yet.
          </div>
        )}
      </div>
    </>
  );
}

function StandardBody({ guidance }) {
  const { scale, group_number, total_groups, suggested_range, established_range, prior_floor } = guidance;
  const rangeEstablished = established_range && established_range.athletes_counted > 0;
  const priorSuggested = group_number > 1 && prior_floor == null
    ? suggestedRange(group_number - 1, total_groups, scale).low
    : null;

  return (
    <>
      <BiasCallout bias={guidance.bias} />
      <div>
        <p className="text-xs text-gray-400 mb-1.5">
          {rangeEstablished
            ? `Group ${group_number}'s range so far, out of ${scale}:`
            : `Nobody in Group ${group_number} has been scored yet — suggested starting range out of ${scale}:`}
        </p>
        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-center">
          <span className="font-mono font-black text-2xl text-ink">
            {rangeEstablished ? `${established_range.ceiling} – ${established_range.floor}` : `${suggested_range.high} – ${suggested_range.low}`}
          </span>
          {!rangeEstablished && <div className="text-[11px] text-gray-400 mt-1 uppercase tracking-wide font-semibold">Suggested</div>}
        </div>
      </div>

      {group_number > 1 && (
        <div className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-3">
          <p className="text-sm text-ink leading-snug">
            To rank a player above Group {group_number - 1}, score them higher than{" "}
            <b className="font-mono">{prior_floor != null ? prior_floor : priorSuggested}</b>
            {prior_floor == null && <span className="text-xs text-gray-400"> (suggested — Group {group_number - 1} hasn't been scored yet)</span>}.
          </p>
        </div>
      )}
    </>
  );
}

export default function SessionGuidanceModal({ guidance, onClose }) {
  if (!guidance || !guidance.applicable) return null;
  const isTournament = guidance.format === "tournament";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h3 className="font-display font-bold text-ink">
            {isTournament ? "Before you score" : `Before you score — Group ${guidance.group_number}`}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          {isTournament ? <TournamentBody guidance={guidance} /> : <StandardBody guidance={guidance} />}

          <button onClick={onClose} className="w-full py-2.5 bg-accent text-white rounded-xl text-sm font-bold hover:opacity-90">
            Got it — start scoring
          </button>
        </div>
      </div>
    </div>
  );
}
