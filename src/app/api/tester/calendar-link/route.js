// Subscribe URLs for a tester's testing-sessions feed (https / webcal / Google).
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { signCalendarToken, canonicalCalendarBase } from "@/lib/calendar-token";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userRow = await sql`SELECT id FROM users WHERE email = ${session.email}`;
    const userId = userRow[0]?.id;
    if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const baseUrl = canonicalCalendarBase(new URL(request.url).origin);
    const token = signCalendarToken(userId);
    const httpsUrl = `${baseUrl}/api/tester/calendar?token=${token}`;
    const webcalUrl = httpsUrl.replace(/^https?:/, "webcal:");
    const googleUrl = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(httpsUrl)}`;
    return NextResponse.json({ httpsUrl, webcalUrl, googleUrl });
  } catch (error) {
    console.error("Tester calendar link error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
