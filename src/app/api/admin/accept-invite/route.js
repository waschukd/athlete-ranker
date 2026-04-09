import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { signToken } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const invites = await sql`
    SELECT ai.*, o.name as org_name, o.type as org_type
    FROM admin_invites ai
    JOIN organizations o ON o.id = ai.organization_id
    WHERE ai.token = ${token} AND ai.status = 'pending' AND ai.expires_at > NOW()
  `;

  if (!invites.length) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
  }

  return NextResponse.json({ invite: invites[0] });
}

export async function POST(request) {
  try {
    const { token, password } = await request.json();
    if (!token || !password) {
      return NextResponse.json({ error: "Token and password required" }, { status: 400 });
    }

    const invites = await sql`
      SELECT ai.*, o.name as org_name
      FROM admin_invites ai
      JOIN organizations o ON o.id = ai.organization_id
      WHERE ai.token = ${token} AND ai.status = 'pending' AND ai.expires_at > NOW()
    `;

    if (!invites.length) {
      return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
    }

    const invite = invites[0];
    const hashedPassword = await hashPassword(password);

    // Create or update auth user
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

    // Create or update auth account
    const existingAccount = await sql`
      SELECT id FROM auth_accounts WHERE "providerAccountId" = ${invite.email} AND provider = 'credentials'
    `;
    if (existingAccount.length) {
      await sql`UPDATE auth_accounts SET password = ${hashedPassword} WHERE "providerAccountId" = ${invite.email} AND provider = 'credentials'`;
    } else {
      await sql`
        INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
        VALUES (${authUser.id}, 'credentials', 'credentials', ${invite.email}, ${hashedPassword})
      `;
    }

    // Create or update app user
    const existingAppUser = await sql`SELECT * FROM users WHERE email = ${invite.email}`;
    let appUser;
    if (existingAppUser.length) {
      await sql`UPDATE users SET name = ${invite.name || invite.email} WHERE email = ${invite.email}`;
      appUser = existingAppUser[0];
    } else {
      const [created] = await sql`
        INSERT INTO users (email, name, role)
        VALUES (${invite.email}, ${invite.name || invite.email}, 'association_admin')
        RETURNING *
      `;
      appUser = created;
    }

    // Link user to organization
    const existing = await sql`
      SELECT id FROM user_organization_roles WHERE user_id = ${appUser.id} AND organization_id = ${invite.organization_id}
    `;
    if (!existing.length) {
      await sql`
        INSERT INTO user_organization_roles (user_id, organization_id, role)
        VALUES (${appUser.id}, ${invite.organization_id}, 'association_admin')
      `;
    }

    // Mark invite as accepted
    await sql`UPDATE admin_invites SET status = 'accepted', accepted_at = NOW() WHERE token = ${token}`;

    // Sign them in
    const jwtToken = await signToken({
      userId: authUser.id,
      email: authUser.email,
      name: authUser.name,
      role: "association_admin",
    });

    const response = NextResponse.json({
      success: true,
      redirectTo: `/association/dashboard?org=${invite.organization_id}`,
    });

    response.cookies.set("auth-token", jwtToken, {
      httpOnly: true,
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
    });

    return response;
  } catch (error) {
    console.error("Accept invite error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
