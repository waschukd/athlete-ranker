import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { emailWeeklyStaffingReport, emailDailyStaffingAlert, emailOpenSessionsBlast } from "@/lib/email";

async function getOrgId(session) {
  // Try evaluator_memberships first, then org contact_email
  const byMembership = await sql`
    SELECT em.organization_id FROM evaluator_memberships em
    JOIN users u ON u.id = em.user_id
    WHERE u.email = ${session.email} AND u.role IN ('sp_admin','association_admin')
    LIMIT 1
  `;
  if (byMembership.length) return byMembership[0].organization_id;
  
  const byContact = await sql`
    SELECT id as organization_id FROM organizations WHERE contact_email = ${session.email} LIMIT 1
  `;
  return byContact[0]?.organization_id;
}

async function getSessionStaffing(orgId, daysAhead = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);

  const sessions = await sql`
    SELECT 
      es.id, es.session_number, es.group_number, es.scheduled_date,
      es.start_time, es.end_time, es.location,
      ac.name as category_name, ac.evaluators_required,
      o.name as org_name,
      COUNT(DISTINCT ess.user_id) FILTER (WHERE ess.status = 'signed_up' AND ess.no_show IS NOT TRUE) as signed_up,
      JSON_AGG(DISTINCT jsonb_build_object('name', u.name, 'email', u.email)) 
        FILTER (WHERE ess.user_id IS NOT NULL AND ess.status = 'signed_up') as evaluators
    FROM evaluation_schedule es
    JOIN age_categories ac ON ac.id = es.age_category_id
    JOIN organizations o ON o.id = ac.organization_id
    LEFT JOIN sp_association_links sal ON sal.association_id = o.id AND sal.service_provider_id = ${orgId}
    LEFT JOIN evaluator_session_signups ess ON ess.schedule_id = es.id
    LEFT JOIN users u ON u.id = ess.user_id
    WHERE (sal.service_provider_id = ${orgId} OR o.id = ${orgId})
      AND es.scheduled_date >= CURRENT_DATE
      AND es.scheduled_date <= ${cutoff.toISOString().split("T")[0]}
    GROUP BY es.id, ac.name, ac.evaluators_required, o.name
    ORDER BY es.scheduled_date, es.start_time
  `;

  return sessions.map(s => ({
    id: s.id,
    date: s.scheduled_date?.toString().split("T")[0],
    time: s.start_time || "",
    group: `${s.category_name} - Group ${s.group_number}`,
    required: parseInt(s.evaluators_required) || 4,
    signed_up: parseInt(s.signed_up) || 0,
    evaluators: s.evaluators?.filter(Boolean) || [],
    org_name: s.org_name,
  }));
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getOrgId(session);
    const body = await request.json();
    const { action } = body;

    const user = await sql`SELECT name, email FROM users WHERE email = ${session.email}`;
    const adminName = user[0]?.name || "Admin";
    const adminEmail = user[0]?.email;

    const org = await sql`SELECT name FROM organizations WHERE id = ${orgId}`;
    const orgName = org[0]?.name || "";

    if (action === "weekly_report") {
      const sessions = await getSessionStaffing(orgId, 7);
      await emailWeeklyStaffingReport({ adminEmail, adminName, orgName, sessions });
      return NextResponse.json({ success: true, message: `Weekly report sent to ${adminEmail}`, sessions_count: sessions.length });
    }

    if (action === "daily_alert") {
      const sessions = await getSessionStaffing(orgId, 2);
      const openSessions = sessions.filter(s => s.signed_up < s.required);
      if (!openSessions.length) return NextResponse.json({ success: true, message: "No understaffed sessions in the next 48 hours" });
      await emailDailyStaffingAlert({ adminEmail, adminName, orgName, openSessions });
      return NextResponse.json({ success: true, message: `Daily alert sent — ${openSessions.length} understaffed sessions`, sessions_count: openSessions.length });
    }

    if (action === "blast_evaluators") {
      const { session_ids } = body; // specific sessions to include, or all open
      const allSessions = await getSessionStaffing(orgId, 30);
      const openSessions = session_ids
        ? allSessions.filter(s => session_ids.includes(s.id))
        : allSessions.filter(s => s.signed_up < s.required);

      if (!openSessions.length) return NextResponse.json({ success: true, message: "No open sessions to blast" });

      // Get all active evaluators in pool
      const evaluators = await sql`
        SELECT DISTINCT u.email FROM users u
        JOIN evaluator_memberships em ON em.user_id = u.id
        WHERE em.organization_id = ${orgId}
          AND em.status = 'active'
          AND u.email IS NOT NULL
      `;
      const evalEmails = evaluators.map(e => e.email);
      if (!evalEmails.length) return NextResponse.json({ error: "No active evaluators in pool" }, { status: 400 });

      await emailOpenSessionsBlast({ evaluatorEmails: evalEmails, orgName, openSessions, adminName });
      return NextResponse.json({ success: true, message: `Blast sent to ${evalEmails.length} evaluators about ${openSessions.length} open sessions` });
    }

    if (action === "evaluator_efficiency") {
      const evaluators = await sql`
        SELECT
          u.id, u.name, u.email,
          em.created_at as joined_at,
          em.status as membership_status,

          -- Sessions & attendance
          COUNT(DISTINCT ess.id) FILTER (WHERE ess.status IN ('signed_up','completed')) as total_sessions,
          COUNT(DISTINCT ess.id) FILTER (WHERE ess.completed = true) as completed_sessions,
          COUNT(DISTINCT ess.id) FILTER (WHERE ess.no_show = true) as no_shows,

          -- Hours & pay
          COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status = 'approved'), 0) as approved_hours,
          COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status = 'pending'), 0) as pending_hours,

          -- Strikes (late cancels)
          COUNT(DISTINCT ef_lc.id) as late_cancel_strikes,

          -- Flags breakdown
          COUNT(DISTINCT ef_fast.id) as too_fast_flags,
          COUNT(DISTINCT ef_copy.id) as score_copy_flags,
          COUNT(DISTINCT ef_late.id) as late_scoring_flags,
          COUNT(DISTINCT ef_incomplete.id) as incomplete_flags,

          -- Scoring timing: avg minutes from session start to first score
          AVG(EXTRACT(EPOCH FROM (ess.first_score_at - (
            es.scheduled_date::date + es.start_time::time
          )))/60) FILTER (WHERE ess.first_score_at IS NOT NULL AND es.start_time IS NOT NULL) as avg_mins_to_first_score,

          -- Scoring spread: avg % of session time used
          AVG(
            CASE
              WHEN ess.first_score_at IS NOT NULL AND ess.last_score_at IS NOT NULL
                AND es.start_time IS NOT NULL AND es.end_time IS NOT NULL
              THEN EXTRACT(EPOCH FROM (ess.last_score_at - ess.first_score_at)) /
                NULLIF(EXTRACT(EPOCH FROM (es.end_time::time - es.start_time::time)), 0) * 100
              ELSE NULL
            END
          ) as avg_pct_session_used,

          -- Consensus: avg agreement with other evaluators
          AVG(CASE WHEN ef_outlier.flag_type = 'score_outlier' THEN NULL ELSE 100 END) as consistency_pct,

          -- Rating
          COALESCE(AVG(er.rating), 0) as avg_rating

        FROM evaluator_memberships em
        JOIN users u ON u.id = em.user_id
        LEFT JOIN evaluator_session_signups ess ON ess.user_id = u.id
        LEFT JOIN evaluation_schedule es ON es.id = ess.schedule_id
        LEFT JOIN evaluator_hours eh ON eh.evaluator_id = u.id AND eh.schedule_id = ess.schedule_id
        LEFT JOIN evaluator_flags ef_lc ON ef_lc.evaluator_id = u.id AND ef_lc.flag_type = 'late_cancel' AND ef_lc.organization_id = ${orgId}
        LEFT JOIN evaluator_flags ef_fast ON ef_fast.evaluator_id = u.id AND ef_fast.flag_type = 'too_fast' AND ef_fast.organization_id = ${orgId}
        LEFT JOIN evaluator_flags ef_copy ON ef_copy.evaluator_id = u.id AND ef_copy.flag_type = 'score_copy_suspected' AND ef_copy.organization_id = ${orgId}
        LEFT JOIN evaluator_flags ef_late ON ef_late.evaluator_id = u.id AND ef_late.flag_type = 'late_scoring' AND ef_late.organization_id = ${orgId}
        LEFT JOIN evaluator_flags ef_incomplete ON ef_incomplete.evaluator_id = u.id AND ef_incomplete.flag_type = 'incomplete' AND ef_incomplete.organization_id = ${orgId}
        LEFT JOIN evaluator_flags ef_outlier ON ef_outlier.evaluator_id = u.id AND ef_outlier.flag_type = 'score_outlier' AND ef_outlier.organization_id = ${orgId}
        LEFT JOIN evaluator_ratings er ON er.evaluator_id = u.id AND er.organization_id = ${orgId}
        WHERE em.organization_id = ${orgId} AND em.status = 'active'
        GROUP BY u.id, em.created_at, em.status
        ORDER BY u.name
      `;

      // Per-evaluator session history
      const sessionHistory = await sql`
        SELECT
          u.id as evaluator_id,
          es.scheduled_date, es.session_number, es.group_number,
          o.name as org_name, ac.name as category_name,
          ess.status, ess.completed, ess.no_show,
          ess.first_score_at, ess.last_score_at, ess.athletes_scored,
          eh.hours_worked, eh.status as hours_status
        FROM evaluator_session_signups ess
        JOIN users u ON u.id = ess.user_id
        JOIN evaluator_memberships em ON em.user_id = u.id AND em.organization_id = ${orgId}
        JOIN evaluation_schedule es ON es.id = ess.schedule_id
        JOIN age_categories ac ON ac.id = es.age_category_id
        JOIN organizations o ON o.id = ac.organization_id
        LEFT JOIN evaluator_hours eh ON eh.evaluator_id = u.id AND eh.schedule_id = ess.schedule_id
        WHERE em.organization_id = ${orgId}
        ORDER BY u.name, es.scheduled_date DESC
      `;

      return NextResponse.json({ evaluators, sessionHistory });
    }

    if (action === "get_sessions") {
      const sessions = await getSessionStaffing(orgId, 30);
      return NextResponse.json({ sessions });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Reports error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
