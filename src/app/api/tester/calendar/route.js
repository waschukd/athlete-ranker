// Personal ICS feed for a tester — the testing sessions they're signed up for.
// Subscribe-by-URL (Google/Apple/Outlook) with an HMAC token in the query, since
// calendar apps don't send cookies. Same token as the evaluator feed (per-user).

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { verifyCalendarToken } from "@/lib/calendar-token";

function escapeICS(t) { return t == null ? "" : String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function pad(n, w = 2) { return String(n).padStart(w, "0"); }
function localDateTime(date, time) {
  const iso = (date instanceof Date ? date.toISOString() : String(date)).split("T")[0];
  const dStr = iso.replace(/-/g, "");
  const p = (time || "00:00").toString().split(":");
  return `${dStr}T${pad(p[0] || 0)}${pad(p[1] || 0)}${pad(p[2] || 0)}`;
}
function nowStampUTC() { const d = new Date(); return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z"; }
function fold(line) { if (line.length <= 75) return line; const out = []; let i = 0; while (i < line.length) { out.push(i === 0 ? line.slice(0, 75) : " " + line.slice(i, i + 74)); i += i === 0 ? 75 : 74; } return out.join("\r\n"); }

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = verifyCalendarToken(searchParams.get("token"));
  if (!userId) return new NextResponse("Invalid or missing token", { status: 401 });

  const sessions = await sql`
    SELECT es.id AS schedule_id, es.scheduled_date, es.start_time, es.end_time, es.location,
      es.session_number, es.group_number,
      COALESCE(ac.name, es.age_label, 'Testing') AS category_name,
      COALESCE(o.name, es.client_label, 'Testing') AS org_name
    FROM tester_session_signups tss
    JOIN evaluation_schedule es ON es.id = tss.schedule_id
    LEFT JOIN age_categories ac ON ac.id = es.age_category_id
    LEFT JOIN organizations o ON o.id = ac.organization_id
    WHERE tss.user_id = ${userId} AND tss.status = 'signed_up'
    ORDER BY es.scheduled_date, es.start_time`;

  const stamp = nowStampUTC();
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sideline Star//Tester Sessions//EN",
    "METHOD:PUBLISH", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Sideline Star Testing",
    "X-WR-CALDESC:Your testing sessions on Sideline Star", "X-WR-TIMEZONE:America/Edmonton",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    "BEGIN:VTIMEZONE", "TZID:America/Edmonton", "X-LIC-LOCATION:America/Edmonton",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0700", "TZOFFSETTO:-0600", "TZNAME:MDT",
    "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:-0600", "TZOFFSETTO:-0700", "TZNAME:MST",
    "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const s of sessions) {
    if (!s.scheduled_date) continue;
    const dtStart = localDateTime(s.scheduled_date, s.start_time);
    const dtEnd = localDateTime(s.scheduled_date, s.end_time || s.start_time);
    const summary = `Testing: ${s.org_name} ${s.category_name}`;
    const description = `${s.org_name} — ${s.category_name}\nTesting session`;
    lines.push("BEGIN:VEVENT");
    lines.push(fold(`UID:tester-${s.schedule_id}-${userId}@sidelinestar.com`));
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;TZID=America/Edmonton:${dtStart}`);
    lines.push(`DTEND;TZID=America/Edmonton:${dtEnd}`);
    lines.push(fold(`SUMMARY:${escapeICS(summary)}`));
    if (s.location) lines.push(fold(`LOCATION:${escapeICS(s.location)}`));
    lines.push(fold(`DESCRIPTION:${escapeICS(description)}`));
    lines.push("BEGIN:VALARM"); lines.push("ACTION:DISPLAY"); lines.push(fold(`DESCRIPTION:${escapeICS(summary)}`)); lines.push("TRIGGER:-PT30M"); lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  const isDownload = searchParams.get("download") === "1";
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="sidelinestar-testing.ics"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
