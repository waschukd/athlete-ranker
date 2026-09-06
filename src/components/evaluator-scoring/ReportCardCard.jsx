"use client";

import { TrendingUp, TrendingDown, LineChart } from "lucide-react";

// Always-visible dashboard summary of the same numbers the emailed report
// card sends -- so an evaluator can check where they stand anytime, not just
// when Dan gets around to clicking "send". agreement_pct is the real
// tier-consensus rate (lib/scoring.js tierDisagreementStats), not raw score
// closeness -- see the SP-facing scorecard for why that distinction matters.
export default function ReportCardCard({ data }) {
  if (!data?.applicable) return null;

  const { agreement_pct, judged, bias } = data;
  const color = agreement_pct >= 90 ? "text-green-600" : agreement_pct >= 75 ? "text-amber-600" : "text-red-600";
  const ring = agreement_pct >= 90 ? "border-green-200 bg-green-50" : agreement_pct >= 75 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50";
  const hasBias = bias != null && Math.abs(bias) >= 0.3;

  return (
    <div className="mb-6 bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className={`flex-shrink-0 w-20 h-20 rounded-full border-4 ${ring} flex flex-col items-center justify-center`}>
        <span className={`text-xl font-black ${color}`}>{agreement_pct}%</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <LineChart size={14} className="text-gray-400" /> Your Report Card
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          Agreement with your fellow evaluators — how often your top/middle/bottom call on a player matched the rest of the panel, across {judged} players scored alongside someone else.
        </p>
        {hasBias && (
          <p className="text-xs text-amber-700 mt-1.5 flex items-center gap-1">
            {bias > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            You're currently averaging <b className="mx-0.5">{Math.abs(bias).toFixed(1)} pts {bias > 0 ? "higher" : "lower"}</b> than other evaluators — try to bring your scores more in line with the group.
          </p>
        )}
      </div>
    </div>
  );
}
