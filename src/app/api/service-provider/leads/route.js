import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, resolveSpOrgId } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { emailWelcomeAssociation } from "@/lib/email";

// Roles that may be upgraded to association_admin so the lead can reach the
// association dashboard. super_admin / service_provider_admin are left intact.
const UPGRADEABLE_ROLES = new Set([
  "association_evaluator",
  "service_provider_evaluator",
  "volunteer",
  "director",
]);

// Shared auth for all three handlers: 401 if no session, 403 if not an SP
// admin, then resolve the SP admin's own users.id.
async function spContext(request) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { searchParams } = new URL(request.url);
  // SKATER SPs only. Leads grants association_admin (full skater access), so a
  // goalie SP must never reach this — resolveSpOrgId only matches type='service_provider'.
  const sp_id = await resolveSpOrgId(session, searchParams.get("org"));
  if (!sp_id) return { error: NextResponse.json({ error: "Not a service provider" }, { status: 403 }) };
  const adminRes = await sql`SELECT id FROM users WHERE email = ${session.email} LIMIT 1`;
  return { session, sp_id, admin_id: adminRes[0]?.id, searchParams };
}

export async function GET(request) {
  try {
    const ctx = await spContext(request);
    if (ctx.error) return ctx.error;
    const { sp_id } = ctx;

    // Leads = users with user_organization_roles rows on this SP's linked
    // associations. Group by user, collect their associations.
    const rows = await sql`
      SELECT u.id as user_id, u.name, u.email, o.id as association_id, o.name as association_name
      FROM user_organization_roles uor
      JOIN users u ON u.id = uor.user_id
      JOIN organizations o ON o.id = uor.organization_id
      WHERE uor.organization_id IN (
        SELECT association_id FROM sp_association_links
        WHERE service_provider_id = ${sp_id} AND status = 'active'
      )
      ORDER BY u.name, o.name
    `;

    const byUser = new Map();
    for (const r of rows) {
      if (!byUser.has(r.user_id)) {
        byUser.set(r.user_id, { user_id: r.user_id, name: r.name, email: r.email, associations: [] });
      }
      byUser.get(r.user_id).associations.push({ id: r.association_id, name: r.association_name });
    }

    return NextResponse.json({ leads: [...byUser.values()] });
  } catch (error) {
    console.error("SP leads GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const ctx = await spContext(request);
    if (ctx.error) return ctx.error;
    const { sp_id } = ctx;

    const { email, name, association_ids } = await request.json();
    if (!email || !Array.isArray(association_ids) || association_ids.length === 0) {
      return NextResponse.json({ error: "email and a non-empty association_ids array are required" }, { status: 400 });
    }

    // SECURITY: every requested association must be actively linked to this SP.
    const linked = await sql`
      SELECT association_id FROM sp_association_links
      WHERE service_provider_id = ${sp_id} AND status = 'active'
    `;
    const linkedSet = new Set(linked.map((l) => l.association_id));
    const allOwned = association_ids.every((id) => linkedSet.has(id));
    if (!allOwned) {
      // Make NO writes when any association is not the SP's.
      return NextResponse.json({ error: "Not your association" }, { status: 403 });
    }

    // ── Find-or-create the user (mirrors god-mode users POST) ────────────────
    const authUser = await sql`SELECT id FROM auth_users WHERE email = ${email} LIMIT 1`;
    let userId;

    if (!authUser.length) {
      // Create auth_users + auth_accounts (hashed temp password) + users row.
      const tempPassword = Math.random().toString(36).slice(2, 10) + "A1!";
      const hashedPassword = await hashPassword(tempPassword);
      const safeName = name || email;

      const newAuth = await sql`
        INSERT INTO auth_users (email, name) VALUES (${email}, ${safeName})
        ON CONFLICT (email) DO UPDATE SET name = COALESCE(auth_users.name, ${safeName})
        RETURNING id
      `;
      await sql`
        INSERT INTO auth_accounts ("userId", provider, password, type)
        VALUES (${newAuth[0].id}, 'credentials', ${hashedPassword}, 'credentials')
        ON CONFLICT DO NOTHING
      `;
      const newUser = await sql`
        INSERT INTO users (name, email, role) VALUES (${safeName}, ${email}, 'association_admin')
        ON CONFLICT (email) DO UPDATE SET role = 'association_admin'
        RETURNING id, role
      `;
      userId = newUser[0].id;

      // Credentials email (no-op without RESEND_API_KEY; uses association welcome).
      try {
        await emailWelcomeAssociation({ name: safeName, email, tempPassword, orgName: "your association" });
      } catch (e) {
        console.error("SP leads welcome email failed:", e);
      }
    } else {
      // Existing user: upgrade role only when it's a non-admin role so they can
      // reach the association dashboard; never downgrade an admin.
      const existing = await sql`SELECT id, role FROM users WHERE email = ${email} LIMIT 1`;
      if (existing.length) {
        userId = existing[0].id;
        if (UPGRADEABLE_ROLES.has(existing[0].role)) {
          await sql`UPDATE users SET role = 'association_admin' WHERE id = ${userId}`;
        }
      } else {
        // auth_users exists but no app users row — create the app row.
        const newUser = await sql`
          INSERT INTO users (name, email, role) VALUES (${name || email}, ${email}, 'association_admin')
          ON CONFLICT (email) DO UPDATE SET role = 'association_admin'
          RETURNING id
        `;
        userId = newUser[0].id;
      }
    }

    // Grant scoped association_admin on each requested association.
    for (const association_id of association_ids) {
      await sql`
        INSERT INTO user_organization_roles (user_id, organization_id, role)
        VALUES (${userId}, ${association_id}, 'association_admin')
        ON CONFLICT DO NOTHING
      `;
    }

    return NextResponse.json({ success: true, count: association_ids.length });
  } catch (error) {
    console.error("SP leads POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const ctx = await spContext(request);
    if (ctx.error) return ctx.error;
    const { sp_id, searchParams } = ctx;

    const user_id = searchParams.get("user_id");
    const association_id = searchParams.get("association_id");
    if (!user_id || !association_id) {
      return NextResponse.json({ error: "user_id and association_id required" }, { status: 400 });
    }

    // SECURITY: the association must be linked to this SP.
    const link = await sql`
      SELECT association_id FROM sp_association_links
      WHERE service_provider_id = ${sp_id} AND association_id = ${association_id} AND status = 'active'
    `;
    if (!link.length) return NextResponse.json({ error: "Not your association" }, { status: 403 });

    await sql`
      DELETE FROM user_organization_roles
      WHERE user_id = ${user_id} AND organization_id = ${association_id}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("SP leads DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
