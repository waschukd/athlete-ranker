import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, resolveSpContext } from "@/lib/auth";

const ADMIN_ROLES = new Set(["service_provider_admin", "goalie_service_provider_admin", "super_admin"]);

async function guard(request) {
  const session = await getSession();
  if (!session) return { err: 401 };
  if (!ADMIN_ROLES.has(session.role)) return { err: 403 };
  const { orgId: spId } = await resolveSpContext(session, new URL(request.url).searchParams.get("org"));
  if (!spId) return { err: 403 };
  return { session, spId };
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function GET(request) {
  try {
    const g = await guard(request);
    if (g.err) return NextResponse.json({ error: "Forbidden" }, { status: g.err });
    const events = await sql`
      SELECT es.id, es.client_label, es.scheduled_date, es.day_of_week, es.start_time, es.end_time, es.location,
        COALESCE(es.testers_required, 0) as testers_required, es.status,
        COUNT(DISTINCT tss.id) FILTER (WHERE tss.status = 'signed_up') as testers_signed_up
      FROM evaluation_schedule es
      LEFT JOIN tester_session_signups tss ON tss.schedule_id = es.id
      WHERE es.service_provider_id = ${g.spId}
      GROUP BY es.id
      ORDER BY es.scheduled_date, es.start_time`;
    return NextResponse.json({ events });
  } catch (error) {
    console.error("SP testing-events GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const g = await guard(request);
    if (g.err) return NextResponse.json({ error: "Forbidden" }, { status: g.err });
    const b = await request.json();
    const client_label = String(b.client_label || "").trim().slice(0, 120);
    const scheduled_date = b.scheduled_date;
    if (!client_label || !scheduled_date) return NextResponse.json({ error: "Client and date are required" }, { status: 400 });
    let dow = b.day_of_week || null;
    if (!dow) { try { dow = DOW[new Date(`${scheduled_date}T00:00:00`).getDay()]; } catch { dow = null; } }
    const [row] = await sql`
      INSERT INTO evaluation_schedule (service_provider_id, client_label, scheduled_date, day_of_week, start_time, end_time, location, testers_required, session_number, group_number, status)
      VALUES (${g.spId}, ${client_label}, ${scheduled_date}, ${dow}, ${b.start_time || null}, ${b.end_time || null}, ${b.location || null}, ${Math.max(0, parseInt(b.testers_required) || 0)}, 1, 1, 'scheduled')
      RETURNING id`;
    return NextResponse.json({ success: true, id: row.id });
  } catch (error) {
    console.error("SP testing-events POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const g = await guard(request);
    if (g.err) return NextResponse.json({ error: "Forbidden" }, { status: g.err });
    const id = parseInt(new URL(request.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    // Only ever delete this SP's own testing events.
    await sql`DELETE FROM evaluation_schedule WHERE id = ${id} AND service_provider_id = ${g.spId}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("SP testing-events DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
