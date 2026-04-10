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
export function generateICS(sessions) {
  const events = Array.isArray(sessions) ? sessions : [sessions];

  const formatDate = (dateStr, time) => {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const [h, m] = (time || "00:00").split(":").map(Number);
    return `${year}${month}${day}T${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}00`;
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
