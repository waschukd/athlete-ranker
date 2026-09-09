// Given a session and someone about to be added to it, find the LATER
// sessions that day, same category/rink (or same SP-owned testing event's own
// client if it has no category), they aren't already on -- so adding them
// once can offer "put them in the rest of the block too" instead of repeating
// Add per group.
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageSessionAssignments } from "@/lib/authorize";

async function loadSession(scheduleId) {
  const [row] = await sql`
    SELECT es.id, es.age_category_id, es.service_provider_id, es.scheduled_date,
      es.start_time, es.location, ac.organization_id
    FROM evaluation_schedule es
    LEFT JOIN age_categories ac ON ac.id = es.age_category_id
    WHERE es.id = ${scheduleId}
  `;
  return row || null;
}
function governingOrgId(s) { return s.organization_id || s.service_provider_id || null; }

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const scheduleId = parseInt(params.scheduleId);
    const { searchParams } = new URL(request.url);
    const userId = parseInt(searchParams.get("user_id"));
    const kind = searchParams.get("kind") === "tester" ? "tester" : "evaluator";
    if (!scheduleId || !userId) return NextResponse.json({ error: "scheduleId and user_id required" }, { status: 400 });

    const s = await loadSession(scheduleId);
    if (!s) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const orgId = governingOrgId(s);
    const manage = orgId ? await canManageSessionAssignments(session, orgId) : { authorized: false };
    if (!manage.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!s.scheduled_date || !s.start_time || !s.location) return NextResponse.json({ sessions: [] });

    // Later that day, same rink, same category (or the same SP-owned event's
    // client if it has no category) -- never a different org's session that
    // just happens to share a rink, since that isn't "the rest of this block."
    let rows;
    if (kind === "evaluator") {
      rows = s.age_category_id
        ? await sql`
            SELECT es.id, es.session_number, es.group_number, es.start_time, es.end_time, es.location,
              COALESCE(es.evaluators_required, 4) AS required,
              COUNT(DISTINCT ess.id) FILTER (WHERE ess.status = 'signed_up') AS filled
            FROM evaluation_schedule es
            LEFT JOIN evaluator_session_signups ess ON ess.schedule_id = es.id
            WHERE es.age_category_id = ${s.age_category_id}
              AND es.scheduled_date = ${s.scheduled_date} AND es.location = ${s.location}
              AND es.start_time > ${s.start_time} AND es.status != 'cancelled'
              AND es.id NOT IN (SELECT schedule_id FROM evaluator_session_signups WHERE user_id = ${userId} AND status = 'signed_up')
            GROUP BY es.id
            ORDER BY es.start_time`
        : await sql`
            SELECT es.id, es.session_number, es.group_number, es.start_time, es.end_time, es.location,
              COALESCE(es.evaluators_required, 4) AS required,
              COUNT(DISTINCT ess.id) FILTER (WHERE ess.status = 'signed_up') AS filled
            FROM evaluation_schedule es
            LEFT JOIN evaluator_session_signups ess ON ess.schedule_id = es.id
            WHERE es.service_provider_id = ${s.service_provider_id}
              AND es.scheduled_date = ${s.scheduled_date} AND es.location = ${s.location}
              AND es.start_time > ${s.start_time} AND es.status != 'cancelled'
              AND es.id NOT IN (SELECT schedule_id FROM evaluator_session_signups WHERE user_id = ${userId} AND status = 'signed_up')
            GROUP BY es.id
            ORDER BY es.start_time`;
    } else {
      rows = s.age_category_id
        ? await sql`
            SELECT es.id, es.session_number, es.group_number, es.start_time, es.end_time, es.location,
              COALESCE(es.testers_required, 0) AS required,
              COUNT(DISTINCT tss.id) FILTER (WHERE tss.status = 'signed_up') AS filled
            FROM evaluation_schedule es
            LEFT JOIN tester_session_signups tss ON tss.schedule_id = es.id
            WHERE es.age_category_id = ${s.age_category_id}
              AND es.scheduled_date = ${s.scheduled_date} AND es.location = ${s.location}
              AND es.start_time > ${s.start_time} AND es.status != 'cancelled'
              AND es.id NOT IN (SELECT schedule_id FROM tester_session_signups WHERE user_id = ${userId} AND status = 'signed_up')
            GROUP BY es.id
            ORDER BY es.start_time`
        : await sql`
            SELECT es.id, es.session_number, es.group_number, es.start_time, es.end_time, es.location,
              COALESCE(es.testers_required, 0) AS required,
              COUNT(DISTINCT tss.id) FILTER (WHERE tss.status = 'signed_up') AS filled
            FROM evaluation_schedule es
            LEFT JOIN tester_session_signups tss ON tss.schedule_id = es.id
            WHERE es.service_provider_id = ${s.service_provider_id}
              AND es.scheduled_date = ${s.scheduled_date} AND es.location = ${s.location}
              AND es.start_time > ${s.start_time} AND es.status != 'cancelled'
              AND es.id NOT IN (SELECT schedule_id FROM tester_session_signups WHERE user_id = ${userId} AND status = 'signed_up')
            GROUP BY es.id
            ORDER BY es.start_time`;
    }

    return NextResponse.json({
      sessions: rows.map(r => ({
        schedule_id: r.id, session_number: r.session_number, group_number: r.group_number,
        start_time: r.start_time, end_time: r.end_time, location: r.location,
        spots_open: Math.max(0, r.required - Number(r.filled)),
      })),
    });
  } catch (error) {
    console.error("roster/subsequent GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
