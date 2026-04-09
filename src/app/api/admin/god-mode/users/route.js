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
    const adminUser = await requireSuperAdmin();
    if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name, email, phone, role, orgName } = await request.json();

    const user = await sql`
      INSERT INTO users (name, email, phone, role)
      VALUES (${name}, ${email}, ${phone || null}, ${role})
      RETURNING *
    `;

    await sql`INSERT INTO auth_users (email, name) VALUES (${email}, ${name}) ON CONFLICT (email) DO NOTHING`;

    const { hashPassword } = await import("@/lib/password");
    const tempPassword = Math.random().toString(36).slice(2, 10) + "A1!";
    const hashedPassword = await hashPassword(tempPassword);

    const authUser = await sql`SELECT id FROM auth_users WHERE email = ${email}`;
    if (authUser.length) {
      await sql`INSERT INTO auth_accounts ("userId", provider, password, type) VALUES (${authUser[0].id}, 'credentials', ${hashedPassword}, 'credentials') ON CONFLICT DO NOTHING`;
    }

    const org = orgName || "your organization";
    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const FROM = process.env.EMAIL_FROM || "noreply@sidelinestar.com";

    const roleLabels = {
      super_admin: "Super Admin",
      service_provider_admin: "Service Provider Admin",
      service_provider_evaluator: "Service Provider Evaluator",
      association_admin: "Association Admin",
      age_director: "Age Director",
      association_evaluator: "Association Evaluator",
      volunteer: "Volunteer",
    };

    const roleLabel = roleLabels[role] || role;

    if (process.env.RESEND_API_KEY) {
      const html = `<!DOCTYPE html>
      <html>
      <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
          <tr><td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:linear-gradient(135deg,#1A6BFF,#4D8FFF);padding:28px 40px;text-align:center;">
                  <div style="font-size:22px;font-weight:800;color:#ffffff;">Sideline Star</div>
                  <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:3px;">Athlete Evaluation Platform</div>
                </td>
              </tr>
              <tr><td style="padding:36px 40px;">
                <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Welcome to Sideline Star</h2>
                <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${name}</strong>, your account has been created with the role of <strong style="color:#111827;">${roleLabel}</strong>${org !== "your organization" ? ` for <strong style="color:#111827;">${org}</strong>` : ""}.</p>
                <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin:20px 0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;width:140px;">Email</td>
                      <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${email}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Temp Password</td>
                      <td style="padding:6px 0;font-size:13px;font-weight:600;">
                        <code style="background:#fff7f4;border:1px solid #fed7c3;padding:2px 8px;border-radius:6px;color:#1A6BFF;">${tempPassword}</code>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Role</td>
                      <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${roleLabel}</td>
                    </tr>
                  </table>
                </div>
                <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">Sign in and update your password to get started.</p>
                <a href="${BASE_URL}/account/signin" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#1A6BFF,#4D8FFF);color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">Sign In to Sideline Star</a>
              </td></tr>
              <tr>
                <td style="padding:16px 40px;border-top:1px solid #f3f4f6;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#9ca3af;">Sideline Star - sidelinestar.com</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>`;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: FROM,
          to: email,
          subject: `Welcome to Sideline Star - Your account is ready`,
          html,
        }),
      });
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
