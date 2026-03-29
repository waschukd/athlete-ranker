import { requireSuperAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(request) {
  try {
    const adminUser = await requireSuperAdmin(); if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const roleFilter = searchParams.get("role");
    const users = roleFilter
      ? await sql`
          SELECT u.*,
            o.name as org_name,
            o.type as org_type,
            COUNT(DISTINCT ea.id) as total_assignments
          FROM users u
          LEFT JOIN organizations o ON o.contact_email = u.email
          LEFT JOIN evaluator_memberships em ON em.user_id = u.id
          LEFT JOIN evaluator_assignments ea ON ea.user_id = u.id
          WHERE u.role = ${roleFilter}
          GROUP BY u.id, o.name, o.type ORDER BY u.created_at DESC
        `
      : await sql`
          SELECT u.*,
            o.name as org_name,
            o.type as org_type,
            COUNT(DISTINCT ea.id) as total_assignments
          FROM users u
          LEFT JOIN organizations o ON o.contact_email = u.email
          LEFT JOIN evaluator_assignments ea ON ea.user_id = u.id
          GROUP BY u.id, o.name, o.type ORDER BY u.created_at DESC
        `;
    const stats = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE role = 'super_admin') as super_admins,
        COUNT(*) FILTER (WHERE role IN ('service_provider_admin', 'service_provider_evaluator')) as service_providers,
        COUNT(*) FILTER (WHERE role IN ('association_admin', 'age_director', 'association_evaluator')) as associations,
        COUNT(*) FILTER (WHERE role = 'volunteer') as volunteers,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as new_this_week
      FROM users
    `;
    return NextResponse.json({
      users: users.map((u) => ({
        ...u,
        organization_count: parseInt(u.organization_count) || 0,
        total_assignments: parseInt(u.total_assignments) || 0,
      })),
      stats: stats[0],
    });
  } catch (error) {
    console.error("GET users error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const adminUser = await requireSuperAdmin(); if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { name, email, phone, role, orgName } = await request.json();
    const user = await sql`
      INSERT INTO users (name, email, phone, role)
      VALUES (${name}, ${email}, ${phone || null}, ${role})
      RETURNING *
    `;
    await sql`INSERT INTO auth_users (email, name) VALUES (${email}, ${name}) ON CONFLICT (email) DO NOTHING`;
    const { createHash } = await import("node:crypto");
    const tempPassword = Math.random().toString(36).slice(2, 10) + "A1!";
    const hashedPassword = createHash("sha256").update(tempPassword).digest("hex");
    const authUser = await sql`SELECT id FROM auth_users WHERE email = ${email}`;
    if (authUser.length) {
      await sql`INSERT INTO auth_accounts ("userId", provider, password, type) VALUES (${authUser[0].id}, 'credentials', ${hashedPassword}, 'credentials') ON CONFLICT DO NOTHING`;
    }
    const { emailWelcomeServiceProvider, emailWelcomeAssociation } = await import("@/lib/email");
    if (role === "service_provider_admin") {
      await emailWelcomeServiceProvider({ name, email, tempPassword, orgName: orgName || "your organization" });
    } else if (role === "association_admin") {
      await emailWelcomeAssociation({ name, email, tempPassword, orgName: orgName || "your organization" });
    }
    return NextResponse.json({ user: user[0] }, { status: 201 });
  } catch (error) {
    console.error("POST user error:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const adminUser = await requireSuperAdmin(); if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    await sql`DELETE FROM users WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const { action } = await request.json();
    if (action === "suspend") {
      await sql`UPDATE users SET is_suspended = true, updated_at = NOW() WHERE id = ${id}`;
    } else if (action === "unsuspend") {
      await sql`UPDATE users SET is_suspended = false, updated_at = NOW() WHERE id = ${id}`;
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}