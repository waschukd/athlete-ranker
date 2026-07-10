"use client";

// Generic date navigators for any list of session-like records.
//
// Sessions only need to provide `scheduled_date` (YYYY-MM-DD or ISO string)
// and `org_name` (for the colored dots). Both components let the caller
// drive a `selectedDate` state — they don't manage filters themselves.
//
// Used by both the evaluator dashboard's Available tab and the service
// provider admin's Master Schedule.

import React, { useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { colorForOrg, abbrevOrgName } from "@/lib/orgVisuals";

// ── helpers shared by the week grid ──────────────────────────────────────────
const dateKeyOf = (s) => s?.scheduled_date?.toString().split("T")[0] || null;
const timeToMin = (t) => {
  if (!t) return null;
  const [h, m] = t.toString().split(":").map(Number);
  if (!Number.isFinite(h)) return null;
  return h * 60 + (m || 0);
};
const fmtHour = (min) => {
  const h = Math.floor(min / 60);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${ampm}`;
};
const fmtClock = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
};
const startOfWeek = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; };
const keyOfDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Black or white text for a solid org-color chip — keeps events readable on
// BOTH the light and dark (premium) themes, since the chip carries its own
// background rather than relying on theme-flipped Tailwind text classes.
const readableText = (hex) => {
  const h = String(hex || "#888888").replace("#", "");
  if (h.length < 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#141414" : "#ffffff";
};

/**
 * Google-style week view: 7 day columns × hour rows, each session a colored
 * block at its real time. Overlapping sessions in a day split the column width.
 * Sessions with no start time appear in an "all-day" strip at the top of the day.
 * onSelect(dateKey) fires when a day header is tapped; onOpen(session) on a block.
 */
export function WeekGrid({ sessions, paletteFor: paletteForProp, onSelect, onOpen }) {
  const paletteFor = paletteForProp || colorForOrg;
  const HOUR_PX = 44;

  const firstKey = useMemo(() => sessions.map(dateKeyOf).filter(Boolean).sort()[0], [sessions]);
  const [weekStart, setWeekStart] = useState(() => {
    if (firstKey) { const [y, m, d] = firstKey.split("-").map(Number); return startOfWeek(new Date(y, m - 1, d)); }
    return startOfWeek(new Date());
  });

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }), [weekStart]);
  const dayKeys = days.map(keyOfDate);

  // Sessions for this week, bucketed by day.
  const byDay = useMemo(() => {
    const map = {}; dayKeys.forEach(k => (map[k] = []));
    for (const s of sessions) { const k = dateKeyOf(s); if (k && k in map) map[k].push(s); }
    return map;
  }, [sessions, dayKeys.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Visible hour range: fit the week's timed sessions, clamped to a sane default.
  const { startMin, endMin } = useMemo(() => {
    let lo = 8 * 60, hi = 20 * 60;
    for (const k of dayKeys) for (const s of byDay[k]) {
      const st = timeToMin(s.start_time); if (st == null) continue;
      const en = timeToMin(s.end_time) || st + 60;
      lo = Math.min(lo, st); hi = Math.max(hi, en);
    }
    lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
    return { startMin: Math.max(0, lo), endMin: Math.min(24 * 60, Math.max(hi, lo + 120)) };
  }, [byDay, dayKeys.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const hours = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(m);
  const gridHeight = ((endMin - startMin) / 60) * HOUR_PX;

  // Lane assignment for overlapping timed events within a single day.
  const laidOut = (list) => {
    const timed = list.filter(s => timeToMin(s.start_time) != null)
      .map(s => { const st = timeToMin(s.start_time); return { s, st, en: (timeToMin(s.end_time) || st + 60) }; })
      .sort((a, b) => a.st - b.st || a.en - b.en);
    const lanes = []; // each lane = last end time
    const placed = timed.map(ev => {
      let lane = lanes.findIndex(end => end <= ev.st);
      if (lane === -1) { lane = lanes.length; lanes.push(ev.en); } else lanes[lane] = ev.en;
      return { ...ev, lane };
    });
    const laneCount = Math.max(1, lanes.length);
    return { placed, laneCount, untimed: list.filter(s => timeToMin(s.start_time) == null) };
  };

  const monthLabel = weekStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayKey = keyOfDate(new Date());
  const shift = (n) => { const d = new Date(weekStart); d.setDate(d.getDate() + n * 7); setWeekStart(d); };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-2 sm:p-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <button onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Previous week"><ChevronLeft size={18} /></button>
        <h3 className="text-sm font-bold text-gray-900">{monthLabel}</h3>
        <button onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Next week"><ChevronRight size={18} /></button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          {/* Day headers */}
          <div className="grid" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
            <div />
            {days.map((d, i) => {
              const k = dayKeys[i]; const isToday = k === todayKey; const has = (byDay[k] || []).length;
              return (
                <button key={k} onClick={() => has && onSelect?.(k)} disabled={!has}
                  className={`text-center py-1.5 border-b border-gray-100 ${has ? "cursor-pointer hover:bg-blue-50/60" : "cursor-default"}`}>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">{d.toLocaleDateString("en-US", { weekday: "short" })}</div>
                  <div className={`text-sm font-semibold ${isToday ? "text-blue-600" : "text-gray-800"}`}>{d.getDate()}</div>
                </button>
              );
            })}
          </div>

          {/* All-day / no-time strip */}
          {dayKeys.some(k => (byDay[k] || []).some(s => timeToMin(s.start_time) == null)) && (
            <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
              <div className="text-[9px] text-gray-400 pr-1 py-1 text-right">all-day</div>
              {dayKeys.map(k => (
                <div key={k} className="p-0.5 space-y-0.5 border-l border-gray-100">
                  {(byDay[k] || []).filter(s => timeToMin(s.start_time) == null).map((s, idx) => {
                    const p = paletteFor(s.org_name);
                    return <button key={idx} onClick={() => onOpen?.(s)} className="w-full text-left text-[10px] font-semibold leading-tight rounded px-1.5 py-0.5 truncate" style={{ background: p.hex, color: readableText(p.hex) }}>{abbrevOrgName(s.org_name)} {s.category_name}</button>;
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Time grid */}
          <div className="grid" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
            {/* Hour axis */}
            <div className="relative" style={{ height: gridHeight }}>
              {hours.map((m) => (
                <div key={m} className="absolute right-1 -translate-y-1/2 text-[9px] text-gray-400" style={{ top: ((m - startMin) / 60) * HOUR_PX }}>{fmtHour(m)}</div>
              ))}
            </div>
            {/* Day columns */}
            {dayKeys.map((k) => {
              const { placed, laneCount } = laidOut(byDay[k] || []);
              return (
                <div key={k} className="relative border-l border-gray-100" style={{ height: gridHeight }}>
                  {hours.map((m) => (
                    <div key={m} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: ((m - startMin) / 60) * HOUR_PX }} />
                  ))}
                  {placed.map(({ s, st, en, lane }, idx) => {
                    const p = paletteFor(s.org_name);
                    const fg = readableText(p.hex);
                    const top = ((st - startMin) / 60) * HOUR_PX;
                    const height = Math.max(22, ((en - st) / 60) * HOUR_PX - 2);
                    const width = `calc(${100 / laneCount}% - 2px)`;
                    const left = `calc(${(lane * 100) / laneCount}% + 1px)`;
                    return (
                      <button key={idx} onClick={() => onOpen?.(s)} title={`${fmtClock(st)} · ${s.org_name} · ${s.category_name}`}
                        className="absolute rounded px-1.5 py-0.5 text-left overflow-hidden hover:z-10 hover:brightness-110 transition-all"
                        style={{ top, height, left, width, background: p.hex, color: fg, boxShadow: "inset 3px 0 0 rgba(0,0,0,0.28)" }}>
                        <div className="text-[10px] font-bold leading-tight truncate">{fmtClock(st).replace(":00", "")} {abbrevOrgName(s.org_name)}</div>
                        {height > 30 && <div className="text-[9px] leading-tight truncate" style={{ opacity: 0.85 }}>{s.category_name}</div>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Horizontal scrollable strip of dates that have at least one session.
 * Each pill shows day name, date, session count, and up to 3 colored dots
 * (one per association on that date). Tapping a pill toggles selection.
 */
export function DateStripBar({ sessions, selectedDate, onSelect, paletteFor: paletteForProp }) {
  const paletteFor = paletteForProp || colorForOrg;

  const dateBuckets = useMemo(() => {
    const map = new Map();
    sessions.forEach(s => {
      const key = s.scheduled_date?.toString().split("T")[0];
      if (!key) return;
      if (!map.has(key)) map.set(key, { count: 0, orgs: new Set() });
      const bucket = map.get(key);
      bucket.count++;
      if (s.org_name) bucket.orgs.add(s.org_name);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, b]) => ({ key, count: b.count, orgs: Array.from(b.orgs).sort() }));
  }, [sessions]);

  if (dateBuckets.length === 0) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
      {dateBuckets.map(({ key, count, orgs }) => {
        const [y, m, d] = key.split("-").map(Number);
        const dateObj = new Date(y, m - 1, d);
        const isSelected = selectedDate === key;
        const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
        const dayMonth = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return (
          <button
            key={key}
            onClick={() => onSelect(isSelected ? null : key)}
            className={`flex-shrink-0 snap-start flex flex-col items-center justify-between rounded-lg px-2.5 py-2 min-w-[64px] border transition-colors ${
              isSelected
                ? "bg-[#0b5cd6] border-[#0b5cd6] text-white"
                : "bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50"
            }`}
          >
            <span className={`text-[10px] uppercase font-semibold ${isSelected ? "text-blue-100" : "text-gray-400"}`}>
              {dayName}
            </span>
            <span className="text-sm font-bold whitespace-nowrap">{dayMonth}</span>
            <div className="flex flex-col items-center gap-0.5 mt-1">
              <span className={`text-[10px] font-semibold ${isSelected ? "text-blue-100" : "text-gray-500"}`}>
                {count}
              </span>
              <div className="flex flex-wrap justify-center gap-x-1 gap-y-0.5 leading-none">
                {orgs.slice(0, 3).map(o => (
                  <span
                    key={o}
                    className="text-[8px] font-bold tracking-wide"
                    style={{ color: isSelected ? "#fff" : paletteFor(o).hex }}
                    title={o}
                  >
                    {abbrevOrgName(o)}
                  </span>
                ))}
                {orgs.length > 3 && (
                  <span className={`text-[8px] font-semibold ${isSelected ? "text-blue-100" : "text-gray-400"}`}>
                    +{orgs.length - 3}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Full month grid. Each day cell shows up to 4 colored dots (one per
 * association with sessions). Clicking a day with sessions calls `onSelect`
 * with the YYYY-MM-DD key. Days with no sessions are dimmed and disabled.
 */
export function MonthCalendar({ sessions, onSelect, paletteFor: paletteForProp }) {
  const paletteFor = paletteForProp || colorForOrg;

  const byDate = useMemo(() => {
    const map = new Map();
    sessions.forEach(s => {
      const key = s.scheduled_date?.toString().split("T")[0];
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });
    // Order each day's chips by start time so the cell reads top-to-bottom.
    for (const list of map.values()) list.sort((a, b) => (timeToMin(a.start_time) ?? 9999) - (timeToMin(b.start_time) ?? 9999));
    return map;
  }, [sessions]);

  const [viewMonth, setViewMonth] = useState(() => {
    const first = sessions
      .map(s => s.scheduled_date?.toString().split("T")[0])
      .filter(Boolean)
      .sort()[0];
    if (first) {
      const [y, m] = first.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const monthName = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const startWeekday = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, inMonth: false, dateKey: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, inMonth: true, dateKey });
  }
  while (cells.length < 42) {
    const overflow = cells.length - (startWeekday + daysInMonth) + 1;
    cells.push({ day: overflow, inMonth: false, dateKey: null });
  }

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setViewMonth(new Date(year, month - 1, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          aria-label="Previous month"
        >
          <ChevronLeft size={18} />
        </button>
        <h3 className="text-base font-bold text-gray-900">{monthName}</h3>
        <button
          onClick={() => setViewMonth(new Date(year, month + 1, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          aria-label="Next month"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-gray-400 uppercase">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          const list = cell.dateKey ? (byDate.get(cell.dateKey) || []) : [];
          const isToday = cell.dateKey === todayKey;
          const hasSessions = list.length > 0;
          const MAX_CHIPS = 3;
          return (
            <button
              key={i}
              onClick={() => hasSessions && onSelect(cell.dateKey)}
              disabled={!hasSessions}
              className={`min-h-[92px] p-1 flex flex-col items-stretch rounded-md text-xs text-left transition-colors ${
                cell.inMonth
                  ? hasSessions
                    ? "hover:bg-blue-50/60 cursor-pointer"
                    : "cursor-default"
                  : "opacity-30 cursor-default"
              } ${isToday ? "ring-2 ring-blue-400" : ""}`}
            >
              <span className={`font-semibold px-0.5 ${cell.inMonth ? "text-gray-800" : "text-gray-400"} ${isToday ? "text-blue-600" : ""}`}>
                {cell.day}
              </span>
              {hasSessions && (
                <div className="mt-0.5 space-y-0.5 overflow-hidden">
                  {list.slice(0, MAX_CHIPS).map((s, idx) => {
                    const p = paletteFor(s.org_name);
                    const t = timeToMin(s.start_time);
                    return (
                      <div key={idx} className="rounded px-1 py-0.5 truncate text-[10px] font-medium leading-tight" style={{ background: p.hex, color: readableText(p.hex) }}>
                        {t != null && <span className="font-bold">{fmtClock(t).replace(":00", "")} </span>}
                        {abbrevOrgName(s.org_name)}
                      </div>
                    );
                  })}
                  {list.length > MAX_CHIPS && <div className="text-[9px] text-gray-400 px-1">+{list.length - MAX_CHIPS} more</div>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
