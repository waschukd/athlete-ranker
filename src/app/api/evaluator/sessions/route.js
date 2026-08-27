import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Isolation guard: a tester-only user (has active memberships, none with
    // evaluator capability) must never receive evaluation sessions. Admins/
    // directors with no membership are unaffected.
    const guardUid = await getAppUserId(session);
    if (guardUid) {
      const mems = await sql`SELECT is_evaluator FROM evaluator_memberships WHERE user_id = ${guardUid} AND status = 'active'`;
      if (mems.length > 0 && !mems.some(m => m.is_evaluator)) return NextResponse.json({ sessions: [] });
    }

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
          (es.closed_at IS NOT NULL) as closed,
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
          -- Per-schedule override wins over the session-type default, matching
          -- what the signup route actually enforces (a director can bump one
          -- game's count on the schedule row without cs ever changing).
          COALESCE(sch.evaluators_required, cs.evaluators_required, 4) as evaluators_required,
          COUNT(DISTINCT ess2.id) as evaluators_signed_up,
          (SELECT COUNT(DISTINCT csc.athlete_id) FROM category_scores csc
             WHERE csc.evaluator_id = ${appUserId}
               AND csc.age_category_id = ac.id
               AND csc.session_number = sch.session_number) as my_scored_athletes
        FROM evaluator_session_signups es
        JOIN evaluation_schedule sch ON sch.id = es.schedule_id
        JOIN age_categories ac ON ac.id = sch.age_category_id
        JOIN organizations o ON o.id = ac.organization_id
        LEFT JOIN category_sessions cs ON cs.age_category_id = ac.id AND cs.session_number = sch.session_number
        LEFT JOIN evaluator_session_signups ess2 ON ess2.schedule_id = sch.id AND ess2.status != 'cancelled'
        WHERE es.user_id = ${appUserId}
          -- es.status is the SIGN-UP's status. Cancelling a session sets the
          -- sign-up to 'released', which is not 'cancelled', so the row sailed
          -- through this filter and a cancelled session stayed on the
          -- evaluator's schedule -- they had no way to know not to show up.
          -- Filter the SESSION's status too, and drop released sign-ups.
          AND es.status NOT IN ('cancelled', 'released')
          AND sch.status <> 'cancelled'
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

      // A category_evaluators row (e.g. a coach tied to specific age groups)
      // restricts that org's sessions to only those categories, instead of the
      // whole org their membership would otherwise open up. Orgs where this
      // user has no such row are unaffected — full org visibility, as before.
      const catScopes = await sql`
        SELECT ce.age_category_id, ac2.organization_id
        FROM category_evaluators ce
        JOIN age_categories ac2 ON ac2.id = ce.age_category_id
        WHERE ce.user_id = ${appUId} AND ac2.organization_id = ANY(${orgIds})
      `;
      const scopedOrgIds = [...new Set(catScopes.map(r => r.organization_id))];
      const allowedCategoryIds = catScopes.map(r => r.age_category_id);
      const openOrgIds = orgIds.filter(id => !scopedOrgIds.includes(id));

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
          COALESCE(sch.evaluators_required, cs.evaluators_required, 4) as evaluators_required,
          -- Coach signups never fill (or block on) the official evaluator
          -- quota -- a coach is a parallel, comparison-only scoring track,
          -- excluded here so the count reflects real official staffing.
          COUNT(DISTINCT ess.id) FILTER (WHERE ce_coach.id IS NULL) as evaluators_signed_up,
          COALESCE(MAX(CASE WHEN ess.user_id = ${appUId} THEN 1 ELSE 0 END), 0) as already_signed_up,
          -- Overlaps another evaluation this user is already signed up for.
          EXISTS (
            SELECT 1 FROM evaluator_session_signups myev
            JOIN evaluation_schedule mysch ON mysch.id = myev.schedule_id
            WHERE myev.user_id = ${appUId} AND myev.status = 'signed_up' AND mysch.id <> sch.id
              AND mysch.scheduled_date = sch.scheduled_date
              AND mysch.start_time IS NOT NULL AND mysch.end_time IS NOT NULL
              AND sch.start_time < mysch.end_time AND mysch.start_time < sch.end_time
          ) AS busy_eval
        FROM evaluation_schedule sch
        JOIN age_categories ac ON ac.id = sch.age_category_id
        JOIN organizations o ON o.id = ac.organization_id
        LEFT JOIN category_sessions cs ON cs.age_category_id = ac.id AND cs.session_number = sch.session_number
        LEFT JOIN evaluator_session_signups ess ON ess.schedule_id = sch.id AND ess.status != 'cancelled'
        LEFT JOIN category_evaluators ce_coach ON ce_coach.age_category_id = sch.age_category_id
          AND ce_coach.user_id = ess.user_id AND ce_coach.kind = 'coach'
        WHERE (o.id = ANY(${openOrgIds}) OR ac.id = ANY(${allowedCategoryIds}))
          AND sch.scheduled_date >= CURRENT_DATE
          AND sch.status = 'scheduled'
          AND COALESCE(cs.session_type, '') != 'testing'
          -- Testing takes priority. Hide (not just flag) any evaluation that overlaps
          -- a testing session run by an SP this user tests for, so a tester can never
          -- see — let alone book — an evaluation on top of a testing obligation.
          AND NOT EXISTS (
            SELECT 1 FROM evaluation_schedule tes
            LEFT JOIN age_categories tac ON tac.id = tes.age_category_id
            LEFT JOIN category_sessions tcs ON tcs.age_category_id = tes.age_category_id AND tcs.session_number = tes.session_number
            WHERE tes.scheduled_date = sch.scheduled_date AND tes.status = 'scheduled'
              AND tes.start_time IS NOT NULL AND tes.end_time IS NOT NULL
              AND sch.start_time IS NOT NULL AND sch.end_time IS NOT NULL
              AND sch.start_time < tes.end_time AND tes.start_time < sch.end_time
              AND (
                tes.service_provider_id IN (SELECT organization_id FROM evaluator_memberships WHERE user_id = ${appUId} AND is_tester = true AND status = 'active')
                OR (tcs.session_type = 'testing' AND tac.organization_id IN (
                  SELECT sal.association_id FROM sp_association_links sal
                  JOIN evaluator_memberships em ON em.organization_id = sal.service_provider_id AND em.user_id = ${appUId} AND em.is_tester = true AND em.status = 'active'
                  WHERE sal.status = 'active'))
              )
          )
        GROUP BY sch.id, ac.id, o.id, cs.session_type, cs.name, cs.evaluators_required
        HAVING (
          COUNT(DISTINCT ess.id) FILTER (WHERE ce_coach.id IS NULL) < COALESCE(sch.evaluators_required, cs.evaluators_required, 4)
          -- A coach-scoped viewer sees every upcoming session in their own
          -- assigned category regardless of official staffing -- they aren't
          -- filling that quota, so a fully-staffed session must still show.
          OR ac.id = ANY(${allowedCategoryIds})
        )
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
