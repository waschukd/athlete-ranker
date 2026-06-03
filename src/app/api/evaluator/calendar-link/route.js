// Returns the current evaluator's personal calendar URLs in three forms:
//   - httpsUrl: copy-pasteable
//   - webcalUrl: webcal://... (auto-prompts iOS/macOS Calendar to subscribe)
//   - googleUrl: pre-filled Google Calendar add-by-URL flow
//
// Auth: regular session cookie. The HMAC token in the returned URLs is
// stable per user, so this endpoint is safe to call repeatedly — it just
// regenerates the same URLs.

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

    // Hand Google/Apple Calendar the canonical host. The request origin can be the
    // bare apex (mobile app + apex visitors), which Vercel 307-redirects to www and
    // calendar importers choke on — so canonicalize the apex origin to www.
    const baseUrl = canonicalCalendarBase(new URL(request.url).origin);
    const token = signCalendarToken(userId);
    const httpsUrl = `${baseUrl}/api/evaluator/calendar?token=${token}`;
    const webcalUrl = httpsUrl.replace(/^https?:/, "webcal:");
    const googleUrl = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(httpsUrl)}`;

    return NextResponse.json({ httpsUrl, webcalUrl, googleUrl });
  } catch (error) {
    console.error("Calendar link error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
