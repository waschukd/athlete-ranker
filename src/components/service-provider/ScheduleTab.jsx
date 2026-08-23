"use client";

import { useState, useEffect, useMemo } from "react";
import { Calendar, CalendarDays, List, Clock, MapPin, CheckCircle, Star, X } from "lucide-react";
import { DateStripBar, MonthCalendar, WeekGrid } from "@/components/SessionDateNav";
import { colorForOrg, buildOrgColorMap, paletteFromHex, OrgChip } from "@/lib/orgVisuals";
import { formatDate, formatTime } from "@/lib/spDashboardUtils";
import SessionRosterModal from "@/components/SessionRosterModal";
import BatchScheduleImport from "@/components/service-provider/BatchScheduleImport";
import TestingSessionsControls from "@/components/service-provider/TestingSessionsControls";
import { ScheduleRowControls, AddSessionButton } from "@/components/service-provider/ScheduleControls";
import { TesterStaffingControl } from "@/components/service-provider/TestersTab";
import BlastButton from "@/components/service-provider/BlastButton";

const SESSION_TYPE_COLORS = {
  testing: "bg-blue-100 text-blue-700",
  skills: "bg-purple-100 text-purple-700",
  scrimmage: "bg-green-100 text-green-700",
};

export default function ScheduleTab({ schedule, byDate, schedLoading, today, associations, orgParam, spUrl, refetchSchedule }) {
  const [scheduleView, setScheduleViewRaw] = useState("week"); // "week" | "month" | "list"
  useEffect(() => {
    const saved = typeof window !== "undefined" && window.localStorage.getItem("sp-schedule-view");
    if (saved === "week" || saved === "month" || saved === "list") setScheduleViewRaw(saved);
  }, []);
  const setScheduleView = (v) => { setScheduleViewRaw(v); try { window.localStorage.setItem("sp-schedule-view", v); } catch {} };

  const [scheduleTypeFilter, setScheduleTypeFilter] = useState("all"); // "all" | "testing" | "eval"
  const [scheduleAssocFilter, setScheduleAssocFilter] = useState("all"); // "all" | <org_id>
  const [rosterScheduleId, setRosterScheduleId] = useState(null);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [calLinks, setCalLinks] = useState(null);
  const [showPastSessions, setShowPastSessions] = useState(false);
  // Persisted so the date selection is retained across tab navigation (and reloads).
  const [scheduleSelectedDate, setScheduleSelectedDateState] = useState(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("sp-schedule-selected-date") || null;
  }); // YYYY-MM-DD or null
  const setScheduleSelectedDate = (val) => {
    setScheduleSelectedDateState(val);
    if (typeof window !== "undefined") {
      if (val) window.localStorage.setItem("sp-schedule-selected-date", val);
      else window.localStorage.removeItem("sp-schedule-selected-date");
    }
  };
  const [scheduleSavedMsg, setScheduleSavedMsg] = useState(false);
  const [addSessionCatId, setAddSessionCatId] = useState("");
  const onScheduleSaved = () => {
    refetchSchedule();
    setScheduleSavedMsg(true);
    setTimeout(() => setScheduleSavedMsg(false), 4000);
  };

  const allDates = Object.keys(byDate).sort();
  const upcomingDates = showPastSessions ? allDates : allDates.filter(d => d >= today);
  const pastCount = allDates.filter(d => d < today).length;

  // Org -> palette map for the master schedule (deterministic, distinct).
  // Built from the orgs actually present in the current schedule view.
  const scheduleOrgColorMap = useMemo(() => {
    const orgs = Array.from(new Set(schedule.map(s => s.org_name).filter(Boolean)));
    return buildOrgColorMap(orgs);
  }, [schedule]);
  // SP-picked colours override the auto palette (fixes collisions).
  const customColorByName = useMemo(() => {
    const m = new Map();
    associations.forEach(a => { if (a.schedule_color) m.set(a.name, a.schedule_color); });
    return m;
  }, [associations]);
  const scheduleOrgPalette = (name) => {
    const custom = customColorByName.get(name);
    if (custom) { const p = paletteFromHex(custom); if (p) return p; }
    return scheduleOrgColorMap.get(name) || colorForOrg(name);
  };

  // Distinct association/category contexts present in the schedule — drives the
  // "Add session" picker (the POST endpoint is keyed by age_category_id).
  const scheduleCategories = useMemo(() => {
    const map = new Map();
    for (const s of schedule) {
      if (s.age_category_id && !map.has(s.age_category_id)) {
        map.set(s.age_category_id, { age_category_id: s.age_category_id, org_name: s.org_name, category_name: s.category_name });
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.org_name + a.category_name).localeCompare(b.org_name + b.category_name));
  }, [schedule]);
  const addSessionCategory = scheduleCategories.find(c => String(c.age_category_id) === String(addSessionCatId));

  // Date filter: when a specific date is picked from strip / calendar, show
  // only that day's sessions in the list.
  const visibleDatesRaw = scheduleSelectedDate
    ? upcomingDates.filter(d => d === scheduleSelectedDate)
    : upcomingDates;
  // Session-type filter for the Master Schedule: all / testing only / evaluation
  // (anything scored — scrimmage, skills, goalie). Testing rows carry
  // session_type === "testing".
  const matchesType = (s) => scheduleTypeFilter === "all"
    ? true
    : scheduleTypeFilter === "testing"
      ? s.session_type === "testing"
      : s.session_type !== "testing";
  const matchesAssoc = (s) => scheduleAssocFilter === "all" || String(s.org_id) === String(scheduleAssocFilter);
  const matchesFilters = (s) => matchesType(s) && matchesAssoc(s);
  const visibleDates = visibleDatesRaw.filter(d => (byDate[d] || []).some(matchesFilters));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Master Schedule</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Week / Month / List toggle — Google-style views */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
            {[
              { id: "week", label: "Week", Icon: CalendarDays },
              { id: "month", label: "Month", Icon: Calendar },
              { id: "list", label: "List", Icon: List },
            ].map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setScheduleView(id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  scheduleView === id ? "bg-[#0b5cd6] text-white" : "text-gray-600 hover:bg-gray-50"
                }`}>
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
          {/* Session-type filter — all / testing only / evaluation */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
            {[
              { id: "all", label: "All" },
              { id: "testing", label: "Testing" },
              { id: "eval", label: "Evaluation" },
            ].map(({ id, label }) => (
              <button key={id} onClick={() => setScheduleTypeFilter(id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  scheduleTypeFilter === id ? "bg-[#0b5cd6] text-white" : "text-gray-600 hover:bg-gray-50"
                }`}>
                {label}
              </button>
            ))}
          </div>
          {/* Association filter — narrow the schedule to one client association */}
          {associations.length > 1 && (
            <select
              value={scheduleAssocFilter}
              onChange={e => setScheduleAssocFilter(e.target.value)}
              className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30 ${scheduleAssocFilter !== "all" ? "border-[#0b5cd6] bg-[#0b5cd6]/5 text-[#0b5cd6]" : "border-gray-200 bg-white text-gray-600"}`}
            >
              <option value="all">All associations</option>
              {associations.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          {/* Subscribe — add the master schedule to Google/Apple Calendar */}
          <button
            onClick={async () => {
              setShowSubscribe(true);
              if (!calLinks) {
                try { const r = await fetch(spUrl("/api/service-provider/calendar-link")); if (r.ok) setCalLinks(await r.json()); } catch {}
              }
            }}
            className="text-xs px-3 py-1.5 rounded-lg border font-medium bg-white text-gray-600 border-gray-200 inline-flex items-center gap-1"
          >
            <Calendar size={12} /> Subscribe
          </button>
          <button onClick={() => setShowPastSessions(!showPastSessions)} className="text-xs px-3 py-1.5 rounded-lg border font-medium bg-white text-gray-600 border-gray-200">
            {showPastSessions ? "Hide Past" : `Show Past (${pastCount})`}
          </button>
          {/* Batch import — drop a schedule file for a chosen category */}
          {scheduleCategories.length > 0 && (
            <BatchScheduleImport categories={scheduleCategories} org={orgParam} onSaved={onScheduleSaved} />
          )}
          {/* SP-owned testing sessions — add / bulk upload (belongs here, not in Testers) */}
          <TestingSessionsControls spUrl={spUrl} onSaved={onScheduleSaved} />
          {/* Add session — pick an association/category context first */}
          {scheduleCategories.length > 0 && (
            <div className="inline-flex items-center gap-2">
              <select
                value={addSessionCatId}
                onChange={(e) => setAddSessionCatId(e.target.value)}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent/30 max-w-[14rem]"
              >
                <option value="">Add to…</option>
                {scheduleCategories.map(c => (
                  <option key={c.age_category_id} value={c.age_category_id}>{c.org_name} · {c.category_name}</option>
                ))}
              </select>
              {addSessionCategory && <AddSessionButton category={addSessionCategory} onSaved={onScheduleSaved} />}
            </div>
          )}
        </div>
      </div>

      {scheduleSavedMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm text-green-700">
          Saved — association, directors and evaluators notified.
        </div>
      )}

      {showSubscribe && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && setShowSubscribe(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 mt-16">
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">Add to your calendar</h3>
              <button onClick={() => setShowSubscribe(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-400 mb-4">Subscribe once and every session across your client associations shows up in Google, Apple, or Outlook Calendar — and stays in sync as the schedule changes.</p>
            {!calLinks ? (
              <div className="py-6 text-center text-sm text-gray-400">Generating your calendar link…</div>
            ) : (
              <div className="space-y-3">
                <a href={calLinks.googleUrl} target="_blank" rel="noopener noreferrer" className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold hover:shadow-md">
                  <Calendar size={15} /> Add to Google Calendar
                </a>
                <a href={calLinks.webcalUrl} className="w-full inline-flex items-center justify-center gap-2 py-2.5 border border-gray-300 text-ink rounded-lg text-sm font-semibold hover:bg-gray-50">
                  Add to Apple Calendar
                </a>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Or paste this URL into any calendar app (“From URL” / “Subscribe”)</label>
                  <div className="flex items-center gap-2">
                    <input readOnly value={calLinks.httpsUrl} className="flex-1 text-[11px] bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-700 font-mono" />
                    <button onClick={() => navigator.clipboard.writeText(calLinks.httpsUrl)} className="px-2.5 py-1.5 bg-accent text-white rounded text-xs font-semibold hover:opacity-90">Copy</button>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">Keep this link private — anyone with it can see your master schedule. Google refreshes subscribed calendars roughly every few hours.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selected-date chip when a specific date is picked */}
      {scheduleSelectedDate && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <Calendar size={14} className="text-blue-600" />
          <span className="text-sm text-blue-900">
            Showing only <strong>{(() => {
              const [y, m, d] = scheduleSelectedDate.split("-").map(Number);
              return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
            })()}</strong>
          </span>
          <button
            onClick={() => setScheduleSelectedDate(null)}
            className="ml-auto text-blue-600 hover:text-blue-900"
            aria-label="Clear date filter"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {schedLoading ? <div className="py-12 text-center text-gray-400">Loading schedule...</div> : upcomingDates.length === 0 ? (
        <div className="py-16 text-center bg-white border border-dashed border-gray-200 rounded-2xl">
          <Calendar size={48} className="mx-auto text-gray-200 mb-4" />
          <h3 className="font-semibold text-gray-600">No upcoming sessions</h3>
        </div>
      ) : scheduleView === "week" ? (
        <WeekGrid
          sessions={schedule.filter(s => (showPastSessions || s.scheduled_date?.toString().split("T")[0] >= today) && matchesType(s))}
          paletteFor={scheduleOrgPalette}
          onSelect={(dateKey) => { setScheduleSelectedDate(dateKey); setScheduleView("list"); }}
          onOpen={(s) => { const k = s.scheduled_date?.toString().split("T")[0]; if (k) { setScheduleSelectedDate(k); setScheduleView("list"); } }}
        />
      ) : scheduleView === "month" ? (
        <MonthCalendar
          sessions={schedule.filter(s => (showPastSessions || s.scheduled_date?.toString().split("T")[0] >= today) && matchesType(s))}
          paletteFor={scheduleOrgPalette}
          onSelect={(dateKey) => { setScheduleSelectedDate(dateKey); setScheduleView("list"); }}
        />
      ) : (
        <>
          <DateStripBar
            sessions={schedule.filter(s => (showPastSessions || s.scheduled_date?.toString().split("T")[0] >= today) && matchesType(s))}
            selectedDate={scheduleSelectedDate}
            onSelect={setScheduleSelectedDate}
            paletteFor={scheduleOrgPalette}
          />
          <div className="space-y-6">
            {visibleDates.map(date => (
              <div key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">{formatDate(date)}</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
                <div className="space-y-2">
                  {byDate[date].filter(matchesFilters).map(entry => {
                    const palette = scheduleOrgPalette(entry.org_name);
                    return (
                      <div
                        key={entry.schedule_id}
                        className={`bg-white border rounded-xl p-4 flex items-center gap-4 flex-wrap ${entry.status === "cancelled" ? "border-gray-200 opacity-60" : entry.spots_open > 0 ? "border-amber-200" : "border-gray-200"}`}
                        style={{ borderLeft: `4px solid ${palette.hex}` }}
                      >
                        <div className="flex-1 min-w-[9rem]">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <OrgChip name={entry.org_name} palette={palette} />
                            <span className="text-gray-700 text-sm font-medium">{entry.category_name}</span>
                            {entry.session_type && <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${SESSION_TYPE_COLORS[entry.session_type] || "bg-gray-100 text-gray-600"}`}>{entry.session_type}</span>}
                            {entry.status === "cancelled" && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Cancelled</span>}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                            <span className="flex items-center gap-1"><Clock size={11} />{formatTime(entry.start_time)}{entry.end_time ? ` - ${formatTime(entry.end_time)}` : ""}</span>
                            {entry.location && <span className="flex items-center gap-1"><MapPin size={11} />{entry.location}</span>}
                            <span className="font-mono">S{entry.session_number}{entry.group_number ? ` G${entry.group_number}` : ""}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                          {entry.status !== "cancelled" && (
                            <>
                              {entry.is_goalie_sp ? (
                                <button onClick={() => setRosterScheduleId(entry.schedule_id)} title="See who's evaluating this session" className="text-center hover:opacity-70">
                                  <div className={`text-sm font-bold ${entry.spots_open > 0 ? "text-amber-600" : "text-green-600"}`}>{entry.evaluators_signed_up}/{entry.goalie_evaluators_required}</div>
                                  <div className="text-xs text-gray-400 underline decoration-dotted underline-offset-2">goalie eval</div>
                                </button>
                              ) : entry.session_type === 'testing' ? (
                                entry.is_goalie_sp
                                  ? <div className="text-center"><div className="text-sm font-bold text-gray-400">—</div><div className="text-xs text-gray-400">no evaluators needed</div></div>
                                  : <TesterStaffingControl entry={entry} spUrl={spUrl} onSaved={refetchSchedule} onOpenRoster={() => setRosterScheduleId(entry.schedule_id)} />
                              ) : (
                                <>
                                  <button onClick={() => setRosterScheduleId(entry.schedule_id)} title="See who's evaluating this session" className="text-center hover:opacity-70">
                                    <div className={`text-sm font-bold ${entry.spots_open > 0 ? "text-amber-600" : "text-green-600"}`}>{entry.evaluators_signed_up}/{entry.evaluators_required}</div>
                                    <div className="text-xs text-gray-400 underline decoration-dotted underline-offset-2">player eval</div>
                                  </button>
                                  {parseInt(entry.goalie_evaluators_required) > 0 && (
                                    <div className="text-center">
                                      <div className="text-sm font-bold text-gray-600">{entry.goalie_evaluators_required}</div>
                                      <div className="text-xs text-gray-400">goalie eval</div>
                                    </div>
                                  )}
                                </>
                              )}
                              {entry.session_type === 'testing' && !entry.is_goalie_sp
                                ? (entry.tester_spots_open > 0 ? <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">{entry.tester_spots_open} tester{entry.tester_spots_open === 1 ? "" : "s"} needed</span> : parseInt(entry.testers_required || 0) > 0 ? <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full flex items-center gap-1"><CheckCircle size={11} /> Testers set</span> : null)
                                : entry.session_type === 'testing' ? null
                                : entry.spots_open > 0 ? <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">{entry.spots_open} open</span> : <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full flex items-center gap-1"><CheckCircle size={11} /> Full</span>}
                              {!entry.is_goalie_sp && <a href={`/checkin/${entry.schedule_id}`} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Check-in</a>}
                              {/* Goalie SP evaluates its own goalies — jump straight into scoring. */}
                              {entry.is_goalie_sp && entry.status !== "cancelled" && (
                                <a href={`/evaluator/score/${entry.schedule_id}`} className="text-xs px-3 py-1.5 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg font-semibold hover:shadow-md inline-flex items-center gap-1.5">
                                  <Star size={12} /> Evaluate
                                </a>
                              )}
                              {entry.spots_open > 0 && <BlastButton scheduleId={entry.schedule_id} spotsOpen={entry.spots_open} />}
                            </>
                          )}
                          <ScheduleRowControls entry={entry} onSaved={onScheduleSaved} orgParam={orgParam} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Per-session roster — opened by clicking a session's evaluator count.
          Shows who's signed up and lets the SP add/remove. */}
      {rosterScheduleId && (
        <SessionRosterModal scheduleId={rosterScheduleId} onClose={() => { setRosterScheduleId(null); refetchSchedule(); }} />
      )}
    </div>
  );
}
