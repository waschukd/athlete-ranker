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
      SELECT es.id, es.client_label, es.age_label, es.scheduled_date, es.day_of_week, es.start_time, es.end_time, es.location,
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
    // Accept a single event OR a batch { events: [...] } (CSV upload).
    const list = Array.isArray(b.events) ? b.events : [b];
    let created = 0;
    for (const e of list) {
      const client_label = String(e.client_label || "").trim().slice(0, 120);
      const scheduled_date = String(e.scheduled_date || "").trim();
      const age_label = String(e.age_label || "").trim().slice(0, 60) || null;
      if (!client_label || !scheduled_date) continue;
      let dow = e.day_of_week || null;
      if (!dow) { try { dow = DOW[new Date(`${scheduled_date}T00:00:00`).getDay()]; } catch { dow = null; } }
      await sql`
        INSERT INTO evaluation_schedule (service_provider_id, client_label, age_label, scheduled_date, day_of_week, start_time, end_time, location, testers_required, session_number, group_number, status)
        VALUES (${g.spId}, ${client_label}, ${age_label}, ${scheduled_date}, ${dow}, ${e.start_time || null}, ${e.end_time || null}, ${e.location || null}, ${Math.max(0, parseInt(e.testers_required) || 0)}, 1, 1, 'scheduled')`;
      created++;
    }
    if (!created) return NextResponse.json({ error: "No valid sessions — each needs a client and date." }, { status: 400 });
    return NextResponse.json({ success: true, created, skipped: list.length - created });
  } catch (error) {
    console.error("SP testing-events POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Edit one of this SP's own testing events (date/time/location/testers), or
// cancel/reinstate via status. Mirrors the category schedule PATCH for the rows
// that have no age_category_id (SP-owned testing-only clients).
export async function PATCH(request) {
  try {
    const g = await guard(request);
    if (g.err) return NextResponse.json({ error: "Forbidden" }, { status: g.err });
    const b = await request.json();
    const id = parseInt(b.id);
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const status = b.status === "cancelled" || b.status === "scheduled" ? b.status : null;
    const testers = b.testers_required != null && b.testers_required !== "" ? Math.max(0, parseInt(b.testers_required) || 0) : null;
    const [row] = await sql`
      UPDATE evaluation_schedule SET
        scheduled_date = COALESCE(${b.scheduled_date || null}, scheduled_date),
        day_of_week = COALESCE(${b.day_of_week ?? null}, day_of_week),
        start_time = COALESCE(${b.start_time ?? null}, start_time),
        end_time = COALESCE(${b.end_time ?? null}, end_time),
        location = COALESCE(${b.location ?? null}, location),
        testers_required = COALESCE(${testers}, testers_required),
        status = COALESCE(${status}, status)
      WHERE id = ${id} AND service_provider_id = ${g.spId}
      RETURNING id`;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("SP testing-events PATCH error:", error);
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
