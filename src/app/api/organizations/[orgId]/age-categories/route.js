import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import { logEvent } from "@/lib/analytics";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const auth = await authorizeOrgAccess(session, params.orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const categories = await sql`
      SELECT ac.*,
        COUNT(DISTINCT a.id) as athletes_count,
        COUNT(DISTINCT es.id) as sessions_count,
        (SELECT COUNT(*) FROM category_sessions cs WHERE cs.age_category_id = ac.id) AS cs_total,
        (SELECT COUNT(*) FROM category_sessions cs WHERE cs.age_category_id = ac.id AND cs.status = 'complete') AS cs_complete,
        ac.setup_complete
      FROM age_categories ac
      LEFT JOIN athletes a ON a.age_category_id = ac.id AND a.is_active = true
      LEFT JOIN evaluation_schedule es ON es.age_category_id = ac.id
      WHERE ac.organization_id = ${params.orgId}
      GROUP BY ac.id
      ORDER BY ac.name
    `;

    // Next upcoming sessions across the whole association (for the dashboard's
    // "Upcoming schedule" rail). signups lets us flag understaffed sessions.
    let upcoming = [];
    try {
      upcoming = await sql`
        SELECT es.id, es.scheduled_date, es.start_time, es.end_time, es.location,
          es.session_number, es.group_number, es.evaluators_required, es.goalie_evaluators_required,
          ac.name AS category_name, cs.session_type,
          COUNT(ess.id) FILTER (WHERE ess.status = 'signed_up') AS signups
        FROM evaluation_schedule es
        JOIN age_categories ac ON ac.id = es.age_category_id
        LEFT JOIN category_sessions cs ON cs.age_category_id = es.age_category_id AND cs.session_number = es.session_number
        LEFT JOIN evaluator_session_signups ess ON ess.schedule_id = es.id
        WHERE ac.organization_id = ${params.orgId}
          AND es.scheduled_date >= CURRENT_DATE
          AND es.status = 'scheduled'
        GROUP BY es.id, ac.name, cs.session_type
        ORDER BY es.scheduled_date ASC, es.start_time ASC
        LIMIT 8
      `;
    } catch { upcoming = []; }

    // True count of all upcoming sessions (the list above is capped) so the
    // dashboard can show "next 3" + an accurate "N more" ticker.
    let upcomingTotal = upcoming.length;
    try {
      const [row] = await sql`
        SELECT COUNT(*)::int AS n
        FROM evaluation_schedule es
        JOIN age_categories ac ON ac.id = es.age_category_id
        WHERE ac.organization_id = ${params.orgId}
          AND es.scheduled_date >= CURRENT_DATE
          AND es.status = 'scheduled'
      `;
      upcomingTotal = row?.n ?? upcoming.length;
    } catch { /* keep fallback */ }

    return NextResponse.json({ categories, upcoming, upcomingTotal });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const auth = await authorizeOrgAccess(session, params.orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { name, min_age, max_age } = await request.json();
    const result = await sql`
      INSERT INTO age_categories (organization_id, name, min_age, max_age)
      VALUES (${params.orgId}, ${name}, ${min_age || null}, ${max_age || null})
      RETURNING *
    `;
    logEvent({
      userId: await getAppUserId(session),
      role: session.role || "anonymous",
      event: "category.created",
      orgId: parseInt(params.orgId, 10) || null,
      metadata: { catId: result[0].id },
    });
    return NextResponse.json({ category: result[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
