// Subscribe URLs for a category's schedule feed. Auth: session + category access.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { signScheduleToken, canonicalCalendarBase } from "@/lib/calendar-token";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const catId = new URL(request.url).searchParams.get("cat");
    if (!catId) return NextResponse.json({ error: "cat required" }, { status: 400 });
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const baseUrl = canonicalCalendarBase(new URL(request.url).origin);
    const token = signScheduleToken(catId);
    const httpsUrl = `${baseUrl}/api/association/calendar?token=${token}`;
    const webcalUrl = httpsUrl.replace(/^https?:/, "webcal:");
    const googleUrl = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(httpsUrl)}`;
    return NextResponse.json({ httpsUrl, webcalUrl, googleUrl });
  } catch (error) {
    console.error("Association calendar link error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
