// A person's full day, given any one session they're on. Real complaint: too
// many evaluators sign up for the convenient slot and skip the harder ones
// later the same day, and there was no way to check -- clicking a name in
// "Who's on this session" had to be enough to see their whole day right away,
// not just this one session/org's slice of it.
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageSessionAssignments } from "@/lib/authorize";

async function loadSession(scheduleId) {
  const [row] = await sql`
    SELECT es.id, es.scheduled_date, es.service_provider_id, ac.organization_id
    FROM evaluation_schedule es
    LEFT JOIN age_categories ac ON ac.id = es.age_category_id
    WHERE es.id = ${scheduleId}
  `;
  return row || null;
}
// SP-owned testing events have no association org -- governed by the SP itself.
function governingOrgId(s) { return s.organization_id || s.service_provider_id || null; }

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const scheduleId = parseInt(params.scheduleId);
    const userId = parseInt(new URL(request.url).searchParams.get("user_id"));
    if (!scheduleId || !userId) return NextResponse.json({ error: "scheduleId and user_id required" }, { status: 400 });

    const s = await loadSession(scheduleId);
    if (!s) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    // Same manage boundary as the roster modal itself -- if you can't manage
    // this session's assignments, you can't use it as a lever to look up
    // someone's whole day either.
    const orgId = governingOrgId(s);
    const manage = orgId ? await canManageSessionAssignments(session, orgId) : { authorized: false };
    if (!manage.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!s.scheduled_date) return NextResponse.json({ error: "This session has no date yet" }, { status: 400 });

    const [person] = await sql`SELECT name, email FROM users WHERE id = ${userId}`;
    if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Every active commitment this person has THAT DAY, evaluator or tester,
    // across every org -- deliberately not scoped to this session's org, since
    // the whole point is seeing whether they took the easy slot here and are
    // dodging a harder one somewhere else the same day.
    const sessions = await sql`
      SELECT sb.id, sb.start_time, sb.end_time, sb.location, sb.session_number, sb.group_number, r.role,
        COALESCE(acb.name, sb.client_label, sb.age_label, 'Testing') AS label,
        COALESCE(obassoc.name, obsp.name) AS org_name
      FROM (
        SELECT schedule_id, 'evaluator' AS role FROM evaluator_session_signups WHERE user_id = ${userId} AND status = 'signed_up'
        UNION ALL
        SELECT schedule_id, 'tester' AS role FROM tester_session_signups WHERE user_id = ${userId} AND status = 'signed_up'
      ) AS r
      JOIN evaluation_schedule sb ON sb.id = r.schedule_id
      LEFT JOIN age_categories acb ON acb.id = sb.age_category_id
      LEFT JOIN organizations obassoc ON obassoc.id = acb.organization_id
      LEFT JOIN organizations obsp ON obsp.id = sb.service_provider_id
      WHERE sb.scheduled_date = ${s.scheduled_date} AND sb.status != 'cancelled'
      ORDER BY sb.start_time NULLS LAST
    `;

    return NextResponse.json({
      user: { id: userId, name: person.name, email: person.email },
      date: s.scheduled_date,
      this_schedule_id: scheduleId,
      sessions,
    });
  } catch (error) {
    console.error("roster/day GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
