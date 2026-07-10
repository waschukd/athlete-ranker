// A tester logs the hours they worked at a testing session. Reuses the shared
// evaluator_hours table (evaluator_id = the tester's user id), so the SP's
// existing "pending hours → approve → paid" flow and the /api/evaluator/pay
// summary cover testers with no new tables.

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getSpCapabilities } from "@/lib/testers";

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const cap = await getSpCapabilities(session);
    if (!cap.isTester) return NextResponse.json({ error: "Not a tester" }, { status: 403 });

    const body = await request.json();
    const scheduleId = parseInt(body.schedule_id);
    const hours = parseFloat(body.hours);
    if (!scheduleId || !(hours > 0)) return NextResponse.json({ error: "schedule_id and positive hours required" }, { status: 400 });

    // The tester must actually be signed up to this session, and it must belong
    // to one of their SPs. Resolve which SP org to bill the hours under.
    const rows = await sql`
      SELECT es.id, es.scheduled_date, es.service_provider_id,
        (SELECT sal.service_provider_id FROM sp_association_links sal
         JOIN age_categories ac ON ac.organization_id = sal.association_id
         WHERE ac.id = es.age_category_id AND sal.status = 'active'
           AND sal.service_provider_id = ANY(${cap.testerOrgIds}) LIMIT 1) AS assoc_sp
      FROM evaluation_schedule es
      JOIN tester_session_signups tss ON tss.schedule_id = es.id AND tss.user_id = ${cap.userId} AND tss.status = 'signed_up'
      WHERE es.id = ${scheduleId}`;
    if (!rows.length) return NextResponse.json({ error: "You're not signed up for that session" }, { status: 403 });

    const orgId = rows[0].service_provider_id || rows[0].assoc_sp;
    if (!orgId || !cap.testerOrgIds.includes(orgId)) return NextResponse.json({ error: "Not one of your service providers" }, { status: 403 });

    await sql`
      INSERT INTO evaluator_hours (evaluator_id, organization_id, schedule_id, session_date, hours_worked, status)
      VALUES (${cap.userId}, ${orgId}, ${scheduleId}, ${rows[0].scheduled_date}, ${hours}, 'pending')
      ON CONFLICT (evaluator_id, schedule_id) DO UPDATE SET hours_worked = ${hours}, status = 'pending'`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Tester hours error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
