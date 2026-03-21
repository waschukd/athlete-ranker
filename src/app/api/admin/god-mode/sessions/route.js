import { requireSuperAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(request) {
  try {
    const adminUser = await requireSuperAdmin(); if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");

    const sessions = statusFilter
      ? await sql`
          SELECT es.*, o.name as organization_name, ac.name as age_category_name,
            COUNT(DISTINCT eg.id) as group_count,
            COUNT(DISTINCT ga.athlete_id) as athlete_count,
            COUNT(DISTINCT ea.user_id) as evaluator_count
          FROM evaluation_sessions es
          LEFT JOIN organizations o ON o.id = es.organization_id
          LEFT JOIN age_categories ac ON ac.id = es.age_category_id
          LEFT JOIN evaluation_groups eg ON eg.session_id = es.id
          LEFT JOIN group_assignments ga ON ga.group_id = eg.id
          LEFT JOIN evaluator_assignments ea ON ea.session_id = es.id
          WHERE es.status = ${statusFilter}
          GROUP BY es.id, o.name, ac.name
          ORDER BY es.scheduled_date DESC
        `
      : await sql`
          SELECT es.*, o.name as organization_name, ac.name as age_category_name,
            COUNT(DISTINCT eg.id) as group_count,
            COUNT(DISTINCT ga.athlete_id) as athlete_count,
            COUNT(DISTINCT ea.user_id) as evaluator_count
          FROM evaluation_sessions es
          LEFT JOIN organizations o ON o.id = es.organization_id
          LEFT JOIN age_categories ac ON ac.id = es.age_category_id
          LEFT JOIN evaluation_groups eg ON eg.session_id = es.id
          LEFT JOIN group_assignments ga ON ga.group_id = eg.id
          LEFT JOIN evaluator_assignments ea ON ea.session_id = es.id
          GROUP BY es.id, o.name, ac.name
          ORDER BY es.scheduled_date DESC
        `;

    const stats = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE scheduled_date > NOW() AND status = 'scheduled') as upcoming,
        COUNT(*) FILTER (WHERE scheduled_date < NOW() AND status = 'scheduled') as overdue
      FROM evaluation_sessions
    `;

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        ...s,
        group_count: parseInt(s.group_count) || 0,
        athlete_count: parseInt(s.athlete_count) || 0,
        evaluator_count: parseInt(s.evaluator_count) || 0,
      })),
      stats: stats[0],
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}
