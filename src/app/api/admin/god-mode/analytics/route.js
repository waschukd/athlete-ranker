import { requireSuperAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  try {
    const adminUser = await requireSuperAdmin();
    if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const overview = await sql`
      SELECT
        (SELECT COUNT(*) FROM organizations) as total_organizations,
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM athletes WHERE is_active = true) as total_athletes,
        (SELECT COUNT(*) FROM evaluation_schedule) as total_sessions,
        (SELECT COUNT(*) FROM category_scores) as total_scores,
        (SELECT COUNT(*) FROM evaluator_session_signups WHERE status = 'signed_up') as total_assignments
    `;

    const recentActivity = await sql`
      SELECT
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days') as new_users,
        (SELECT COUNT(*) FROM athletes WHERE created_at >= NOW() - INTERVAL '7 days') as new_athletes,
        (SELECT COUNT(*) FROM evaluation_schedule WHERE scheduled_date >= NOW() - INTERVAL '7 days') as new_sessions,
        (SELECT COUNT(*) FROM category_scores WHERE created_at >= NOW() - INTERVAL '7 days') as new_scores
    `;

    const topOrgs = await sql`
      SELECT
        o.id, o.name, o.type,
        COUNT(DISTINCT es.id) as session_count,
        COUNT(DISTINCT a.id) as athlete_count,
        COUNT(DISTINCT cs.id) as score_count
      FROM organizations o
      LEFT JOIN age_categories ac ON ac.organization_id = o.id
      LEFT JOIN evaluation_schedule es ON es.age_category_id = ac.id
      LEFT JOIN athletes a ON a.organization_id = o.id AND a.is_active = true
      LEFT JOIN category_scores cs ON cs.age_category_id = ac.id
      GROUP BY o.id, o.name, o.type
      ORDER BY session_count DESC, score_count DESC
      LIMIT 10
    `;

    return NextResponse.json({
      overview: overview[0],
      recentActivity: recentActivity[0],
      topOrgs: topOrgs.map(o => ({
        ...o,
        session_count: parseInt(o.session_count) || 0,
        athlete_count: parseInt(o.athlete_count) || 0,
        score_count: parseInt(o.score_count) || 0,
      })),
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
