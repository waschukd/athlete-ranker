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
import { colorForOrg } from "@/lib/orgVisuals";

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
                ? "bg-[#1A6BFF] border-[#1A6BFF] text-white"
                : "bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50"
            }`}
          >
            <span className={`text-[10px] uppercase font-semibold ${isSelected ? "text-blue-100" : "text-gray-400"}`}>
              {dayName}
            </span>
            <span className="text-sm font-bold whitespace-nowrap">{dayMonth}</span>
            <div className="flex items-center gap-1 mt-1">
              <span className={`text-[10px] font-semibold ${isSelected ? "text-blue-100" : "text-gray-500"}`}>
                {count}
              </span>
              <div className="flex gap-0.5">
                {orgs.slice(0, 3).map(o => (
                  <span
                    key={o}
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: paletteFor(o).hex, boxShadow: isSelected ? "0 0 0 1px white" : "none" }}
                  />
                ))}
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
      if (!map.has(key)) map.set(key, { count: 0, orgs: new Set() });
      const b = map.get(key);
      b.count++;
      if (s.org_name) b.orgs.add(s.org_name);
    });
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
          const bucket = cell.dateKey ? byDate.get(cell.dateKey) : null;
          const orgs = bucket ? Array.from(bucket.orgs).sort() : [];
          const isToday = cell.dateKey === todayKey;
          const hasSessions = bucket && bucket.count > 0;
          return (
            <button
              key={i}
              onClick={() => hasSessions && onSelect(cell.dateKey)}
              disabled={!hasSessions}
              className={`aspect-square min-h-[44px] flex flex-col items-center justify-center rounded-md text-xs transition-colors ${
                cell.inMonth
                  ? hasSessions
                    ? "hover:bg-blue-50 cursor-pointer"
                    : "cursor-default"
                  : "opacity-30 cursor-default"
              } ${isToday ? "ring-2 ring-blue-400" : ""}`}
            >
              <span className={`font-medium ${cell.inMonth ? "text-gray-900" : "text-gray-400"}`}>
                {cell.day}
              </span>
              {hasSessions && (
                <div className="flex gap-0.5 mt-0.5">
                  {orgs.slice(0, 4).map(o => (
                    <span
                      key={o}
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ background: paletteFor(o).hex }}
                    />
                  ))}
                  {orgs.length > 4 && <span className="text-[8px] text-gray-400">+</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
