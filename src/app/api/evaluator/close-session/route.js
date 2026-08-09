import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";
import { resolveEvaluatorKind } from "@/lib/categoryEvaluators";

// Deliberate "Save & Close" for an evaluator's session. Server-authoritative:
// every checked-in athlete of the evaluator's KIND must be either scored by
// them or excused ("absent"/"injured"). If any remain, returns need_marking so
// the client can prompt; only when all are covered does it set closed_at (the
// per-evaluator lock). Accidentally leaving mid-eval never calls this.
const VALID_REASONS = new Set(["absent", "injured"]);

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const appUserId = await getAppUserId(session);
    if (!appUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { schedule_id, excusals = [] } = await request.json();
    if (!schedule_id) return NextResponse.json({ error: "schedule_id required" }, { status: 400 });

    const [sched] = await sql`
      SELECT es.age_category_id, es.session_number
      FROM evaluation_schedule es WHERE es.id = ${schedule_id}`;
    if (!sched) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const [signup] = await sql`
      SELECT id FROM evaluator_session_signups WHERE schedule_id = ${schedule_id} AND user_id = ${appUserId}`;
    if (!signup) return NextResponse.json({ error: "You're not signed up for this session." }, { status: 403 });

    const catId = sched.age_category_id;
    const kind = await resolveEvaluatorKind(catId, appUserId, session.email);
    const goalieKind = kind === "goalie";

    // Checked-in athletes of this evaluator's kind.
    const checkedIn = await sql`
      SELECT a.id, a.first_name, a.last_name, a.position
      FROM player_checkins pc JOIN athletes a ON a.id = pc.athlete_id
      WHERE pc.schedule_id = ${schedule_id} AND pc.checked_in = true`;
    const mine = checkedIn.filter(a => goalieKind
      ? (a.position || "").toLowerCase() === "goalie"
      : (a.position || "").toLowerCase() !== "goalie");

    // Persist any excusals the client submitted (reason validated).
    for (const e of (excusals || [])) {
      const aid = parseInt(e.athlete_id);
      const reason = String(e.reason || "").toLowerCase();
      if (!aid || !VALID_REASONS.has(reason)) continue;
      await sql`
        INSERT INTO session_excusals (schedule_id, evaluator_id, athlete_id, reason)
        VALUES (${schedule_id}, ${appUserId}, ${aid}, ${reason})
        ON CONFLICT (schedule_id, evaluator_id, athlete_id) DO UPDATE SET reason = EXCLUDED.reason`;
    }

    const scoredRows = await sql`
      SELECT DISTINCT athlete_id FROM category_scores
      WHERE age_category_id = ${catId} AND session_number = ${sched.session_number} AND evaluator_id = ${appUserId}`;
    const scored = new Set(scoredRows.map(r => r.athlete_id));
    const excusedRows = await sql`
      SELECT athlete_id FROM session_excusals WHERE schedule_id = ${schedule_id} AND evaluator_id = ${appUserId}`;
    const excused = new Set(excusedRows.map(r => r.athlete_id));

    const needMarking = mine.filter(a => !scored.has(a.id) && !excused.has(a.id))
      .map(a => ({ athlete_id: a.id, name: `${a.first_name} ${a.last_name}`, position: a.position || null }));

    if (needMarking.length > 0) {
      return NextResponse.json({ need_marking: needMarking });
    }

    await sql`UPDATE evaluator_session_signups SET closed_at = NOW(), closed_by = ${appUserId} WHERE id = ${signup.id}`;
    try {
      await sql`INSERT INTO audit_log (age_category_id, user_id, action, entity_type, entity_id, new_value)
        VALUES (${catId}, ${appUserId}, 'evaluator_close_session', 'schedule', ${schedule_id}, ${JSON.stringify({ excused: [...excused] })})`;
    } catch { /* audit best-effort */ }

    return NextResponse.json({ success: true, closed: true });
  } catch (error) {
    console.error("close-session error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
