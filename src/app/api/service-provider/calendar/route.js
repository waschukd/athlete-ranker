// Master-schedule ICS feed for a service provider.
//
// A subscribe-by-URL calendar the SP pastes into Google/Apple/Outlook once:
//   https://www.sidelinestar.com/api/service-provider/calendar?token=ORGID.SIG
// Calendar apps re-fetch periodically, so schedule changes propagate on their
// own. Auth is an HMAC token in the query string (cookies aren't sent by
// calendar apps) scoped to the SP org — see calendar-token.js. isGoalie is
// derived from the org type here (no session), so a goalie SP's feed shows only
// goalie-relevant slots, exactly like its dashboard.

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { verifySpCalendarToken } from "@/lib/calendar-token";

function escapeICS(text) {
  if (text == null) return "";
  return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function pad(n, w = 2) { return String(n).padStart(w, "0"); }
function localDateTime(date, time) {
  const iso = (date instanceof Date ? date.toISOString() : String(date)).split("T")[0];
  const dStr = iso.replace(/-/g, "");
  const parts = (time || "00:00").toString().split(":");
  return `${dStr}T${pad(parts[0] || 0)}${pad(parts[1] || 0)}${pad(parts[2] || 0)}`;
}
function nowStampUTC() {
  const d = new Date();
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
}
function fold(line) {
  if (line.length <= 75) return line;
  const out = []; let i = 0;
  while (i < line.length) { out.push(i === 0 ? line.slice(0, 75) : " " + line.slice(i, i + 74)); i += i === 0 ? 75 : 74; }
  return out.join("\r\n");
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const spId = verifySpCalendarToken(searchParams.get("token"));
  if (!spId) return new NextResponse("Invalid or missing token", { status: 401 });

  const spRows = await sql`SELECT name, type FROM organizations WHERE id = ${spId} LIMIT 1`;
  if (!spRows.length) return new NextResponse("Not found", { status: 404 });
  const isGoalie = spRows[0].type === "goalie_service_provider";
  const spName = spRows[0].name || "Sideline Star";

  // Sessions across the SP's active client associations (goalie-isolated for a
  // goalie SP: only goalie-skills groups + non-testing groups show).
  const sessions = await sql`
    SELECT es.id AS schedule_id, es.scheduled_date, es.start_time, es.end_time, es.location,
           es.session_number, es.group_number,
           ac.name AS category_name, o.name AS org_name, cs.session_type
    FROM sp_association_links sal
    JOIN organizations o ON o.id = sal.association_id
    JOIN age_categories ac ON ac.organization_id = o.id
    JOIN evaluation_schedule es ON es.age_category_id = ac.id
    LEFT JOIN category_sessions cs ON cs.age_category_id = ac.id AND cs.session_number = es.session_number
    WHERE sal.service_provider_id = ${spId} AND sal.status = 'active'
      AND es.status != 'cancelled'
      AND (NOT ${isGoalie}::boolean
           OR COALESCE(es.goalie_evaluators_required, 0) > 0
           OR COALESCE(cs.session_type, '') <> 'testing')
      AND (${isGoalie}::boolean OR COALESCE(cs.session_type, '') <> 'goalie_skills')
    ORDER BY es.scheduled_date, es.start_time`;

  // SP-owned testing sessions (testing-only clients, no association).
  const spEvents = await sql`
    SELECT es.id AS schedule_id, es.scheduled_date, es.start_time, es.end_time, es.location,
           es.session_number, es.group_number,
           COALESCE(es.age_label, 'Testing') AS category_name,
           COALESCE(es.client_label, 'Testing') AS org_name, 'testing' AS session_type
    FROM evaluation_schedule es
    WHERE es.service_provider_id = ${spId} AND es.status != 'cancelled'
    ORDER BY es.scheduled_date, es.start_time`;

  const all = [...sessions, ...spEvents];
  const stamp = nowStampUTC();
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sideline Star//SP Master Schedule//EN",
    "METHOD:PUBLISH", "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeICS(spName)} — Master Schedule`,
    "X-WR-CALDESC:Every session across your client associations", "X-WR-TIMEZONE:America/Edmonton",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    "BEGIN:VTIMEZONE", "TZID:America/Edmonton", "X-LIC-LOCATION:America/Edmonton",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0700", "TZOFFSETTO:-0600", "TZNAME:MDT",
    "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:-0600", "TZOFFSETTO:-0700", "TZNAME:MST",
    "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const s of all) {
    if (!s.scheduled_date) continue;
    const dtStart = localDateTime(s.scheduled_date, s.start_time);
    const dtEnd = localDateTime(s.scheduled_date, s.end_time || s.start_time);
    const typeLabel = s.session_type ? ` (${s.session_type})` : "";
    const summary = `${s.org_name} — ${s.category_name}${typeLabel}`;
    const grp = s.group_number ? ` · Group ${s.group_number}` : "";
    const description = `${s.org_name}\n${s.category_name}${typeLabel}\nSession ${s.session_number}${grp}`;
    lines.push("BEGIN:VEVENT");
    lines.push(fold(`UID:sp-${spId}-${s.schedule_id}@sidelinestar.com`));
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;TZID=America/Edmonton:${dtStart}`);
    lines.push(`DTEND;TZID=America/Edmonton:${dtEnd}`);
    lines.push(fold(`SUMMARY:${escapeICS(summary)}`));
    if (s.location) lines.push(fold(`LOCATION:${escapeICS(s.location)}`));
    lines.push(fold(`DESCRIPTION:${escapeICS(description)}`));
    lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  const isDownload = searchParams.get("download") === "1";
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="sidelinestar-master-schedule.ics"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
