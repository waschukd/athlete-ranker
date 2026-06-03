// Personal ICS feed for an evaluator.
//
// Calendar apps (Google Calendar, Apple Calendar, Outlook) subscribe to a
// URL like:
//   https://sidelinestar.com/api/evaluator/calendar?token=USERID.SIG
//
// They re-fetch periodically (Google ~24h, Apple ~15min-hours), so any
// new signups, cancellations, or schedule changes propagate automatically
// without the user lifting a finger.
//
// Auth: HMAC-signed token in the query string. Cookies don't get sent by
// calendar apps, so we can't use the regular session. The token is derived
// deterministically from the user id, so each user has a stable URL they
// only need to subscribe to once. Rotating AUTH_SECRET invalidates all
// existing calendar tokens (intentional kill-switch).

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { verifyCalendarToken } from "@/lib/calendar-token";

function escapeICS(text) {
  if (text == null) return "";
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function pad(n, w = 2) {
  return String(n).padStart(w, "0");
}

// Build a "20260502T090000" style local datetime string from a date and time
function localDateTime(date, time) {
  const dStr = date.toString().split("T")[0].replace(/-/g, "");
  const parts = (time || "00:00").toString().split(":");
  const hh = pad(parts[0] || 0);
  const mm = pad(parts[1] || 0);
  const ss = pad(parts[2] || 0);
  return `${dStr}T${hh}${mm}${ss}`;
}

// UTC timestamp for DTSTAMP — must be in Zulu form
function nowStampUTC() {
  const d = new Date();
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

// Fold lines to 75 octets per RFC 5545. Most clients are forgiving but
// Outlook is not. Cheap to do, may as well do it right.
function fold(line) {
  if (line.length <= 75) return line;
  const out = [];
  let i = 0;
  while (i < line.length) {
    const chunk = i === 0 ? line.slice(0, 75) : " " + line.slice(i, i + 74);
    out.push(chunk);
    i += i === 0 ? 75 : 74;
  }
  return out.join("\r\n");
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = verifyCalendarToken(searchParams.get("token"));
  if (!userId) {
    return new NextResponse("Invalid or missing token", { status: 401 });
  }

  const sessions = await sql`
    SELECT
      sch.id              AS schedule_id,
      sch.scheduled_date,
      sch.start_time,
      sch.end_time,
      sch.location,
      sch.session_number,
      sch.group_number,
      ac.name             AS category_name,
      o.name              AS org_name
    FROM evaluator_session_signups es
    JOIN evaluation_schedule sch ON sch.id = es.schedule_id
    JOIN age_categories ac       ON ac.id  = sch.age_category_id
    JOIN organizations o         ON o.id   = ac.organization_id
    WHERE es.user_id = ${userId}
      AND es.status != 'cancelled'
    ORDER BY sch.scheduled_date, sch.start_time
  `;

  const stamp = nowStampUTC();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sideline Star//Evaluator Sessions//EN",
    "METHOD:PUBLISH",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Sideline Star Sessions",
    "X-WR-CALDESC:Your evaluator sessions on Sideline Star",
    "X-WR-TIMEZONE:America/Edmonton",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    // VTIMEZONE for America/Edmonton (Mountain Time). Without this, strict
    // importers that see DTSTART;TZID=America/Edmonton with no matching
    // VTIMEZONE definition can silently drop the events.
    "BEGIN:VTIMEZONE",
    "TZID:America/Edmonton",
    "X-LIC-LOCATION:America/Edmonton",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0700",
    "TZOFFSETTO:-0600",
    "TZNAME:MDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0600",
    "TZOFFSETTO:-0700",
    "TZNAME:MST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const s of sessions) {
    const dtStart = localDateTime(s.scheduled_date, s.start_time);
    const dtEnd = localDateTime(s.scheduled_date, s.end_time || s.start_time);
    const summary = `Eval: ${s.org_name} ${s.category_name} S${s.session_number}G${s.group_number}`;
    const description = `${s.org_name} ${s.category_name}\nSession ${s.session_number}, Group ${s.group_number}\n\nView in app: https://sidelinestar.com/evaluator/score/${s.schedule_id}`;

    lines.push("BEGIN:VEVENT");
    lines.push(fold(`UID:signup-${s.schedule_id}-${userId}@sidelinestar.com`));
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;TZID=America/Edmonton:${dtStart}`);
    lines.push(`DTEND;TZID=America/Edmonton:${dtEnd}`);
    lines.push(fold(`SUMMARY:${escapeICS(summary)}`));
    if (s.location) lines.push(fold(`LOCATION:${escapeICS(s.location)}`));
    lines.push(fold(`DESCRIPTION:${escapeICS(description)}`));
    // Pop a 30-min reminder by default. Users can mute per-event in their app.
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push(fold(`DESCRIPTION:${escapeICS(summary)}`));
    lines.push("TRIGGER:-PT30M");
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  // download=1 forces a file download (attachment) instead of inline. Opening
  // the downloaded .ics imports every event immediately on Android/iOS/desktop,
  // bypassing Google's slow (~hours) subscribe-and-first-sync path.
  const isDownload = searchParams.get("download") === "1";
  const disposition = isDownload
    ? 'attachment; filename="sidelinestar-sessions.ics"'
    : 'inline; filename="sidelinestar-sessions.ics"';

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": disposition,
      // Calendar apps cache aggressively. 5min cache is enough to take a
      // little load off the DB without making changes feel stale.
      "Cache-Control": "private, max-age=300",
    },
  });
}

