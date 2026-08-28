"use client";

import { Target, ListOrdered, Lightbulb, Compass, LayoutGrid, CalendarRange, Users, Sparkles } from "lucide-react";

const POS_SHORT = { forward: "F", defense: "D", forward_defense: "F/D", goalie: "G" };

// Lightweight renderer for the AI briefing text: headers (# / N. TITLE / ALLCAPS),
// bullets (-, *, •), and **bold**. Keeps it readable without a markdown dep.
function inlineBold(s) {
  const parts = String(s).split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold text-gray-900">{p}</strong> : p));
}
function Briefing({ text }) {
  const blocks = String(text).trim().split(/\n{2,}/);
  return (
    <div className="space-y-3">
      {blocks.map((blk, bi) => {
        const lines = blk.split(/\n/).map(l => l.trim()).filter(Boolean);
        const bullets = lines.every(l => /^([-*•]|\d+[.)])\s+/.test(l)) && lines.length > 1;
        if (bullets) {
          return <ul key={bi} className="list-disc pl-5 space-y-1 text-sm text-gray-700 leading-relaxed">{lines.map((l, i) => <li key={i}>{inlineBold(l.replace(/^([-*•]|\d+[.)])\s+/, ""))}</li>)}</ul>;
        }
        const first = lines[0] || "";
        const headerLike = /^#{1,3}\s+/.test(first) || /^(\d+\.\s+)?[A-Z0-9][A-Z0-9 &/,'’()-]{3,}$/.test(first) && first === first.toUpperCase();
        if (headerLike) {
          const head = first.replace(/^#{1,3}\s+/, "").replace(/^\d+\.\s+/, "");
          const rest = lines.slice(1).join(" ");
          return (
            <div key={bi}>
              <h5 className="font-display font-bold text-ink text-sm tracking-tight mt-2 mb-1">{head}</h5>
              {rest && <p className="text-sm text-gray-700 leading-relaxed">{inlineBold(rest)}</p>}
            </div>
          );
        }
        return <p key={bi} className="text-sm text-gray-700 leading-relaxed">{inlineBold(blk.replace(/\n/g, " "))}</p>;
      })}
    </div>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return <div className="flex items-center gap-2 mb-3 text-gray-700"><Icon size={16} className="text-[#0b5cd6]" /><h4 className="font-display text-base font-extrabold text-ink tracking-tight">{children}</h4></div>;
}

// Shared body for the Team Development Report — identical on the association page
// and the coach's emailed (token) page. `onGenerate`/`generating` are only passed
// on the association page to expose the "generate briefing" action.
export function TeamReportBody({ t, onGenerate, generating }) {
  const hasIdentity = (t.strengths?.length || t.growth?.length);
  return (
    <div className="p-5 sm:p-6 space-y-8">

      {/* AI Coach's Briefing */}
      {t.briefing ? (
        <section className="rounded-xl border border-[#0b5cd6]/20 bg-[#0b5cd6]/[0.03] p-5">
          <SectionTitle icon={Sparkles}>Coach's Briefing</SectionTitle>
          <Briefing text={t.briefing} />
        </section>
      ) : (
        <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-gray-700 mb-1"><Compass size={15} className="text-[#0b5cd6]" /><h4 className="text-sm font-bold">Coach's read</h4></div>
              <p className="text-sm text-gray-700 leading-relaxed max-w-2xl">{t.summary || "A full written briefing can be generated from the evaluation notes below."}</p>
            </div>
            {onGenerate && (
              <button onClick={() => onGenerate(t.id)} disabled={generating} className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-[#0b5cd6] text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                <Sparkles size={14} /> {generating ? "Writing briefing…" : "Generate full briefing"}
              </button>
            )}
          </div>
          {onGenerate && <p className="text-xs text-gray-400 mt-2">Writes a full multi-section coaching briefing (identity, priorities, season roadmap, per-player notes) from the evaluation data. It's also generated automatically when you email coaches.</p>}
        </section>
      )}

      {/* Takeaways */}
      {t.takeaways?.length > 0 && (
        <section>
          <SectionTitle icon={Lightbulb}>Key takeaways</SectionTitle>
          <ol className="space-y-2">
            {t.takeaways.map((tk, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-700 leading-relaxed">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span>{tk}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Development priorities — detailed blocks */}
      {t.priorities?.length > 0 && (
        <section>
          <SectionTitle icon={Target}>Development priorities</SectionTitle>
          <div className="space-y-3">
            {t.priorities.map(p => (
              <div key={p.label} className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-gray-900">{p.label}</span>
                  <span className="text-xs font-medium text-[#0b5cd6] bg-[#0b5cd6]/10 px-2 py-0.5 rounded-full">flagged on {p.count} of {p.of} players</span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{p.why}</p>
                <p className="text-sm text-gray-500 mt-1.5"><span className="font-semibold text-gray-700">Practice focus:</span> {p.focus}.</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Season roadmap */}
      {t.roadmap?.length > 0 && (
        <section>
          <SectionTitle icon={CalendarRange}>Season practice roadmap</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {t.roadmap.map(r => (
              <div key={r.phase} className="rounded-xl border border-gray-100 p-4">
                <div className="text-[11px] font-bold uppercase tracking-wide text-[#0b5cd6] mb-1">{r.phase}</div>
                <div className="text-sm font-semibold text-gray-900">{r.focus}</div>
                <div className="text-xs text-gray-500 mt-1 leading-relaxed">{r.detail}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          {/* Team shape */}
          {(t.shape?.forwards + t.shape?.defense + t.shape?.goalies > 0) && (
            <section>
              <SectionTitle icon={LayoutGrid}>Team shape & deployment</SectionTitle>
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold">{t.shape.forwards} F</span>
                <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 font-semibold">{t.shape.defense} D</span>
                {t.shape.goalies > 0 && <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-semibold">{t.shape.goalies} G</span>}
              </div>
              {t.shapeNote && <p className="text-sm text-gray-500 mt-2 leading-relaxed">You're {t.shapeNote}.</p>}
              {hasIdentity && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {t.strengths?.map(s => <span key={s} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">↑ {s}</span>)}
                  {t.growth?.map(s => <span key={s} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">build: {s}</span>)}
                </div>
              )}
            </section>
          )}

          {/* Team ranking */}
          <section>
            <SectionTitle icon={ListOrdered}>Team ranking</SectionTitle>
            <p className="text-xs text-gray-400 mb-2.5 -mt-1.5">Ordered relative to teammates only.</p>
            <ol className="rounded-xl border border-gray-100 divide-y divide-gray-50">
              {t.ranking.map(p => (
                <li key={p.within_rank} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-6 text-center text-xs font-bold text-[#0b5cd6] tabular-nums">{p.within_rank}</span>
                  <span className="flex-1 text-sm font-medium text-gray-900">{p.name}</span>
                  {p.position && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{POS_SHORT[p.position] || p.position}</span>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Player development snapshots */}
        <section>
          <SectionTitle icon={Users}>Player development focus</SectionTitle>
          <p className="text-xs text-gray-400 mb-2.5 -mt-1.5">What evaluators most flagged for each player — no scores, so it's safe to share in the room.</p>
          <div className="space-y-2">
            {t.players?.map(p => (
              <div key={p.within_rank} className="flex items-start gap-3 rounded-lg border border-gray-100 px-3 py-2">
                <span className="text-sm font-medium text-gray-900 flex-1 min-w-0">{p.name}{p.position ? <span className="text-gray-400 font-normal"> · {POS_SHORT[p.position] || p.position}</span> : ""}</span>
                <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                  {p.focus.length ? p.focus.map(f => <span key={f} className="text-[11px] px-2 py-0.5 rounded-full bg-[#0b5cd6]/5 text-[#0b5cd6] border border-[#0b5cd6]/15 font-medium">{f}</span>)
                    : <span className="text-[11px] text-gray-300 italic">{p.has_notes ? "well-rounded" : "no notes yet"}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Development themes (aggregate chips) */}
      {t.themes?.length > 0 && (
        <section>
          <SectionTitle icon={Lightbulb}>Most-flagged themes</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {t.themes.map(th => (
              <span key={th.theme} className="inline-flex items-center gap-1.5 rounded-full border border-[#0b5cd6]/20 bg-[#0b5cd6]/5 text-[#0b5cd6] font-medium" style={{ padding: "6px 12px", fontSize: `${Math.min(15, 11 + th.count / 3)}px` }}>
                {th.theme}<span className="text-gray-400 text-xs">{th.count}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
