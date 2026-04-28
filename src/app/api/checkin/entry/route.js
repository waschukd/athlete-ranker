// Volunteer check-in entry. Public by design — a director hands a printed
// short code to walk-up volunteers (parents, etc.) so they can mark
// players present without needing an account.
//
// After validating the code, we mint a short-lived signed JWT bound to
// the resolved scheduleId and stash it in an httpOnly cookie. The
// follow-on /api/checkin/[scheduleId] handler accepts either a normal
// authenticated session OR a valid checkin-token whose scheduleId
// matches the URL parameter — that's what closes the IDOR hole where
// anyone could previously read/mutate any schedule by guessing its id.

import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import sql from "@/lib/db";

if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET environment variable is required");
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);
const CHECKIN_TTL_SECONDS = 8 * 60 * 60; // 8h — long enough for a tryout day

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

    const token = await new SignJWT({
      scope: "checkin",
      schedule_id: entry.schedule_id,
      volunteer_email,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(`${CHECKIN_TTL_SECONDS}s`)
      .sign(SECRET);

    const res = NextResponse.json({
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
    res.cookies.set("checkin-token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CHECKIN_TTL_SECONDS,
    });
    return res;
  } catch (error) {
    console.error("Checkin entry error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
