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
import { signCalendarToken } from "@/lib/calendar-token";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userRow = await sql`SELECT id FROM users WHERE email = ${session.email}`;
    const userId = userRow[0]?.id;
    if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Use the request's own origin instead of NEXT_PUBLIC_BASE_URL so the URL
    // we hand to Google/Apple Calendar is the canonical host. Vercel
    // 307-redirects bare sidelinestar.com → www.sidelinestar.com, and
    // Google's calendar importer chokes on that cross-host redirect.
    const baseUrl = new URL(request.url).origin;
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
