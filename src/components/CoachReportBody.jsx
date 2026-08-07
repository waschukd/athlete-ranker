"use client";

import { Target, ListOrdered, Lightbulb, Compass, LayoutGrid } from "lucide-react";

const POS_SHORT = { forward: "F", defense: "D", goalie: "G" };

// Shared rich body for the Team Development Report — rendered identically on the
// association-facing page and the coach's emailed (token) page.
export function TeamReportBody({ t }) {
  const hasIdentity = (t.strengths?.length || t.growth?.length);
  return (
    <div className="p-5 space-y-6">
      {/* Coach's read */}
      {t.summary && (
        <div className="rounded-xl border border-[#0b5cd6]/20 bg-[#0b5cd6]/[0.04] p-4">
          <div className="flex items-center gap-2 mb-1.5 text-[#0b5cd6]"><Compass size={15} /><h4 className="text-xs font-bold uppercase tracking-wide">Coach's read</h4></div>
          <p className="text-sm text-gray-700 leading-relaxed">{t.summary}</p>
        </div>
      )}

      {/* Key takeaways */}
      {t.takeaways?.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2 text-gray-700"><Lightbulb size={15} className="text-amber-500" /><h4 className="text-sm font-bold">Key takeaways</h4></div>
          <ol className="space-y-2">
            {t.takeaways.map((tk, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-700 leading-relaxed">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span>{tk}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Team identity */}
          {hasIdentity && (
            <div>
              <div className="flex items-center gap-2 mb-2 text-gray-700"><Target size={15} className="text-[#0b5cd6]" /><h4 className="text-sm font-bold">Team identity</h4></div>
              <div className="flex flex-wrap gap-1.5">
                {t.strengths?.map(s => <span key={s} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">↑ {s}</span>)}
                {t.growth?.map(s => <span key={s} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">focus: {s}</span>)}
              </div>
            </div>
          )}

          {/* Team shape */}
          {(t.shape?.forwards + t.shape?.defense + t.shape?.goalies > 0) && (
            <div>
              <div className="flex items-center gap-2 mb-2 text-gray-700"><LayoutGrid size={15} className="text-[#0b5cd6]" /><h4 className="text-sm font-bold">Team shape</h4></div>
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold">{t.shape.forwards} F</span>
                <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 font-semibold">{t.shape.defense} D</span>
                {t.shape.goalies > 0 && <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-semibold">{t.shape.goalies} G</span>}
              </div>
              {t.shapeNote && <p className="text-xs text-gray-500 mt-2 leading-relaxed">You're {t.shapeNote}.</p>}
            </div>
          )}

          {/* Development priorities */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-gray-700"><Lightbulb size={15} className="text-[#0b5cd6]" /><h4 className="text-sm font-bold">Development priorities</h4></div>
            {t.themes?.length ? (
              <>
                <p className="text-xs text-gray-400 mb-2.5">What evaluators flagged most across the group — the bigger the chip, the more it recurred.</p>
                <div className="flex flex-wrap gap-2">
                  {t.themes.map(th => (
                    <span key={th.theme} className="inline-flex items-center gap-1.5 rounded-full border border-[#0b5cd6]/20 bg-[#0b5cd6]/5 text-[#0b5cd6] font-medium" style={{ padding: "6px 12px", fontSize: `${Math.min(15, 11 + th.count / 3)}px` }}>
                      {th.theme}<span className="text-gray-400 text-xs">{th.count}</span>
                    </span>
                  ))}
                </div>
              </>
            ) : <p className="text-sm text-gray-400 italic">No written evaluator notes for this team yet — themes appear once evaluators add observations.</p>}
          </div>
        </div>

        {/* Team ranking */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-gray-700"><ListOrdered size={15} className="text-[#0b5cd6]" /><h4 className="text-sm font-bold">Team ranking</h4></div>
          <p className="text-xs text-gray-400 mb-2.5">How the roster ordered relative to their own teammates through the process.</p>
          <ol className="rounded-xl border border-gray-100 divide-y divide-gray-50">
            {t.ranking.map(p => (
              <li key={p.within_rank} className="flex items-center gap-3 px-3 py-2">
                <span className="w-6 text-center text-xs font-bold text-[#0b5cd6] tabular-nums">{p.within_rank}</span>
                <span className="flex-1 text-sm font-medium text-gray-900">{p.name}</span>
                {p.position && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{POS_SHORT[p.position] || p.position}</span>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
