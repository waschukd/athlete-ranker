import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, resolveSpContext, getAppUserId } from "@/lib/auth";

// Tester management is SP-admin only. A tester resolves to the SP org via their
// membership, so we must gate on an admin role too, not just org resolution.
const ADMIN_ROLES = new Set(["service_provider_admin", "goalie_service_provider_admin", "super_admin"]);

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) { if (i === 3) c += "-"; c += chars[Math.floor(Math.random() * chars.length)]; }
  return c;
}

async function spGuard(request) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!ADMIN_ROLES.has(session.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const { searchParams } = new URL(request.url);
  const { orgId: spId } = await resolveSpContext(session, searchParams.get("org"));
  if (!spId) return { error: NextResponse.json({ error: "Not a service provider" }, { status: 403 }) };
  return { session, spId };
}

export async function GET(request) {
  try {
    const g = await spGuard(request);
    if (g.error) return g.error;
    const { spId } = g;
    const testers = await sql`
      SELECT u.id, u.name, u.email, em.created_at as joined_at, em.status, em.is_evaluator,
        COUNT(DISTINCT tss.id) FILTER (WHERE tss.status = 'signed_up') as upcoming_signups
      FROM evaluator_memberships em
      JOIN users u ON u.id = em.user_id
      LEFT JOIN tester_session_signups tss ON tss.user_id = u.id
      WHERE em.organization_id = ${spId} AND em.is_tester = true AND em.status != 'deleted'
      GROUP BY u.id, em.created_at, em.status, em.is_evaluator
      ORDER BY u.name
    `;
    const codes = await sql`
      SELECT id, code, max_uses, uses, created_at
      FROM evaluator_join_codes
      WHERE organization_id = ${spId} AND role = 'service_provider_tester'
      ORDER BY created_at DESC
    `;
    // Is the calling admin themselves a tester? (SP admins can run testing too.)
    const meRows = await sql`
      SELECT is_tester FROM evaluator_memberships
      WHERE user_id = (SELECT id FROM users WHERE email = ${g.session.email}) AND organization_id = ${spId}`;
    return NextResponse.json({ testers, codes, me: { is_tester: !!meRows[0]?.is_tester } });
  } catch (error) {
    console.error("Testers GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const g = await spGuard(request);
    if (g.error) return g.error;
    const { session, spId } = g;
    const adminId = await getAppUserId(session);
    const body = await request.json();
    const { action } = body;

    if (action === "generate_code") {
      let code = generateCode(), attempts = 0;
      while (attempts < 10) { const taken = await sql`SELECT id FROM evaluator_join_codes WHERE code = ${code}`; if (!taken.length) break; code = generateCode(); attempts++; }
      const [c] = await sql`
        INSERT INTO evaluator_join_codes (organization_id, code, max_uses, uses, created_by, role)
        VALUES (${spId}, ${code}, ${parseInt(body.max_uses) || 50}, 0, ${adminId}, 'service_provider_tester')
        RETURNING id, code, max_uses, uses, created_at`;
      return NextResponse.json({ success: true, code: c });
    }

    if (action === "deactivate_code") {
      await sql`UPDATE evaluator_join_codes SET max_uses = uses WHERE id = ${body.code_id} AND organization_id = ${spId} AND role = 'service_provider_tester'`;
      return NextResponse.json({ success: true });
    }

    // The SP admin adds/removes THEMSELVES as a tester (they run testing too).
    if (action === "set_self_tester") {
      const on = !!body.on;
      await sql`
        INSERT INTO evaluator_memberships (user_id, organization_id, role, status, joined_via, is_tester, is_evaluator)
        VALUES (${adminId}, ${spId}, 'service_provider_tester', 'active', 'self', ${on}, false)
        ON CONFLICT (user_id, organization_id) DO UPDATE SET is_tester = ${on}, status = 'active'`;
      return NextResponse.json({ success: true, is_tester: on });
    }

    // Approve a pending tester (signed up via the tester join code).
    if (action === "approve") {
      const tid = parseInt(body.tester_id);
      const mem = await sql`SELECT id FROM evaluator_memberships WHERE user_id = ${tid} AND organization_id = ${spId} AND is_tester = true`;
      if (!mem.length) return NextResponse.json({ error: "Not a tester of this SP" }, { status: 403 });
      await sql`UPDATE evaluator_memberships SET status = 'active', pending = false WHERE user_id = ${tid} AND organization_id = ${spId}`;
      await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value) VALUES (${adminId}, 'tester_approved', 'user', ${tid}, 'approved by SP')`;
      return NextResponse.json({ success: true });
    }

    // Promote a tester to ALSO be an evaluator (one-directional; keeps tester).
    if (action === "promote") {
      const tid = parseInt(body.tester_id);
      const mem = await sql`SELECT id FROM evaluator_memberships WHERE user_id = ${tid} AND organization_id = ${spId} AND is_tester = true`;
      if (!mem.length) return NextResponse.json({ error: "Not a tester of this SP" }, { status: 403 });
      await sql`UPDATE evaluator_memberships SET is_evaluator = true WHERE user_id = ${tid} AND organization_id = ${spId}`;
      await sql`UPDATE users SET role = 'service_provider_evaluator' WHERE id = ${tid} AND role IN ('service_provider_tester', 'association_evaluator')`;
      await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value) VALUES (${adminId}, 'tester_promoted', 'user', ${tid}, 'promoted to evaluator by SP')`;
      return NextResponse.json({ success: true });
    }

    // Remove tester capability. If they're also an evaluator, keep the row (drop the
    // tester flag); otherwise deactivate the membership.
    if (action === "remove") {
      const tid = parseInt(body.tester_id);
      const mem = await sql`SELECT is_evaluator FROM evaluator_memberships WHERE user_id = ${tid} AND organization_id = ${spId} AND is_tester = true`;
      if (!mem.length) return NextResponse.json({ error: "Not a tester of this SP" }, { status: 403 });
      if (mem[0].is_evaluator) {
        await sql`UPDATE evaluator_memberships SET is_tester = false WHERE user_id = ${tid} AND organization_id = ${spId}`;
      } else {
        await sql`UPDATE evaluator_memberships SET status = 'deleted', is_tester = false WHERE user_id = ${tid} AND organization_id = ${spId}`;
        await sql`UPDATE tester_session_signups SET status = 'cancelled' WHERE user_id = ${tid} AND status = 'signed_up'`;
      }
      await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value) VALUES (${adminId}, 'tester_removed', 'user', ${tid}, 'removed by SP')`;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Testers POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
