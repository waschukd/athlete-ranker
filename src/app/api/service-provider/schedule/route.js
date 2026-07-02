import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, resolveSpContext } from "@/lib/auth";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    // Default to a full season either side so past sessions (which can be months
    // old) tie into the master schedule's "Show Past" view, not just the last 30
    // days. Callers can still narrow with explicit from/to params.
    const from = searchParams.get("from") || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const to = searchParams.get("to") || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Resolve SP org (contact_email, additional-admin role, or membership)
    const { orgId: spId, isGoalie } = await resolveSpContext(session, searchParams.get("org"));
    if (!spId) return NextResponse.json({ error: "Not a service provider" }, { status: 403 });

    // Get all sessions across all client associations
    const schedule = await sql`
      SELECT
        es.id as schedule_id,
        es.id as id,
        es.scheduled_date, es.day_of_week, es.start_time, es.end_time,
        es.location, es.session_number, es.group_number, es.status,
        es.checkin_code,
        ac.id as category_id, ac.id as age_category_id, ac.name as category_name,
        o.id as org_id, o.name as org_name,
        cs.session_type, cs.name as session_name,
        COALESCE(cs.evaluators_required, ac.evaluators_required, 4) as evaluators_required,
        COALESCE(es.goalie_evaluators_required, 0) as goalie_evaluators_required,
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
        -- A goalie SP only sees goalie-relevant slots: the goalie skills group
        -- (goalie_evaluators_required > 0) and the scrimmages. Player-only testing
        -- groups are hidden, so session 1 shows just the single goalie group.
        AND (NOT ${isGoalie}::boolean
             OR COALESCE(es.goalie_evaluators_required, 0) > 0
             OR COALESCE(cs.session_type, '') <> 'testing')
      GROUP BY es.id, ac.id, o.id, cs.session_type, cs.name, cs.evaluators_required, ac.evaluators_required
      ORDER BY es.scheduled_date, es.start_time, o.name
    `;

    // Group by date
    const byDate = {};
    for (const entry of schedule) {
      const date = entry.scheduled_date?.toString().split("T")[0];
      if (!byDate[date]) byDate[date] = [];
      // Player testing is objective (SportTesting hardware) — it needs NO
      // evaluators. Zero out the requirement so the SP dashboard matches what
      // evaluators see (they never sign up for testing) instead of showing "4".
      const isPlayerTesting = entry.session_type === 'testing' && !isGoalie;
      if (isPlayerTesting) entry.evaluators_required = 0;
      // For a goalie SP, "spots" track goalie evaluators; check-in is the
      // association's responsibility, so the dashboard hides it (is_goalie_sp).
      const spots_open = isPlayerTesting ? 0
        : isGoalie ? Math.max(0, parseInt(entry.goalie_evaluators_required || 0) - parseInt(entry.evaluators_signed_up || 0))
        : parseInt(entry.evaluators_required) - parseInt(entry.evaluators_signed_up || 0);
      byDate[date].push({ ...entry, spots_open, is_goalie_sp: isGoalie });
    }

    return NextResponse.json({ schedule, byDate });
  } catch (error) {
    console.error("SP schedule error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
