import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canViewEvaluator } from "@/lib/authorize";

// Real complaint: clicking an evaluator's name already shows their whole
// session history -- testers had no equivalent at all. canViewEvaluator is
// reused as-is: despite the name, it only ever checks evaluator_memberships
// (the same table testers live in, distinguished by is_tester) plus the
// caller's own org access -- it never actually cares whether the target
// person is an evaluator or a tester.
export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { testerId } = params;

    if (!(await canViewEvaluator(session, testerId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const tester = await sql`SELECT id, name, email, role, created_at FROM users WHERE id = ${testerId}`;
    if (!tester.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Full testing session history -- covers both an association's testing
    // sessions (age_category_id set) and an SP's own standalone testing
    // events (no category, hangs off service_provider_id instead).
    const sessions = await sql`
      SELECT
        tss.id, tss.status, tss.created_at as signed_up_at,
        es.id as schedule_id, es.scheduled_date, es.start_time, es.end_time,
        es.session_number, es.group_number, es.location,
        COALESCE(ac.name, es.client_label, es.age_label, 'Testing') as category_name,
        COALESCE(o.name, sp.name) as org_name,
        COALESCE(cs.session_type, 'testing') as session_type,
        eh.id as hours_id, eh.hours_worked, eh.status as hours_status
      FROM tester_session_signups tss
      JOIN evaluation_schedule es ON es.id = tss.schedule_id
      LEFT JOIN age_categories ac ON ac.id = es.age_category_id
      LEFT JOIN organizations o ON o.id = ac.organization_id
      LEFT JOIN organizations sp ON sp.id = es.service_provider_id
      LEFT JOIN category_sessions cs ON cs.age_category_id = ac.id AND cs.session_number = es.session_number
      LEFT JOIN evaluator_hours eh ON eh.evaluator_id = tss.user_id AND eh.schedule_id = es.id
      WHERE tss.user_id = ${testerId}
      ORDER BY es.scheduled_date DESC, es.start_time DESC
    `;

    const stats = {
      total_sessions: sessions.filter(s => s.status === "signed_up").length,
      cancelled_sessions: sessions.filter(s => s.status === "cancelled").length,
      total_hours: sessions.reduce((sum, s) => sum + parseFloat(s.hours_worked || 0), 0),
      pending_hours: sessions.filter(s => s.hours_status === "pending").reduce((sum, s) => sum + parseFloat(s.hours_worked || 0), 0),
      approved_hours: sessions.filter(s => s.hours_status === "approved").reduce((sum, s) => sum + parseFloat(s.hours_worked || 0), 0),
    };

    return NextResponse.json({ tester: tester[0], sessions, stats });
  } catch (error) {
    console.error("tester detail GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
