import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

import { NextResponse } from "next/server";
import sql from "@/lib/db";

function generateCheckinCode(session, group) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const prefix = `S${session}G${group}`;
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${suffix}`;
}

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const schedule = await sql`
      SELECT * FROM evaluation_schedule
      WHERE age_category_id = ${catId}
      ORDER BY scheduled_date, start_time, group_number
    `;
    return NextResponse.json({ schedule });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();

    if (!body.schedule || !Array.isArray(body.schedule)) {
      return NextResponse.json({ error: "schedule array required" }, { status: 400 });
    }

    let count = 0;
    for (const entry of body.schedule) {
      const session_number = parseInt(entry.session_number);
      const group_number = parseInt(entry.group_number) || null;
      const scheduled_date = entry.scheduled_date;
      const day_of_week = entry.day_of_week || null;
      const start_time = entry.start_time || null;
      const end_time = entry.end_time || null;
      const location = entry.location || null;
      // Check if this session is a testing session — testing needs no evaluators
      const sessionTypeLookup = await sql`
        SELECT session_type FROM category_sessions
        WHERE age_category_id = ${catId} AND session_number = ${session_number}
        LIMIT 1
      `;
      const isTesting = sessionTypeLookup[0]?.session_type === 'testing';
      const evaluators_required = isTesting ? 0 : (parseInt(entry.evaluators_required || entry['Evaluators Required'] || 4) || 4);

      if (!session_number || !scheduled_date) continue;

      let code = generateCheckinCode(session_number, group_number || 0);
      let existing = await sql`SELECT id FROM evaluation_schedule WHERE checkin_code = ${code}`;
      while (existing.length) {
        code = generateCheckinCode(session_number, group_number || 0);
        existing = await sql`SELECT id FROM evaluation_schedule WHERE checkin_code = ${code}`;
      }

      const existingEntry = await sql`
        SELECT id FROM evaluation_schedule
        WHERE age_category_id = ${catId}
          AND session_number = ${session_number}
          AND group_number = ${group_number}
      `;

      if (existingEntry.length) {
        await sql`
          UPDATE evaluation_schedule SET
            scheduled_date = ${scheduled_date},
            start_time = ${start_time},
            end_time = ${end_time},
            location = ${location},
            evaluators_required = ${evaluators_required}
          WHERE id = ${existingEntry[0].id}
        `;
      } else {
        await sql`
          INSERT INTO evaluation_schedule (
            age_category_id, session_number, group_number,
            scheduled_date, day_of_week, start_time, end_time,
            location, checkin_code, evaluators_required
          ) VALUES (
            ${catId}, ${session_number}, ${group_number},
            ${scheduled_date}, ${day_of_week}, ${start_time}, ${end_time},
            ${location}, ${code}, ${evaluators_required}
          )
        `;
      }
      count++;
    }

    // Create session_groups for any group entries
    const groupEntries = body.schedule.filter(e => e.group_number);
    const uniqueGroups = new Map(groupEntries.map(e => [`${e.session_number}-${e.group_number}`, e]));
    for (const [, entry] of uniqueGroups) {
      const existingGroup = await sql`
        SELECT id FROM session_groups
        WHERE age_category_id = ${catId}
          AND session_number = ${entry.session_number}
          AND group_number = ${entry.group_number}
      `;
      if (!existingGroup.length) {
        await sql`
          INSERT INTO session_groups (age_category_id, session_number, group_number, name, display_order)
          VALUES (${catId}, ${entry.session_number}, ${entry.group_number}, ${'Group ' + entry.group_number}, ${entry.group_number})
        `;
      }
    }

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("Schedule POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get("id");
    if (!scheduleId) return NextResponse.json({ error: "id required" }, { status: 400 });

    const entry = await sql`
      SELECT es.*, ac.name as category_name, o.name as org_name, o.id as org_id
      FROM evaluation_schedule es
      JOIN age_categories ac ON ac.id = es.age_category_id
      JOIN organizations o ON o.id = ac.organization_id
      WHERE es.id = ${scheduleId} AND es.age_category_id = ${catId}
    `;
    if (!entry.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const e = entry[0];

    await sql`DELETE FROM evaluation_schedule WHERE id = ${scheduleId}`;

    const signedUp = await sql`
      SELECT u.email, u.name FROM evaluator_session_signups ess
      JOIN users u ON u.id = ess.user_id
      WHERE ess.schedule_id = ${scheduleId} AND ess.status = 'signed_up'
    `;
    const admins = await sql`
      SELECT u.email, u.name FROM users u
      JOIN organizations o ON o.contact_email = u.email
      WHERE o.id = ${e.org_id}
    `;

    const dateStr = e.scheduled_date?.toString().split("T")[0];
    const subject = `Session Cancelled — ${e.category_name} Group ${e.group_number} (${dateStr})`;

    const { sendEmail } = await import("@/lib/email");

    // Email admins
    const adminHtml = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;">
      <h2 style="color:#dc2626;">Session Cancelled</h2>
      <p>The following session has been cancelled and all signed-up evaluators have been notified:</p>
      <ul>
        <li><strong>Category:</strong> ${e.category_name}</li>
        <li><strong>Group:</strong> Group ${e.group_number}</li>
        <li><strong>Date:</strong> ${dateStr}</li>
        <li><strong>Time:</strong> ${e.start_time || "—"}</li>
        <li><strong>Evaluators notified:</strong> ${signedUp.length}</li>
      </ul>
    </div>`;
    for (const admin of admins) {
      await sendEmail(admin.email, subject, adminHtml);
    }

    // Email each signed-up evaluator with clear messaging
    const evalHtml = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;">
      <h2 style="color:#dc2626;">⚠️ Session Cancelled</h2>
      <p>A session you were signed up for has been cancelled. <strong>No action is required from you</strong> and this will not affect your record.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin:20px 0;">
        <table cellpadding="0" cellspacing="0">
          <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:120px;">Organization</td><td style="font-size:13px;font-weight:600;color:#111827;">${e.org_name}</td></tr>
          <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Category</td><td style="font-size:13px;font-weight:600;color:#111827;">${e.category_name}</td></tr>
          <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Group</td><td style="font-size:13px;font-weight:600;color:#111827;">Group ${e.group_number}</td></tr>
          <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Date</td><td style="font-size:13px;font-weight:600;color:#111827;">${dateStr}</td></tr>
          <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Time</td><td style="font-size:13px;font-weight:600;color:#111827;">${e.start_time || "—"}</td></tr>
        </table>
      </div>
      <p style="font-size:13px;color:#6b7280;">Check your dashboard for other available sessions.</p>
      <a href="${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/evaluator/dashboard" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#1A6BFF,#4D8FFF);color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">View Available Sessions →</a>
    </div>`;
    for (const eval_ of signedUp) {
      await sendEmail(eval_.email, `Session Cancelled — ${e.category_name} G${e.group_number} (${dateStr})`, evalHtml);
    }

    return NextResponse.json({ success: true, notified: admins.length + signedUp.length });
  } catch (error) {
    console.error("Schedule DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
