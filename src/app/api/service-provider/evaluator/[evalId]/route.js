import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { evalId } = params;

    // Get evaluator basic info
    const evaluator = await sql`
      SELECT id, name, email, role, created_at FROM users WHERE id = ${evalId}
    `;
    if (!evaluator.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Full session history
    const sessions = await sql`
      SELECT 
        ess.id, ess.status, ess.created_at as signed_up_at,
        ess.first_score_at, ess.last_score_at, ess.athletes_scored,
        ess.completed, ess.no_show,
        es.id as schedule_id, es.scheduled_date, es.start_time, es.end_time,
        es.session_number, es.group_number, es.location,
        ac.name as category_name,
        o.name as org_name,
        cs.session_type,
        eh.id as hours_id, eh.hours_worked, eh.status as hours_status,
        er.rating, er.notes as rating_notes
      FROM evaluator_session_signups ess
      JOIN evaluation_schedule es ON es.id = ess.schedule_id
      JOIN age_categories ac ON ac.id = es.age_category_id
      JOIN organizations o ON o.id = ac.organization_id
      LEFT JOIN category_sessions cs ON cs.age_category_id = ac.id AND cs.session_number = es.session_number
      LEFT JOIN evaluator_hours eh ON eh.evaluator_id = ess.user_id AND eh.schedule_id = es.id
      LEFT JOIN evaluator_ratings er ON er.evaluator_id = ess.user_id AND er.schedule_id = es.id
      WHERE ess.user_id = ${evalId}
      ORDER BY es.scheduled_date DESC, es.start_time DESC
    `;

    // All flags
    const flags = await sql`
      SELECT ef.*, es.session_number, es.group_number, es.scheduled_date,
        o.name as org_name
      FROM evaluator_flags ef
      LEFT JOIN evaluation_schedule es ON es.id = ef.schedule_id
      LEFT JOIN age_categories ac ON ac.id = es.age_category_id
      LEFT JOIN organizations o ON o.id = ac.organization_id
      WHERE ef.evaluator_id = ${evalId}
      ORDER BY ef.created_at DESC
    `;

    // Stats summary
    const stats = {
      total_sessions: sessions.filter(s => s.status === 'signed_up' || s.status === 'completed').length,
      completed_sessions: sessions.filter(s => s.completed).length,
      no_shows: sessions.filter(s => s.no_show).length,
      total_hours: sessions.reduce((sum, s) => sum + parseFloat(s.hours_worked || 0), 0),
      pending_hours: sessions.filter(s => s.hours_status === 'pending').reduce((sum, s) => sum + parseFloat(s.hours_worked || 0), 0),
      approved_hours: sessions.filter(s => s.hours_status === 'approved').reduce((sum, s) => sum + parseFloat(s.hours_worked || 0), 0),
      avg_rating: sessions.filter(s => s.rating).length > 0
        ? sessions.reduce((sum, s) => sum + parseFloat(s.rating || 0), 0) / sessions.filter(s => s.rating).length
        : 0,
      strike_count: flags.filter(f => f.flag_type === 'late_cancel').length,
      open_flags: flags.filter(f => !f.reviewed).length,
    };

    return NextResponse.json({ evaluator: evaluator[0], sessions, flags, stats });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
