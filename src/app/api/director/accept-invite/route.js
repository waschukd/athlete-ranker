import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { signToken } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

// Same click-a-link-set-your-password flow as /api/admin/accept-invite, for
// the director role -- which is scoped to specific age_categories (via
// director_assignments) rather than a whole organization.

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const invites = await sql`
    SELECT di.*, o.name AS org_name
    FROM director_invites di
    JOIN organizations o ON o.id = di.organization_id
    WHERE di.token = ${token} AND di.status = 'pending' AND di.expires_at > NOW()
  `;
  if (!invites.length) return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });

  const invite = invites[0];
  const cats = await sql`SELECT name FROM age_categories WHERE id = ANY(${invite.category_ids})`;
  return NextResponse.json({ invite: { ...invite, category_names: cats.map(c => c.name) } });
}

export async function POST(request) {
  try {
    const { token, password } = await request.json();
    if (!token || !password) return NextResponse.json({ error: "Token and password required" }, { status: 400 });

    const invites = await sql`
      SELECT di.*, o.name AS org_name
      FROM director_invites di
      JOIN organizations o ON o.id = di.organization_id
      WHERE di.token = ${token} AND di.status = 'pending' AND di.expires_at > NOW()
    `;
    if (!invites.length) return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
    const invite = invites[0];
    const hashedPassword = await hashPassword(password);

    const existingAuthUser = await sql`SELECT * FROM auth_users WHERE email = ${invite.email}`;
    let authUser;
    if (existingAuthUser.length) {
      await sql`UPDATE auth_users SET name = ${invite.name || invite.email} WHERE email = ${invite.email}`;
      authUser = existingAuthUser[0];
    } else {
      const [created] = await sql`
        INSERT INTO auth_users (email, name, "emailVerified")
        VALUES (${invite.email}, ${invite.name || invite.email}, NOW())
        RETURNING *
      `;
      authUser = created;
    }

    // Update-in-place, never a second INSERT -- a duplicate credentials row
    // here is exactly what left another director locked out (login reading
    // whichever stale row came back first).
    const existingAccount = await sql`SELECT id FROM auth_accounts WHERE "userId" = ${authUser.id} AND provider = 'credentials'`;
    if (existingAccount.length) {
      await sql`UPDATE auth_accounts SET password = ${hashedPassword} WHERE id = ${existingAccount[0].id}`;
    } else {
      await sql`
        INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
        VALUES (${authUser.id}, 'credentials', 'credentials', ${invite.email}, ${hashedPassword})
      `;
    }

    // Director never outranks an existing elevated role -- only ever upgrades
    // someone with no role yet, matching the guard in admin/accept-invite.
    const existingAppUser = await sql`SELECT * FROM users WHERE email = ${invite.email}`;
    let appUser;
    if (existingAppUser.length) {
      await sql`UPDATE users SET name = ${invite.name || invite.email},
        role = CASE WHEN role IN ('super_admin','association_admin','service_provider_admin','goalie_service_provider_admin') THEN role ELSE 'director' END
        WHERE email = ${invite.email}`;
      appUser = existingAppUser[0];
    } else {
      const [created] = await sql`
        INSERT INTO users (email, name, role)
        VALUES (${invite.email}, ${invite.name || invite.email}, 'director')
        RETURNING *
      `;
      appUser = created;
    }

    for (const catId of invite.category_ids) {
      await sql`
        INSERT INTO director_assignments (user_id, age_category_id, organization_id, status)
        VALUES (${appUser.id}, ${catId}, ${invite.organization_id}, 'active')
        ON CONFLICT (user_id, age_category_id) DO UPDATE SET status = 'active'
      `;
    }

    await sql`UPDATE director_invites SET status = 'accepted', accepted_at = NOW() WHERE token = ${token}`;

    const role = appUser.role === "super_admin" ? "super_admin"
      : ["association_admin", "service_provider_admin", "goalie_service_provider_admin"].includes(appUser.role) ? appUser.role
      : "director";
    const jwtToken = await signToken({ userId: authUser.id, email: authUser.email, name: authUser.name, role });

    const response = NextResponse.json({ success: true, redirectTo: "/director/dashboard" });
    response.cookies.set("auth-token", jwtToken, {
      httpOnly: true, path: "/", maxAge: 7 * 24 * 60 * 60, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    console.error("Director accept-invite error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
