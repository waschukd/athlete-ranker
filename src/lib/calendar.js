/**
 * Generate .ics calendar file content for evaluation sessions.
 * Works with Google Calendar, Outlook, Apple Calendar — any calendar app.
 *
 * @param {Object|Object[]} sessions - Single session or array of sessions
 * @param {string} sessions.scheduled_date - ISO date string
 * @param {string} sessions.start_time - "HH:MM" format
 * @param {string} sessions.end_time - "HH:MM" format
 * @param {string} sessions.location - Venue name
 * @param {number} sessions.session_number - Session number
 * @param {number} sessions.group_number - Group number
 * @param {string} sessions.category_name - Age category name
 * @param {string} sessions.org_name - Organization name
 * @param {string} [sessions.session_type] - "skills", "scrimmage", "testing"
 * @param {string} [sessions.checkin_code] - Check-in code
 * @returns {string} .ics file content
 */
// Sessions run on the association's wall clock, and our date/time columns carry
// no zone, so a calendar link must state the zone rather than let the recipient's
// device guess.
const DEFAULT_TZ = "America/Edmonton";

// A scheduled_date is a calendar day, not an instant — "2026-09-06" means that
// Sunday regardless of where the server sits. Never round-trip it through local
// time: `new Date("2026-09-06")` is UTC midnight, and reading it back with
// .getDate() on any negative-offset host rolls it to the 5th. A string is sliced
// as text; a Date (what the pg driver hands back) is read in UTC, which is where
// the driver put midnight.
function toYmd(v) {
  if (!v) return null;
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}${m[2]}${m[3]}` : null;
  }
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

// "Add to calendar" link for a single session.
//
// Why a link and not an .ics attachment for parent mail: Gmail parses a
// text/calendar attachment and injects its OWN bulky event card ABOVE the
// message — outside our HTML, unmovable, and it buries the association's
// branding. A plain link keeps our email first and puts the calendar action
// where we choose. Staff mail still attaches a real .ics via generateICS.
export function googleCalendarUrl({ scheduled_date, start_time, end_time, title, location, details, timezone = DEFAULT_TZ }) {
  if (!scheduled_date || !start_time) return null;
  const ymd = toYmd(scheduled_date);
  if (!ymd) return null;
  const hhmm = (t) => {
    const [h, m] = String(t).split(":").map(Number);
    return `${String(h).padStart(2, "0")}${String(m || 0).padStart(2, "0")}00`;
  };
  const start = `${ymd}T${hhmm(start_time)}`;
  const end = `${ymd}T${hhmm(end_time || start_time)}`;
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: title || "Evaluation session",
    dates: `${start}/${end}`,
    ctz: timezone,
  });
  if (location) q.set("location", location);
  if (details) q.set("details", details);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

// group_number is OPTIONAL and shows up in the event title ("— S1 G2") and
// description. Staff invites (evaluator signup) want it — they need to know which
// group they're covering. Parent-facing invites must NOT pass it: parents read a
// group as a skill tier and start comparing mid-process. Omit the field and it
// disappears from both. Watch for `{...row}` spreads — that's how it leaks.
export function generateICS(sessions) {
  const events = Array.isArray(sessions) ? sessions : [sessions];

  // Same rule as the calendar link: a scheduled_date is a calendar day, not an
  // instant. Reading `new Date("2026-09-06")` back with .getDate() on a
  // negative-offset host yields the 5th, so an evaluator on a Mountain-time box
  // would get an invite dated a day early. Vercel is UTC, so this was right by
  // luck rather than design.
  const formatDate = (dateStr, time) => {
    const ymd = toYmd(dateStr);
    if (!ymd) return null;
    const [h, m] = (time || "00:00").split(":").map(Number);
    return `${ymd}T${String(h).padStart(2, "0")}${String(m || 0).padStart(2, "0")}00`;
  };

  const escapeText = (text) => (text || "").replace(/[,;\\]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

  const veventBlocks = events
    .filter((s) => s.scheduled_date && s.start_time)
    .map((s) => {
      const summary = `${s.category_name || "Evaluation"} — S${s.session_number}${s.group_number ? ` G${s.group_number}` : ""}`;
      const description = [
        s.org_name ? `Organization: ${s.org_name}` : "",
        s.session_type ? `Type: ${s.session_type}` : "",
        `Session ${s.session_number}${s.group_number ? `, Group ${s.group_number}` : ""}`,
        s.checkin_code ? `Check-in Code: ${s.checkin_code}` : "",
        "",
        "Powered by Sideline Star — sidelinestar.com",
      ]
        .filter(Boolean)
        .join("\\n");

      const uid = `ss-${s.id || Date.now()}-${s.session_number}-${s.group_number || 0}@sidelinestar.com`;

      return [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTART:${formatDate(s.scheduled_date, s.start_time)}`,
        `DTEND:${formatDate(s.scheduled_date, s.end_time || s.start_time)}`,
        `SUMMARY:${escapeText(summary)}`,
        s.location ? `LOCATION:${escapeText(s.location)}` : "",
        `DESCRIPTION:${description}`,
        `STATUS:CONFIRMED`,
        "END:VEVENT",
      ]
        .filter(Boolean)
        .join("\r\n");
    });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sideline Star//sidelinestar.com//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Sideline Star Sessions",
    ...veventBlocks,
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * Trigger .ics file download in the browser.
 * @param {string} icsContent - The .ics file content from generateICS()
 * @param {string} [filename] - Download filename (default: "sideline-star-sessions.ics")
 */
export function downloadICS(icsContent, filename = "sideline-star-sessions.ics") {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url;
  el.download = filename;
  document.body.appendChild(el);
  el.click();
  document.body.removeChild(el);
  URL.revokeObjectURL(url);
}
