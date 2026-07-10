"use client";

import { useState } from "react";
import { CalendarDays, Calendar, List, Clock3 } from "lucide-react";
import { WeekGrid, MonthCalendar, DayView } from "@/components/SessionDateNav";
import SubscribeCalendar from "@/components/SubscribeCalendar";

// One schedule presentation shared across the SP, association, director,
// evaluator, and tester views so they all look the same: a List / Day / Week /
// Month toggle, the Google-style calendar components, a prominent date, and an
// optional Subscribe (Google/Apple) button.
//
// Props:
//   sessions      — array with scheduled_date, start_time, end_time, org_name...
//   renderRow(s)  — surface-specific list row (sign up / manage / etc.)
//   subscribeEndpoint? — if set, shows the Subscribe button
//   colorKey/labelFor/subLabelFor/paletteFor — passed to the calendar views
//   defaultView?  — "list" | "day" | "week" | "month" (default "list")
//   storageKey?   — persist the chosen view under this localStorage key
//   emptyText?, extraActions?
const dateKeyOf = (s) => s?.scheduled_date?.toString().split("T")[0] || null;
const fmtDateHeader = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
};

export default function ScheduleBoard({ sessions, renderRow, subscribeEndpoint, colorKey, labelFor, subLabelFor, paletteFor, defaultView = "list", storageKey, emptyText = "No sessions.", extraActions }) {
  const [view, setViewRaw] = useState(() => {
    if (storageKey && typeof window !== "undefined") {
      const v = window.localStorage.getItem(storageKey);
      if (v === "list" || v === "day" || v === "week" || v === "month") return v;
    }
    return defaultView;
  });
  const [day, setDay] = useState(null);
  const setView = (v) => { setViewRaw(v); if (storageKey) { try { window.localStorage.setItem(storageKey, v); } catch {} } };

  const calProps = { colorKey, labelFor, subLabelFor, paletteFor };
  const toDay = (dateKey) => { setDay(dateKey); setView("day"); };

  // List grouped by date, prominent date headers.
  const byDate = {};
  for (const s of sessions) { const k = dateKeyOf(s); if (!k) continue; (byDate[k] = byDate[k] || []).push(s); }
  const dates = Object.keys(byDate).sort();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
          {[
            { id: "list", label: "List", Icon: List },
            { id: "day", label: "Day", Icon: Clock3 },
            { id: "week", label: "Week", Icon: CalendarDays },
            { id: "month", label: "Month", Icon: Calendar },
          ].map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setView(id)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${view === id ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {extraActions}
          {subscribeEndpoint && <SubscribeCalendar linkEndpoint={subscribeEndpoint} />}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="py-12 text-center bg-white border border-dashed border-gray-200 rounded-xl text-sm text-gray-400">{emptyText}</div>
      ) : view === "day" ? (
        <DayView sessions={sessions} initialDate={day} onOpen={() => {}} {...calProps} />
      ) : view === "week" ? (
        <WeekGrid sessions={sessions} onSelect={toDay} onOpen={(s) => toDay(dateKeyOf(s))} {...calProps} />
      ) : view === "month" ? (
        <MonthCalendar sessions={sessions} onSelect={toDay} colorKey={colorKey} labelFor={labelFor} paletteFor={paletteFor} />
      ) : (
        <div className="space-y-5">
          {dates.map(date => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-bold text-ink whitespace-nowrap">{fmtDateHeader(date)}</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              <div className="space-y-2">
                {byDate[date]
                  .slice()
                  .sort((a, b) => String(a.start_time || "").localeCompare(String(b.start_time || "")))
                  .map((s, i) => <div key={s.schedule_id || i}>{renderRow(s)}</div>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
