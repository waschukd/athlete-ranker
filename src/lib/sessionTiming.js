// A session stays "current" (visible as Today/upcoming, still cancellable, still
// featured for scoring) until GRACE_HOURS after its scheduled end -- long enough
// to walk back and finish up -- then rolls into Past. Previously this was a
// midnight cutoff (compared scheduled_date's calendar day only, ignoring time),
// which left a session sitting in "Today" for hours after it actually ended.
const GRACE_HOURS = 4;

// scheduled_date is a date-only value; start/end_time are separate "HH:MM:SS"
// wall-clock strings in the venue's local time, same as the rest of the app
// assumes (no explicit timezone conversion) -- so combining them with no "Z"
// suffix parses in the viewer's local time, matching how the venue and viewer
// are expected to share a timezone.
function sessionEndsAt(session) {
  const dateStr = session?.scheduled_date?.toString().split("T")[0];
  if (!dateStr) return null;
  const timeStr = (session.end_time || session.start_time || "23:59:59").toString();
  const endsAt = new Date(`${dateStr}T${timeStr}`);
  return isNaN(endsAt.getTime()) ? null : endsAt;
}

export function isSessionPast(session, graceHours = GRACE_HOURS) {
  const endsAt = sessionEndsAt(session);
  if (!endsAt) return false;
  return Date.now() >= endsAt.getTime() + graceHours * 60 * 60 * 1000;
}
