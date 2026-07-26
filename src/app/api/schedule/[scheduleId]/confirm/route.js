// Confirm an "if necessary" (tentative) session — flip it to scheduled so it
// opens to evaluator/tester signups. Manager-only (God, serving SP admin, a
// lead, or an in-house association admin), same rule as session assignment.
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageSessionAssignments } from "@/lib/authorize";

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const scheduleId = parseInt(params.scheduleId);
    if (!scheduleId) return NextResponse.json({ error: "Invalid session" }, { status: 400 });

    const [row] = await sql`
      SELECT es.status, ac.organization_id
      FROM evaluation_schedule es
      LEFT JOIN age_categories ac ON ac.id = es.age_category_id
      WHERE es.id = ${scheduleId}`;
    if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (!row.organization_id) return NextResponse.json({ error: "Not a confirmable session" }, { status: 400 });

    const manage = await canManageSessionAssignments(session, row.organization_id);
    if (!manage.authorized) return NextResponse.json({ error: "Forbidden", reason: manage.reason }, { status: 403 });

    // Un-confirm is possible too (scheduled → tentative), but only while no one is
    // signed up, so we never strip a confirmed session out from under signups.
    const body = await request.json().catch(() => ({}));
    const toTentative = body.tentative === true;

    if (toTentative) {
      const [{ n }] = await sql`SELECT COUNT(*)::int n FROM evaluator_session_signups WHERE schedule_id = ${scheduleId} AND status != 'cancelled'`;
      if (n > 0) return NextResponse.json({ error: "Can't set back to tentative — evaluators are already signed up." }, { status: 409 });
      await sql`UPDATE evaluation_schedule SET status = 'tentative' WHERE id = ${scheduleId} AND status = 'scheduled'`;
      return NextResponse.json({ ok: true, status: "tentative" });
    }

    await sql`UPDATE evaluation_schedule SET status = 'scheduled' WHERE id = ${scheduleId} AND status = 'tentative'`;
    return NextResponse.json({ ok: true, status: "scheduled" });
  } catch (error) {
    console.error("confirm session error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
