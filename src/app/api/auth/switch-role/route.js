import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, getUserRoles, signToken, roleRedirect } from "@/lib/auth";

// Switch the active role on the session token. Validates server-side that the
// user actually holds the requested role (no privilege escalation), re-signs
// the token, and returns where to land for that role.
export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { role } = await request.json();
    if (!role) return NextResponse.json({ error: "role required" }, { status: 400 });

    const available = await getUserRoles(session.email);
    // The current active role is always allowed (covers super_admin etc.).
    if (role !== session.role && !available.includes(role)) {
      return NextResponse.json({ error: "You don't have that role" }, { status: 403 });
    }

    const orgRow = await sql`SELECT id FROM organizations WHERE contact_email = ${session.email} LIMIT 1`;
    const orgId = orgRow[0]?.id;

    const token = await signToken({
      userId: session.userId,
      email: session.email,
      name: session.name,
      role,
    });
    const res = NextResponse.json({ success: true, role, redirectTo: roleRedirect(role, orgId) });
    res.cookies.set("auth-token", token, {
      httpOnly: true,
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e) {
    console.error("switch-role error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
