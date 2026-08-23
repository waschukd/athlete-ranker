"use client";

import { Building2, CalendarDays, Calendar, AlertTriangle, ArrowRight, Star } from "lucide-react";
import { formatDate, sessionStaffing } from "@/lib/spDashboardUtils";
import { SessionRow } from "@/components/service-provider/OverviewWidgets";

export default function OverviewTab({
  associations, todaySessions, upcomingSessions, schedLoading, today,
  totalUpcoming, openSpots, needsEvaluators, needsAttention, topEvaluators, onGoToTab,
}) {
  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Client Associations", value: associations.length, Icon: Building2 },
          { label: "Sessions Today", value: todaySessions.length, Icon: CalendarDays, gold: true },
          { label: "Upcoming Sessions", value: totalUpcoming, Icon: Calendar },
          { label: "Open Spots", value: openSpots, Icon: AlertTriangle, amber: openSpots > 0 },
        ].map((c, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{c.label}</div>
              <c.Icon size={16} className={c.amber ? "text-amber-500" : "text-accent"} />
            </div>
            <div className={`mt-2 font-display font-black text-3xl ${c.gold ? "text-accent" : c.amber ? "text-amber-600" : "text-ink"}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* LEFT: sessions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-display font-bold text-ink text-lg leading-tight flex items-center gap-2"><CalendarDays size={17} className="text-accent" /> Today's scheduled sessions</h3>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(today)}</p>
              </div>
              <span className="text-sm text-gray-400">{todaySessions.length} session{todaySessions.length === 1 ? "" : "s"}</span>
            </div>
            {schedLoading ? (
              <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
            ) : todaySessions.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">Nothing on the ice today.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {todaySessions.map(s => <SessionRow key={s.schedule_id} s={s} />)}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-display font-bold text-ink text-lg leading-tight flex items-center gap-2"><Calendar size={17} className="text-accent" /> Upcoming sessions</h3>
              <button onClick={() => onGoToTab("schedule")} className="text-xs font-semibold text-accent hover:opacity-70 inline-flex items-center gap-1">View all <ArrowRight size={12} /></button>
            </div>
            {schedLoading ? (
              <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
            ) : upcomingSessions.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">No upcoming sessions scheduled.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {upcomingSessions.map(s => <SessionRow key={s.schedule_id} s={s} showDate />)}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: attention + top evaluators */}
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="font-display font-bold text-ink text-lg leading-tight flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> Needs attention</h3>
            <p className="text-xs text-gray-400 mt-0.5 mb-3">{needsEvaluators} session{needsEvaluators === 1 ? "" : "s"} short on staff</p>
            {needsAttention.length === 0 ? (
              <p className="text-sm text-gray-400 py-3">All upcoming sessions are fully staffed.</p>
            ) : (
              <div>
                {needsAttention.map(s => (
                  <div key={s.schedule_id} className="flex items-start gap-3 py-2.5 border-t border-gray-100 first:border-t-0">
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-ink truncate">{s.org_name} · {s.category_name}</div>
                      <div className="text-xs text-gray-400">{formatDate(s.scheduled_date)} · needs {sessionStaffing(s).open} more {sessionStaffing(s).noun}{sessionStaffing(s).open === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="font-display font-bold text-ink text-lg leading-tight flex items-center gap-2"><Star size={16} className="text-accent" /> Top evaluators</h3>
            <p className="text-xs text-gray-400 mt-0.5 mb-3">By sessions worked</p>
            {topEvaluators.length === 0 ? (
              <p className="text-sm text-gray-400 py-3">No session history yet.</p>
            ) : (
              <div>
                {topEvaluators.map(ev => (
                  <div key={ev.id} className="flex items-center gap-3 py-2.5 border-t border-gray-100 first:border-t-0">
                    <div className="w-9 h-9 rounded-full bg-accent-soft text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">{(ev.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-ink truncate">{ev.name}</div>
                      <div className="text-xs text-gray-400 truncate">{ev._sessions} session{ev._sessions === 1 ? "" : "s"}{parseFloat(ev.total_hours || 0) > 0 ? ` · ${parseFloat(ev.total_hours).toFixed(0)}h` : ""}</div>
                    </div>
                    {parseFloat(ev.avg_rating || 0) > 0 && <span className="text-xs font-mono text-accent flex-shrink-0">{parseFloat(ev.avg_rating).toFixed(1)}★</span>}
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => onGoToTab("evaluators")} className="mt-3 text-xs font-semibold text-accent hover:opacity-70 inline-flex items-center gap-1">Full pool <ArrowRight size={12} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
