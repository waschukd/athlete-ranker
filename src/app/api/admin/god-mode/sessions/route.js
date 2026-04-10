import { requireSuperAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(request) {
  try {
    const adminUser = await requireSuperAdmin();
    if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sessions = await sql`
      SELECT es.id, es.session_number, es.group_number, es.scheduled_date,
        es.start_time, es.end_time, es.location, es.checkin_code,
        ac.name as age_category_name,
        o.name as organization_name,
        COUNT(DISTINCT ess.user_id) FILTER (WHERE ess.status = 'signed_up') as evaluator_count,
        COUNT(DISTINCT pc.athlete_id) FILTER (WHERE pc.checked_in = true) as athlete_count
      FROM evaluation_schedule es
      JOIN age_categories ac ON ac.id = es.age_category_id
      JOIN organizations o ON o.id = ac.organization_id
      LEFT JOIN evaluator_session_signups ess ON ess.schedule_id = es.id
      LEFT JOIN player_checkins pc ON pc.schedule_id = es.id
      GROUP BY es.id, ac.name, o.name
      ORDER BY es.scheduled_date DESC, es.start_time DESC
    `;

    const now = new Date();
    const stats = {
      total: sessions.length,
      scheduled: sessions.filter(s => new Date(s.scheduled_date) > now).length,
      in_progress: sessions.filter(s => {
        const d = new Date(s.scheduled_date);
        return d.toDateString() === now.toDateString();
      }).length,
      completed: sessions.filter(s => new Date(s.scheduled_date) < now && new Date(s.scheduled_date).toDateString() !== now.toDateString()).length,
      upcoming: sessions.filter(s => {
        const d = new Date(s.scheduled_date);
        const diff = (d - now) / (1000 * 60 * 60 * 24);
        return diff > 0 && diff <= 7;
      }).length,
      overdue: 0,
    };

    return NextResponse.json({
      sessions: sessions.map(s => ({
        ...s,
        evaluator_count: parseInt(s.evaluator_count) || 0,
        athlete_count: parseInt(s.athlete_count) || 0,
      })),
      stats,
    });
  } catch (error) {
    console.error("God mode sessions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
