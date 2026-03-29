import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { emailWelcomeServiceProvider, emailWelcomeAssociation } from "@/lib/email";
import { createHash } from "node:crypto";

function hashPassword(p) { return createHash("sha256").update(p).digest("hex"); }
function tempPass() { return Math.random().toString(36).slice(-8) + "!A1"; }

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const organizations = await sql`SELECT * FROM organizations ORDER BY name`;

    const orgIds = organizations.map((o) => o.id);
    let stats = [];
    if (orgIds.length > 0) {
      stats = await sql`
        SELECT
          o.id,
          COUNT(DISTINCT ac.id) as age_categories_count,
          COUNT(DISTINCT a.id) as athletes_count,
          COUNT(DISTINCT CASE WHEN es.status IN ('scheduled', 'in_progress') THEN es.id END) as active_evaluations
        FROM organizations o
        LEFT JOIN age_categories ac ON ac.organization_id = o.id
        LEFT JOIN athletes a ON a.organization_id = o.id AND a.is_active = true
        LEFT JOIN evaluation_sessions es ON es.organization_id = o.id
        WHERE o.id = ANY(${orgIds})
        GROUP BY o.id
      `;
    }

    const enriched = organizations.map((org) => {
      const stat = stats.find((s) => s.id === org.id);
      return {
        ...org,
        age_categories_count: parseInt(stat?.age_categories_count) || 0,
        athletes_count: parseInt(stat?.athletes_count) || 0,
        active_evaluations: parseInt(stat?.active_evaluations) || 0,
      };
    });

    return NextResponse.json({ organizations: enriched });
  } catch (error) {
    console.error("GET organizations error:", error);
    return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const { name, type, contact_email, contact_name, contact_phone, address } = body;

    if (!name) return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
    if (!contact_email) return NextResponse.json({ error: "Contact email is required" }, { status: 400 });
    if (!type) return NextResponse.json({ error: "Type is required" }, { status: 400 });
    if (!["service_provider", "association"].includes(type)) {
      return NextResponse.json({ error: "Type must be service_provider or association" }, { status: 400 });
    }

    // Generate unique org code
    let orgCode = null;
    for (let i = 0; i < 10; i++) {
      const candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
      const existing = await sql`SELECT id FROM organizations WHERE org_code = ${candidate}`;
      if (!existing.length) { orgCode = candidate; break; }
    }

    const result = await sql`
      INSERT INTO organizations (name, type, contact_email, contact_name, contact_phone, address, org_code)
      VALUES (${name}, ${type}, ${contact_email}, ${contact_name || null}, ${contact_phone || null}, ${address || null}, ${orgCode})
      RETURNING *
    `;

    const org = result[0];

    // Create admin user account for the org if contact_email provided
    if (contact_email && contact_name) {
      const password = tempPass();
      try {
        const [authUser] = await sql`
          INSERT INTO auth_users (email, name, "emailVerified")
          VALUES (${contact_email}, ${contact_name}, NOW())
          ON CONFLICT (email) DO UPDATE SET name = ${contact_name}
          RETURNING *
        `;
        await sql`
          INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
          VALUES (${authUser.id}, 'credentials', 'credentials', ${contact_email}, ${hashPassword(password)})
          ON CONFLICT DO NOTHING
        `;
        const role = type === "service_provider" ? "service_provider_admin" : "association_admin";
        await sql`
          INSERT INTO users (email, name, role, organization_id)
          VALUES (${contact_email}, ${contact_name}, ${role}, ${org.id})
          ON CONFLICT (email) DO UPDATE SET role = ${role}, organization_id = ${org.id}
        `;

        // Send welcome email
        if (type === "service_provider") {
          await emailWelcomeServiceProvider({ name: contact_name, email: contact_email, tempPassword: password, orgName: name });
        } else {
          await emailWelcomeAssociation({ name: contact_name, email: contact_email, tempPassword: password, orgName: name });
        }
      } catch (emailErr) {
        console.error("User/email creation error:", emailErr);
      }
    }

    return NextResponse.json({ organization: org }, { status: 201 });
  } catch (error) {
    console.error("POST organizations error:", error);
    return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("id");
    if (!orgId) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Delete in safe order to avoid FK violations
    await sql`DELETE FROM evaluator_session_signups WHERE schedule_id IN (SELECT es.id FROM evaluation_schedule es JOIN age_categories ac ON ac.id = es.age_category_id WHERE ac.organization_id = ${orgId})`;
    await sql`DELETE FROM player_checkins WHERE schedule_id IN (SELECT es.id FROM evaluation_schedule es JOIN age_categories ac ON ac.id = es.age_category_id WHERE ac.organization_id = ${orgId})`;
    await sql`DELETE FROM checkin_sessions WHERE schedule_id IN (SELECT es.id FROM evaluation_schedule es JOIN age_categories ac ON ac.id = es.age_category_id WHERE ac.organization_id = ${orgId})`;
    await sql`DELETE FROM category_scores WHERE age_category_id IN (SELECT id FROM age_categories WHERE organization_id = ${orgId})`;
    await sql`DELETE FROM player_group_assignments WHERE session_group_id IN (SELECT sg.id FROM session_groups sg JOIN age_categories ac ON ac.id = sg.age_category_id WHERE ac.organization_id = ${orgId})`;
    await sql`DELETE FROM session_groups WHERE age_category_id IN (SELECT id FROM age_categories WHERE organization_id = ${orgId})`;
    await sql`DELETE FROM evaluation_schedule WHERE age_category_id IN (SELECT id FROM age_categories WHERE organization_id = ${orgId})`;
    await sql`DELETE FROM athletes WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM age_categories WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM evaluator_memberships WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM sp_association_links WHERE service_provider_id = ${orgId} OR association_id = ${orgId}`;
    await sql`DELETE FROM evaluator_join_codes WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM admin_invites WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM user_organization_roles WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM organizations WHERE id = ${orgId}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE organization error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
