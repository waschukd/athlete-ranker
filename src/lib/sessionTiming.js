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

const dayOf = (s) => s?.scheduled_date?.toString().split("T")[0] || "";

/**
 * Pick what the evaluator dashboard's "Score Now" card should feature.
 *
 * The card is "do this next", so it has to ADVANCE through a night: close
 * session 1 and session 2 moves to the top with session 3 beneath it. Two
 * things stopped that:
 *
 *   - A closed session was still a candidate, so it stayed pinned in the card
 *     for the full 4h grace window and the later sessions never surfaced.
 *   - The list is evaluation sessions concatenated with testing sessions and is
 *     therefore NOT in time order, so "next" could be the 9pm game while the
 *     6pm one sat below it.
 *
 * @param {Array} upcoming  sessions not yet past (isSessionPast === false)
 * @param {string} todayStr today as YYYY-MM-DD in the viewer's local time
 * @param {number} limit    how many to feature
 * @returns {{shown: Array, isToday: boolean, todayTotal: number, todayDone: number}}
 */
export function pickScoreNow(upcoming, todayStr, limit = 2) {
  const list = Array.isArray(upcoming) ? upcoming : [];
  const open = list.filter(s => !s?.closed);

  const byStart = (a, b) =>
    dayOf(a).localeCompare(dayOf(b)) ||
    (a?.start_time || "").toString().localeCompare((b?.start_time || "").toString());

  let featured = open.filter(s => dayOf(s) === todayStr).sort(byStart);
  let isToday = true;

  if (featured.length === 0) {
    // Everything today is closed — look ahead to the soonest day with work left
    // rather than showing an empty card.
    const soonest = open.map(dayOf).filter(Boolean).sort()[0];
    if (!soonest) return { shown: [], isToday: false, todayTotal: 0, todayDone: 0 };
    featured = open.filter(s => dayOf(s) === soonest).sort(byStart);
    isToday = false;
  }

  const todayTotal = list.filter(s => dayOf(s) === todayStr).length;
  const todayOpen = open.filter(s => dayOf(s) === todayStr).length;
  return {
    shown: featured.slice(0, limit),
    isToday,
    todayTotal,
    todayDone: todayTotal - todayOpen,
  };
}
