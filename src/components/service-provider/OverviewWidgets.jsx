"use client";

import { Clock, MapPin, Star, CheckCircle, AlertTriangle } from "lucide-react";
import { formatTime, formatDate, sessionStaffing } from "@/lib/spDashboardUtils";

// Compact session line used on the Overview (home) tab for Today's / Upcoming lists.
export function SessionRow({ s, showDate }) {
  const st = sessionStaffing(s);
  return (
    <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
      <div className="min-w-[10rem] flex-1">
        <div className="text-sm font-semibold text-gray-900 truncate">{s.org_name} · {s.category_name}</div>
        <div className="text-xs text-gray-400 flex items-center gap-2 flex-wrap mt-0.5">
          <span>S{s.session_number}{s.group_number ? ` · G${s.group_number}` : ""}</span>
          {showDate && <><span className="text-gray-300">·</span><span>{formatDate(s.scheduled_date)}</span></>}
          {s.start_time && <><span className="text-gray-300">·</span><span className="inline-flex items-center gap-1"><Clock size={11} />{formatTime(s.start_time)}{s.end_time ? `–${formatTime(s.end_time)}` : ""}</span></>}
          {s.location && <><span className="text-gray-300">·</span><span className="inline-flex items-center gap-1"><MapPin size={11} />{s.location}</span></>}
        </div>
      </div>
      {st.isTesting && st.req === 0
        ? <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium flex-shrink-0">Set testers</span>
        : st.open > 0
        ? <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium flex-shrink-0">needs {st.open} more {st.noun}{st.open === 1 ? "" : "s"}</span>
        : <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium flex-shrink-0">Staffed</span>}
      {s.is_goalie_sp
        ? <a href={`/evaluator/score/${s.schedule_id}`} className="text-xs px-3 py-1.5 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg font-semibold hover:shadow-md flex-shrink-0 inline-flex items-center gap-1.5"><Star size={12} /> Evaluate</a>
        : <a href={`/checkin/${s.schedule_id}`} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 flex-shrink-0">Check-in</a>}
    </div>
  );
}

// Compact banner atop the Evaluator/Tester Pool tabs — "how many spots need
// filled" is the first thing an SP wants to know before triaging the roster.
export function OpenSpotsTracker({ open, sessions, noun }) {
  if (open <= 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
        <CheckCircle size={16} className="flex-shrink-0" />
        <span>All upcoming {noun} sessions are fully staffed.</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
      <AlertTriangle size={16} className="flex-shrink-0" />
      <span><b>{open}</b> open {noun} spot{open === 1 ? "" : "s"} across <b>{sessions}</b> upcoming session{sessions === 1 ? "" : "s"}.</span>
    </div>
  );
}
