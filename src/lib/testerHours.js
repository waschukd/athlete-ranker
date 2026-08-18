import sql from "@/lib/db";

// Testers are paid by their SCHEDULE SPAN, not per session — the 15-minute ice
// floods between their back-to-back sessions are on-the-clock time. A tester's
// payable hours for a day = the span of each contiguous block of their signed-up
// sessions (first start → last end), where sessions split into separate blocks
// only when the gap between them exceeds BREAK_GAP_MIN (a genuine break, unpaid).
// (Evaluators are the opposite — paid per session, floods never paid — handled in
// evaluator/scores, not here.)
export const BREAK_GAP_MIN = 60;

const toMin = (t) => { if (!t) return null; const [h, m] = t.toString().split(":").map(Number); return h * 60 + (m || 0); };

// Given a day's sessions [{schedule_id, start, end (minutes)}] sorted by start,
// return { [schedule_id]: payable_hours }. Each session gets its own duration plus
// the flood gap to the next session IN THE SAME BLOCK — so the per-session hours
// sum to the block span, and a >BREAK_GAP_MIN gap contributes nothing (unpaid).
export function computeDayHours(sessions, breakGap = BREAK_GAP_MIN) {
  const rows = sessions
    .filter(s => s.start != null && s.end != null && s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const out = {};
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i];
    const next = rows[i + 1];
    let minutes = s.end - s.start;
    // Bridge the flood to the next session only if it's within the break threshold
    // AND the next session doesn't start before this one ends (no overlap double-pay).
    if (next && next.start >= s.end && next.start - s.end <= breakGap) {
      minutes += next.start - s.end;
    }
    out[s.schedule_id] = Math.round((minutes / 60) * 100) / 100;
  }
  return out;
}

// Recompute a tester's auto hours from their signed-up, PAST testing sessions and
// upsert them into evaluator_hours (pending). Never touches approved/paid rows.
// Clears pending rows for sessions they're no longer signed up to. Idempotent.
export async function recomputeTesterHours(userId) {
  if (!userId) return;
  // Past testing sessions the tester is signed up to, with the SP to bill:
  //   SP-owned testing event → es.service_provider_id; else the serving SP of the
  //   session's association. Only sessions with a resolvable SP + times count.
  const sessions = await sql`
    SELECT es.id AS schedule_id, es.scheduled_date, es.start_time, es.end_time,
      COALESCE(es.service_provider_id, (
        SELECT sal.service_provider_id FROM sp_association_links sal
        JOIN age_categories ac ON ac.organization_id = sal.association_id
        WHERE ac.id = es.age_category_id AND sal.status = 'active' LIMIT 1
      )) AS org_id
    FROM tester_session_signups tss
    JOIN evaluation_schedule es ON es.id = tss.schedule_id
    WHERE tss.user_id = ${userId} AND tss.status = 'signed_up'
      AND es.scheduled_date < CURRENT_DATE
      AND es.start_time IS NOT NULL AND es.end_time IS NOT NULL`;

  // Group by (org, day) — spans are per-day, per-SP.
  const groups = new Map();
  for (const s of sessions) {
    if (!s.org_id) continue;
    const day = s.scheduled_date?.toString().split("T")[0];
    const key = `${s.org_id}|${day}`;
    if (!groups.has(key)) groups.set(key, { org_id: s.org_id, day, rows: [] });
    groups.get(key).rows.push({ schedule_id: s.schedule_id, start: toMin(s.start_time), end: toMin(s.end_time) });
  }

  // Each upsert targets a distinct schedule_id (the ON CONFLICT key), so none of
  // these can race each other -- safe to fire concurrently instead of one round
  // trip per session.
  const keepIds = new Set();
  const upserts = [];
  for (const { org_id, day, rows } of groups.values()) {
    const hoursBy = computeDayHours(rows);
    for (const [sid, hrs] of Object.entries(hoursBy)) {
      keepIds.add(Number(sid));
      if (!(hrs > 0)) continue;
      // Upsert as pending, but don't disturb an already approved/paid entry.
      upserts.push(sql`
        INSERT INTO evaluator_hours (evaluator_id, organization_id, schedule_id, session_date, hours_worked, status, source)
        VALUES (${userId}, ${org_id}, ${Number(sid)}, ${day}, ${hrs}, 'pending', 'tester_auto')
        ON CONFLICT (evaluator_id, schedule_id) DO UPDATE
          SET hours_worked = ${hrs}, organization_id = ${org_id}, session_date = ${day}
          WHERE evaluator_hours.status = 'pending'`);
    }
  }
  await Promise.all(upserts);

  // Drop stale auto pending rows for testing sessions no longer signed up.
  const keep = [...keepIds];
  if (keep.length) {
    await sql`DELETE FROM evaluator_hours WHERE evaluator_id = ${userId} AND status = 'pending' AND source = 'tester_auto' AND schedule_id <> ALL(${keep})`;
  } else {
    await sql`DELETE FROM evaluator_hours WHERE evaluator_id = ${userId} AND status = 'pending' AND source = 'tester_auto'`;
  }
}
