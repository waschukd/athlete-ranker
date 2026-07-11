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

    // Validate strictly against the roles the user currently holds (getUserRoles
    // includes their base users.role). No "current role is always allowed" bypass,
    // so a stale token can't re-affirm a role that was revoked in the DB.
    const available = await getUserRoles(session.email);
    if (!available.includes(role)) {
      return NextResponse.json({ error: "You don't have that role" }, { status: 403 });
    }

    // Land on an org that MATCHES the target role's type — a user can own both an
    // association and an SP (e.g. a goalie SP admin who also admins a goalie-only
    // association), so a blind "first org by email" would drop an Association switch
    // onto their SP org (not an association) and render an empty dashboard.
    const userRow = await sql`SELECT id FROM users WHERE email = ${session.email}`;
    const uid = userRow[0]?.id;
    let orgId = null;
    if (role === "association_admin") {
      const rows = await sql`
        SELECT o.id FROM organizations o
        WHERE o.type = 'association' AND (
          o.contact_email = ${session.email}
          OR EXISTS (SELECT 1 FROM user_organization_roles uor WHERE uor.organization_id = o.id AND uor.user_id = ${uid})
        ) ORDER BY o.id LIMIT 1`;
      orgId = rows[0]?.id;
    } else if (role === "service_provider_admin" || role === "goalie_service_provider_admin") {
      const type = role === "goalie_service_provider_admin" ? "goalie_service_provider" : "service_provider";
      const rows = await sql`
        SELECT o.id FROM organizations o
        WHERE o.type = ${type} AND (
          o.contact_email = ${session.email}
          OR EXISTS (SELECT 1 FROM user_organization_roles uor WHERE uor.organization_id = o.id AND uor.user_id = ${uid})
        ) ORDER BY o.id LIMIT 1`;
      orgId = rows[0]?.id;
    } else {
      const orgRow = await sql`SELECT id FROM organizations WHERE contact_email = ${session.email} LIMIT 1`;
      orgId = orgRow[0]?.id;
    }

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
