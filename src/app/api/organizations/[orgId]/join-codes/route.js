import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { emailEvaluatorApproved, emailEvaluatorDenied, emailEvaluatorPendingApproval } from "@/lib/email";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    if (i === 3) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function GET(request, { params }) {
  try {
    const { orgId } = params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const codes = await sql`
      SELECT ejc.*, 
        (SELECT COUNT(*) FROM evaluator_memberships em WHERE em.organization_id = ejc.organization_id AND em.pending = true) as pending_count
      FROM evaluator_join_codes ejc
      WHERE ejc.organization_id = ${orgId}
      ORDER BY ejc.created_at DESC
    `;

    // Also get pending evaluators
    const pending = await sql`
      SELECT u.id, u.name, u.email, u.evaluator_id, u.role,
        em.created_at as applied_at, em.id as membership_id
      FROM evaluator_memberships em
      JOIN users u ON u.id = em.user_id
      WHERE em.organization_id = ${orgId} AND em.pending = true
      ORDER BY em.created_at DESC
    `;

    return NextResponse.json({ codes, pending });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { orgId } = params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await sql`SELECT id FROM users WHERE email = ${session.email}`;
    if (!user.length) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user[0].id;

    const body = await request.json();
    const { action } = body;

    if (action === "generate") {
      // Generate unique code
      let code = generateCode();
      let attempts = 0;
      while (attempts < 10) {
        const taken = await sql`SELECT id FROM evaluator_join_codes WHERE code = ${code}`;
        if (!taken.length) break;
        code = generateCode();
        attempts++;
      }

      const [newCode] = await sql`
        INSERT INTO evaluator_join_codes (organization_id, code, max_uses, uses, created_by)
        VALUES (${orgId}, ${code}, ${body.max_uses || 100}, 0, ${userId})
        RETURNING *
      `;

      return NextResponse.json({ success: true, code: newCode });
    }

    if (action === "deactivate") {
      await sql`
        UPDATE evaluator_join_codes SET max_uses = uses WHERE id = ${body.code_id}
      `;
      return NextResponse.json({ success: true });
    }

    if (action === "approve") {
      // Approve pending evaluator
      await sql`
        UPDATE evaluator_memberships SET pending = false, status = 'active'
        WHERE id = ${body.membership_id}
      `;

      // Notify evaluator
      const evalUser = await sql`SELECT email, name, evaluator_id FROM users WHERE id = ${body.user_id}`;
      const org = await sql`SELECT name FROM organizations WHERE id = ${orgId}`;

      if (evalUser.length) {
        await emailEvaluatorApproved({
          name: evalUser[0].name,
          email: evalUser[0].email,
          orgName: org[0]?.name || "your organization",
          evaluatorId: evalUser[0].evaluator_id || "",
        });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "deny") {
      // Get evaluator info before deleting
      const membership = await sql`
        SELECT em.user_id, u.name, u.email, o.name as org_name
        FROM evaluator_memberships em
        JOIN users u ON u.id = em.user_id
        JOIN organizations o ON o.id = em.organization_id
        WHERE em.id = ${body.membership_id}
      `;
      await sql`
        DELETE FROM evaluator_memberships WHERE id = ${body.membership_id}
      `;
      // Notify the evaluator they were denied
      if (membership.length) {
        await emailEvaluatorDenied({
          name: membership[0].name,
          email: membership[0].email,
          orgName: membership[0].org_name,
        });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
