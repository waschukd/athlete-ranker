import { requireSuperAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { emailWelcomeAssociation } from "@/lib/email";

function tempPass() {
  return Math.random().toString(36).slice(-8) + "!A1";
}

// GET: list signup requests for review. Defaults to pending.
export async function GET(request) {
  try {
    const admin = await requireSuperAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";

    const requests = await sql`
      SELECT * FROM signup_requests
      WHERE status = ${status}
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ requests });
  } catch (error) {
    console.error("GET signup-requests error:", error);
    return NextResponse.json({ error: "Failed to fetch signup requests" }, { status: 500 });
  }
}

// POST: review a pending request. action = "deny" | "approve".
export async function POST(request) {
  try {
    const admin = await requireSuperAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const adminId = admin.id;

    const { id, action } = await request.json();
    if (!id || !action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }

    if (action === "deny") {
      await sql`
        UPDATE signup_requests
        SET status = 'denied', reviewed_by = ${adminId}, reviewed_at = NOW()
        WHERE id = ${id} AND status = 'pending'
      `;
      return NextResponse.json({ success: true });
    }

    if (action === "approve") {
      const rows = await sql`
        SELECT * FROM signup_requests WHERE id = ${id} AND status = 'pending'
      `;
      if (!rows.length) {
        return NextResponse.json({ error: "Pending request not found" }, { status: 404 });
      }
      const req = rows[0];
      const name = req.association_name;
      const email = req.email;
      const contactName = req.contact_name || req.association_name;

      // --- Create the organization (reuse organizations POST pattern) ---
      let orgCode = null;
      for (let i = 0; i < 10; i++) {
        const candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
        const existing = await sql`SELECT id FROM organizations WHERE org_code = ${candidate}`;
        if (!existing.length) { orgCode = candidate; break; }
      }

      const orgResult = await sql`
        INSERT INTO organizations (name, type, contact_email, contact_name, contact_phone, address, org_code)
        VALUES (${name}, 'association', ${email}, ${contactName}, ${req.phone || null}, ${null}, ${orgCode})
        RETURNING *
      `;
      const org = orgResult[0];

      // --- Create the admin user (reuse god-mode org user-creation pattern) ---
      // org.contact_email == user.email grants admin access via authorize.js,
      // so no user_organization_roles row is needed.
      const password = tempPass();
      try {
        const [authUser] = await sql`
          INSERT INTO auth_users (email, name, "emailVerified")
          VALUES (${email}, ${contactName}, NOW())
          ON CONFLICT (email) DO UPDATE SET name = ${contactName}
          RETURNING *
        `;
        await sql`
          DELETE FROM auth_accounts WHERE "userId" = ${authUser.id} AND provider = 'credentials'
        `;
        await sql`
          INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
          VALUES (${authUser.id}, 'credentials', 'credentials', ${email}, ${await hashPassword(password)})
        `;
        await sql`
          INSERT INTO users (email, name, role)
          VALUES (${email}, ${contactName}, 'association_admin')
          ON CONFLICT (email) DO UPDATE SET role = 'association_admin'
        `;
        await emailWelcomeAssociation({ name: contactName, email, tempPassword: password, orgName: name });
      } catch (provisionErr) {
        // Best-effort: org is created; surface but don't fail the approval.
        console.error("Approve provisioning (user/email) error:", provisionErr);
      }

      await sql`
        UPDATE signup_requests
        SET status = 'approved', reviewed_by = ${adminId}, reviewed_at = NOW()
        WHERE id = ${id}
      `;

      return NextResponse.json({ success: true, organization: org });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST signup-requests error:", error);
    return NextResponse.json({ error: "Failed to process signup request" }, { status: 500 });
  }
}
