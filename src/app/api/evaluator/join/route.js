import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // evaluator_memberships.user_id / users.id — NOT the JWT's auth_users id.
    const appUserId = await getAppUserId(session);
    if (!appUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { code } = await request.json();
    if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

    // Find valid join code
    const codes = await sql`
      SELECT ejc.*, o.name as org_name
      FROM evaluator_join_codes ejc
      JOIN organizations o ON o.id = ejc.organization_id
      WHERE UPPER(ejc.code) = UPPER(${code.trim()})
        AND (ejc.expires_at IS NULL OR ejc.expires_at > NOW())
        AND ejc.uses < ejc.max_uses
    `;

    if (!codes.length) {
      return NextResponse.json({ error: "Invalid or expired join code" }, { status: 400 });
    }

    const joinCode = codes[0];
    const isTesterCode = joinCode.role === "service_provider_tester";

    // A shared join code is self-serve → the membership is PENDING approval, same
    // as a new-account code signup (only direct email invites are pre-authorized).
    // Capability rides on flags (one row per person per org). On re-use, accumulate
    // capability (OR) and NEVER downgrade an already-active member back to pending.
    await sql`
      INSERT INTO evaluator_memberships (user_id, organization_id, role, status, joined_via, pending, is_tester, is_evaluator)
      VALUES (${appUserId}, ${joinCode.organization_id}, ${isTesterCode ? "service_provider_tester" : "evaluator"}, 'pending', 'join_code', true, ${isTesterCode}, ${!isTesterCode})
      ON CONFLICT (user_id, organization_id) DO UPDATE SET
        status = CASE WHEN evaluator_memberships.status = 'active' THEN 'active' ELSE 'pending' END,
        pending = CASE WHEN evaluator_memberships.status = 'active' THEN false ELSE true END,
        is_tester = evaluator_memberships.is_tester OR EXCLUDED.is_tester,
        is_evaluator = evaluator_memberships.is_evaluator OR EXCLUDED.is_evaluator
    `;

    // Give a new/association-only user a role that admits the dashboard route.
    await sql`
      UPDATE users SET role = ${isTesterCode ? "service_provider_tester" : "service_provider_evaluator"}
      WHERE id = ${appUserId} AND (role IS NULL OR role = 'association_evaluator')
    `;

    // Was this member already approved (active) before this join? If so, no wait.
    const [mem] = await sql`SELECT status FROM evaluator_memberships WHERE user_id = ${appUserId} AND organization_id = ${joinCode.organization_id}`;
    const nowActive = mem?.status === "active";

    await sql`UPDATE evaluator_join_codes SET uses = uses + 1 WHERE id = ${joinCode.id}`;

    return NextResponse.json({
      success: true,
      pending: !nowActive,
      message: nowActive
        ? `Joined ${joinCode.org_name} as a ${isTesterCode ? "tester" : "evaluator"}`
        : `Request sent to ${joinCode.org_name} — you'll get access once an admin approves you.`,
      organization: { id: joinCode.organization_id, name: joinCode.org_name },
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
