// ICS feed for one category's schedule (association + director view). Subscribe
// by URL; token in the query since calendar apps don't send cookies.

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { verifyScheduleToken } from "@/lib/calendar-token";

function escapeICS(t) { return t == null ? "" : String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function pad(n, w = 2) { return String(n).padStart(w, "0"); }
function localDateTime(date, time) { const iso = (date instanceof Date ? date.toISOString() : String(date)).split("T")[0]; const dStr = iso.replace(/-/g, ""); const p = (time || "00:00").toString().split(":"); return `${dStr}T${pad(p[0] || 0)}${pad(p[1] || 0)}${pad(p[2] || 0)}`; }
function nowStampUTC() { const d = new Date(); return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z"; }
function fold(line) { if (line.length <= 75) return line; const out = []; let i = 0; while (i < line.length) { out.push(i === 0 ? line.slice(0, 75) : " " + line.slice(i, i + 74)); i += i === 0 ? 75 : 74; } return out.join("\r\n"); }

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const catId = verifyScheduleToken(searchParams.get("token"));
  if (!catId) return new NextResponse("Invalid or missing token", { status: 401 });

  const info = await sql`SELECT ac.name AS category_name, o.name AS org_name FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id WHERE ac.id = ${catId} LIMIT 1`;
  if (!info.length) return new NextResponse("Not found", { status: 404 });
  const { category_name, org_name } = info[0];

  const sessions = await sql`
    SELECT id AS schedule_id, scheduled_date, start_time, end_time, location, session_number, group_number
    FROM evaluation_schedule WHERE age_category_id = ${catId} AND status != 'cancelled'
    ORDER BY scheduled_date, start_time`;

  const stamp = nowStampUTC();
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sideline Star//Category Schedule//EN",
    "METHOD:PUBLISH", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${escapeICS(`${org_name} — ${category_name}`)}`,
    "X-WR-TIMEZONE:America/Edmonton", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
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
    const grp = s.group_number ? ` · Group ${s.group_number}` : "";
    const summary = `${category_name} — S${s.session_number}${grp}`;
    lines.push("BEGIN:VEVENT");
    lines.push(fold(`UID:cat-${catId}-${s.schedule_id}@sidelinestar.com`));
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;TZID=America/Edmonton:${dtStart}`);
    lines.push(`DTEND;TZID=America/Edmonton:${dtEnd}`);
    lines.push(fold(`SUMMARY:${escapeICS(summary)}`));
    if (s.location) lines.push(fold(`LOCATION:${escapeICS(s.location)}`));
    lines.push(fold(`DESCRIPTION:${escapeICS(`${org_name} — ${category_name}\nSession ${s.session_number}${grp}`)}`));
    lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  const isDownload = searchParams.get("download") === "1";
  return new NextResponse(lines.join("\r\n"), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="sidelinestar-schedule.ics"`, "Cache-Control": "private, max-age=300" },
  });
}
