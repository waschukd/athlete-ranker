// Single-session .ics for a parent's "Add to calendar · Apple / Outlook" link.
//
// Why a link and not an attachment: Gmail turns a text/calendar attachment into
// its own bulky event card ABOVE the message, which we can't move or resize and
// which buries the association's branding. A link is just a link — and tapping
// an .ics link on iPhone/Mac opens Apple Calendar's native "Add Event" sheet,
// which the Google template URL can't do.
//
// Public by necessity (parents have no account), so it is HMAC-signed against
// the schedule row id. It returns only what the parent's email already said —
// date, time, rink — and never the group number or any athlete.
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { verifySessionIcsToken } from "@/lib/calendar-token";
import { generateICS } from "@/lib/calendar";

export async function GET(request) {
  try {
    const token = new URL(request.url).searchParams.get("t");
    const scheduleId = verifySessionIcsToken(token);
    if (!scheduleId) return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });

    const [row] = await sql`
      SELECT es.id, es.scheduled_date, es.start_time, es.end_time, es.location, es.session_number, es.status,
             ac.name AS category_name, o.name AS org_name, cs.session_type
      FROM evaluation_schedule es
      LEFT JOIN age_categories ac ON ac.id = es.age_category_id
      LEFT JOIN organizations o ON o.id = ac.organization_id
      LEFT JOIN category_sessions cs ON cs.age_category_id = es.age_category_id AND cs.session_number = es.session_number
      WHERE es.id = ${scheduleId}
    `;
    if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (row.status === "cancelled") return NextResponse.json({ error: "This session was cancelled" }, { status: 410 });

    // No group_number — generateICS would put it in the event title, and the
    // whole point is that parents never see it. `title` keeps the event name
    // plain-English and identical to the Google link's, rather than the staff
    // shorthand ("U11 House — S1").
    const ics = generateICS({
      id: row.id,
      title: row.category_name ? `${row.category_name} Evaluation` : "Evaluation",
      scheduled_date: row.scheduled_date,
      start_time: row.start_time,
      end_time: row.end_time,
      location: row.location,
      session_number: row.session_number,
      category_name: row.category_name,
      org_name: row.org_name,
      session_type: row.session_type,
    });

    return new NextResponse(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        // filename matters: iOS keys the Calendar hand-off off the extension.
        "Content-Disposition": 'attachment; filename="session.ics"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("session.ics error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
