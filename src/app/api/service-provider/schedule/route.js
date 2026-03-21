import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const to = searchParams.get("to") || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Get SP org by email
    // Get SP org - try contact_email first, then evaluator_memberships
    let spId = null;
    const byContact = await sql`SELECT id FROM organizations WHERE contact_email = ${session.email} AND type = 'service_provider' LIMIT 1`;
    if (byContact.length) {
      spId = byContact[0].id;
    } else {
      const byMembership = await sql`
        SELECT em.organization_id as sp_id FROM evaluator_memberships em
        JOIN organizations o ON o.id = em.organization_id
        JOIN users u ON u.id = em.user_id
        WHERE u.email = ${session.email} AND o.type = 'service_provider' LIMIT 1
      `;
      if (byMembership.length) spId = byMembership[0].sp_id;
    }
    if (!spId) return NextResponse.json({ error: "Not a service provider" }, { status: 403 });

    // Get all sessions across all client associations
    const schedule = await sql`
      SELECT 
        es.id as schedule_id,
        es.scheduled_date, es.day_of_week, es.start_time, es.end_time,
        es.location, es.session_number, es.group_number, es.status,
        es.checkin_code,
        ac.id as category_id, ac.name as category_name,
        o.id as org_id, o.name as org_name,
        cs.session_type, cs.name as session_name,
        COALESCE(cs.evaluators_required, ac.evaluators_required, 4) as evaluators_required,
        COUNT(DISTINCT ess.id) as evaluators_signed_up,
        COUNT(DISTINCT pc.id) FILTER (WHERE pc.checked_in = true) as checked_in_count
      FROM sp_association_links sal
      JOIN organizations o ON o.id = sal.association_id
      JOIN age_categories ac ON ac.organization_id = o.id
      JOIN evaluation_schedule es ON es.age_category_id = ac.id
      LEFT JOIN category_sessions cs ON cs.age_category_id = ac.id AND cs.session_number = es.session_number
      LEFT JOIN evaluator_session_signups ess ON ess.schedule_id = es.id AND ess.status != 'cancelled'
      LEFT JOIN player_checkins pc ON pc.schedule_id = es.id
      WHERE sal.service_provider_id = ${spId}
        AND sal.status = 'active'
        AND es.scheduled_date BETWEEN ${from} AND ${to}
      GROUP BY es.id, ac.id, o.id, cs.session_type, cs.name, cs.evaluators_required, ac.evaluators_required
      ORDER BY es.scheduled_date, es.start_time, o.name
    `;

    // Group by date
    const byDate = {};
    for (const entry of schedule) {
      const date = entry.scheduled_date?.toString().split("T")[0];
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push({
        ...entry,
        spots_open: entry.session_type === 'testing' ? 0 : parseInt(entry.evaluators_required) - parseInt(entry.evaluators_signed_up || 0),
      });
    }

    return NextResponse.json({ schedule, byDate });
  } catch (error) {
    console.error("SP schedule error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
