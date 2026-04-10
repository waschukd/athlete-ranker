import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST(request) {
  try {
    const { code, volunteer_name, volunteer_email } = await request.json();

    if (!code || !volunteer_name || !volunteer_email) {
      return NextResponse.json({ error: "Code, name and email required" }, { status: 400 });
    }

    // Find schedule entry by code
    const entries = await sql`
      SELECT 
        es.id as schedule_id,
        es.session_number, es.group_number,
        es.scheduled_date, es.start_time, es.end_time, es.location,
        ac.name as category_name,
        o.name as org_name
      FROM evaluation_schedule es
      JOIN age_categories ac ON ac.id = es.age_category_id
      JOIN organizations o ON o.id = ac.organization_id
      WHERE UPPER(es.checkin_code) = UPPER(${code})
    `;

    if (!entries.length) {
      return NextResponse.json({ error: "Invalid session code. Check with your director." }, { status: 404 });
    }

    const entry = entries[0];

    // Log volunteer access
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    await sql`
      INSERT INTO volunteer_checkins (schedule_id, volunteer_name, volunteer_email, ip_address)
      VALUES (${entry.schedule_id}, ${volunteer_name}, ${volunteer_email}, ${ip})
    `;

    return NextResponse.json({
      success: true,
      schedule_id: entry.schedule_id,
      session_info: {
        session_number: entry.session_number,
        group_number: entry.group_number,
        category_name: entry.category_name,
        org_name: entry.org_name,
        scheduled_date: entry.scheduled_date,
        start_time: entry.start_time,
        location: entry.location,
      },
    });
  } catch (error) {
    console.error("Checkin entry error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
