import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "mine"; // 'mine' or 'available'

    if (view === "mine") {
      // Get app user id from email
      const appUserResult = await sql`SELECT id FROM users WHERE email = ${session.email}`;
      const appUserId = appUserResult[0]?.id;
      if (!appUserId) return NextResponse.json({ sessions: [] });

      // Sessions this evaluator is signed up for
      const sessions = await sql`
        SELECT 
          es.id as signup_id,
          es.status as signup_status,
          es.created_at as signed_up_at,
          es.calendar_exported,
          sch.id as schedule_id,
          sch.scheduled_date,
          sch.day_of_week,
          sch.start_time,
          sch.end_time,
          sch.location,
          sch.session_number,
          sch.group_number,
          ac.id as category_id,
          ac.name as category_name,
          o.id as org_id,
          o.name as org_name,
          cs.session_type,
          cs.name as session_name,
          cs.evaluators_required,
          COUNT(DISTINCT ess2.id) as evaluators_signed_up
        FROM evaluator_session_signups es
        JOIN evaluation_schedule sch ON sch.id = es.schedule_id
        JOIN age_categories ac ON ac.id = sch.age_category_id
        JOIN organizations o ON o.id = ac.organization_id
        LEFT JOIN category_sessions cs ON cs.age_category_id = ac.id AND cs.session_number = sch.session_number
        LEFT JOIN evaluator_session_signups ess2 ON ess2.schedule_id = sch.id AND ess2.status != 'cancelled'
        WHERE es.user_id = ${appUserId}
          AND es.status != 'cancelled'
        GROUP BY es.id, sch.id, ac.id, o.id, cs.session_type, cs.name, cs.evaluators_required
        ORDER BY sch.scheduled_date, sch.start_time
      `;
      return NextResponse.json({ sessions });
    }

    if (view === "available") {
      // Get app user id from email
      const appUserRes = await sql`SELECT id FROM users WHERE email = ${session.email}`;
      const appUId = appUserRes[0]?.id;
      if (!appUId) return NextResponse.json({ sessions: [] });

      // Get orgs this evaluator belongs to directly
      const memberships = await sql`
        SELECT organization_id FROM evaluator_memberships 
        WHERE user_id = ${appUId} AND status = 'active'
      `;

      // Also get associations through service provider membership
      const spLinks = await sql`
        SELECT spal.association_id as organization_id
        FROM sp_association_links spal
        JOIN evaluator_memberships em ON em.organization_id = spal.service_provider_id
        WHERE em.user_id = ${appUId} AND em.status = 'active' AND spal.status = 'active'
      `;

      const orgIds = [...new Set([
        ...memberships.map(m => m.organization_id),
        ...spLinks.map(s => s.organization_id),
      ])];

      if (!orgIds.length) return NextResponse.json({ sessions: [] });

      // Available sessions that still need evaluators
      const sessions = await sql`
        SELECT 
          sch.id as schedule_id,
          sch.scheduled_date,
          sch.day_of_week,
          sch.start_time,
          sch.end_time,
          sch.location,
          sch.session_number,
          sch.group_number,
          ac.id as category_id,
          ac.name as category_name,
          o.id as org_id,
          o.name as org_name,
          cs.session_type,
          cs.name as session_name,
          COALESCE(cs.evaluators_required, ac.evaluators_required, 4) as evaluators_required,
          COUNT(DISTINCT ess.id) as evaluators_signed_up,
          COALESCE(MAX(CASE WHEN ess.user_id = ${appUId} THEN 1 ELSE 0 END), 0) as already_signed_up
        FROM evaluation_schedule sch
        JOIN age_categories ac ON ac.id = sch.age_category_id
        JOIN organizations o ON o.id = ac.organization_id
        LEFT JOIN category_sessions cs ON cs.age_category_id = ac.id AND cs.session_number = sch.session_number
        LEFT JOIN evaluator_session_signups ess ON ess.schedule_id = sch.id AND ess.status != 'cancelled'
        WHERE o.id = ANY(${orgIds})
          AND sch.scheduled_date >= CURRENT_DATE
          AND sch.status = 'scheduled'
          AND COALESCE(cs.session_type, '') != 'testing'
        GROUP BY sch.id, ac.id, o.id, cs.session_type, cs.name, cs.evaluators_required, ac.evaluators_required
        HAVING COUNT(DISTINCT ess.id) < COALESCE(cs.evaluators_required, ac.evaluators_required, 4)
          AND COALESCE(MAX(CASE WHEN ess.user_id = ${appUId} THEN 1 ELSE 0 END), 0) = 0
        ORDER BY sch.scheduled_date, sch.start_time
      `;
      return NextResponse.json({ sessions });
    }

    return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  } catch (error) {
    console.error("Evaluator sessions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
