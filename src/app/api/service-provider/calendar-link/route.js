// Returns the SP's master-schedule subscribe URLs (https / webcal / Google
// add-by-URL). Auth: session cookie, scoped to the caller's SP org. The HMAC
// token is stable per org, so this is safe to call repeatedly.

import { NextResponse } from "next/server";
import { getSession, resolveSpContext } from "@/lib/auth";
import { signSpCalendarToken, canonicalCalendarBase } from "@/lib/calendar-token";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { orgId: spId } = await resolveSpContext(session, new URL(request.url).searchParams.get("org"));
    if (!spId) return NextResponse.json({ error: "No service provider found" }, { status: 403 });

    const baseUrl = canonicalCalendarBase(new URL(request.url).origin);
    const token = signSpCalendarToken(spId);
    const httpsUrl = `${baseUrl}/api/service-provider/calendar?token=${token}`;
    const webcalUrl = httpsUrl.replace(/^https?:/, "webcal:");
    const googleUrl = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(httpsUrl)}`;
    return NextResponse.json({ httpsUrl, webcalUrl, googleUrl });
  } catch (error) {
    console.error("SP calendar link error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
