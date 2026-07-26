"use client";

import { CalendarClock, X } from "lucide-react";

// "There are N back-to-back sessions here — take them all?" Shown when a signup
// click lands inside a run of same-rink/same-day sessions. `sessions` is that
// block (from contiguousBlock). Messaging only — preference to full-block takers
// is a nudge, not an allocation rule.
export default function BatchSignupPrompt({ data, busy, role = "evaluator", onAll, onJustOne, onClose }) {
  if (!data) return null;
  const { sessions } = data;
  const n = sessions.length;
  const first = sessions[0], last = sessions[n - 1];
  const rink = first.location || "this rink";
  const fmt = (t) => { if (!t) return ""; const [h, m] = String(t).split(":"); const hr = parseInt(h); return `${hr % 12 === 0 ? 12 : hr % 12}:${m} ${hr >= 12 ? "PM" : "AM"}`; };
  const day = (d) => d ? new Date(String(d).split("T")[0] + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : "";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft">
              <CalendarClock size={18} className="text-accent" />
            </span>
            <h3 className="font-display font-extrabold tracking-tight text-ink text-lg">Sign up for the whole block?</h3>
          </div>
          <button onClick={() => !busy && onClose()} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <p className="text-sm text-gray-600 mt-2">
          There are <b>{n} back-to-back sessions</b> at <b>{rink}</b> on {day(first.scheduled_date)} — from {fmt(first.start_time)} to {fmt(last.end_time)}. Want to take the full block?
        </p>
        <p className="text-xs text-accent mt-2">Preference is given to {role}s who cover a full block.</p>

        <div className="mt-4 rounded-lg border border-gray-100 divide-y divide-gray-50 max-h-44 overflow-y-auto">
          {sessions.map(s => (
            <div key={s.schedule_id} className="flex items-center justify-between px-3 py-2 text-xs text-gray-600">
              <span>Session {s.session_number}{s.group_number ? ` · Group ${s.group_number}` : ""}</span>
              <span className="font-mono">{fmt(s.start_time)}–{fmt(s.end_time)}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button onClick={() => !busy && onJustOne()} disabled={busy}
            className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50">Just this one</button>
          <button onClick={() => !busy && onAll()} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-accent rounded-lg hover:opacity-90 disabled:opacity-50">
            {busy ? "Signing up…" : `Sign up for all ${n}`}
          </button>
        </div>
      </div>
    </div>
  );
}
