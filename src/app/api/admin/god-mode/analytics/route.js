import { requireSuperAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  try {
    const adminUser = await requireSuperAdmin(); if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const overview = await sql`
      SELECT
        (SELECT COUNT(*) FROM organizations) as total_organizations,
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM athletes WHERE is_active = true) as total_athletes,
        (SELECT COUNT(*) FROM evaluation_sessions) as total_sessions,
        (SELECT COUNT(*) FROM athlete_scores) as total_scores,
        (SELECT COUNT(*) FROM evaluator_assignments) as total_assignments
    `;

    const recentActivity = await sql`
      SELECT
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days') as new_users,
        (SELECT COUNT(*) FROM athletes WHERE created_at >= NOW() - INTERVAL '7 days') as new_athletes,
        (SELECT COUNT(*) FROM evaluation_sessions WHERE created_at >= NOW() - INTERVAL '7 days') as new_sessions,
        (SELECT COUNT(*) FROM athlete_scores WHERE created_at >= NOW() - INTERVAL '7 days') as new_scores
    `;

    const topOrgs = await sql`
      SELECT
        o.id, o.name, o.type,
        COUNT(DISTINCT es.id) as session_count,
        COUNT(DISTINCT a.id) as athlete_count,
        COUNT(DISTINCT asc2.id) as score_count
      FROM organizations o
      LEFT JOIN evaluation_sessions es ON es.organization_id = o.id
      LEFT JOIN athletes a ON a.organization_id = o.id AND a.is_active = true
      LEFT JOIN athlete_scores asc2 ON asc2.session_id = es.id
      GROUP BY o.id, o.name, o.type
      ORDER BY session_count DESC, score_count DESC
      LIMIT 10
    `;

    return NextResponse.json({
      overview: overview[0],
      recentActivity: recentActivity[0],
      topOrgs: topOrgs.map((o) => ({
        ...o,
        session_count: parseInt(o.session_count) || 0,
        athlete_count: parseInt(o.athlete_count) || 0,
        score_count: parseInt(o.score_count) || 0,
      })),
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
