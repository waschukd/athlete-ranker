import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    // Add membership. Capability rides on flags (one row per person per org). A
    // tester code grants tester capability; an evaluator code grants evaluator.
    // Re-using a code accumulates capability (OR) rather than overwriting.
    await sql`
      INSERT INTO evaluator_memberships (user_id, organization_id, role, status, joined_via, is_tester, is_evaluator)
      VALUES (${session.userId}, ${joinCode.organization_id}, ${isTesterCode ? "service_provider_tester" : "evaluator"}, 'active', 'join_code', ${isTesterCode}, ${!isTesterCode})
      ON CONFLICT (user_id, organization_id) DO UPDATE SET
        status = 'active',
        is_tester = evaluator_memberships.is_tester OR EXCLUDED.is_tester,
        is_evaluator = evaluator_memberships.is_evaluator OR EXCLUDED.is_evaluator
    `;

    // Give a new/association-only user a role that admits the dashboard route.
    await sql`
      UPDATE users SET role = ${isTesterCode ? "service_provider_tester" : "service_provider_evaluator"}
      WHERE id = ${session.userId} AND (role IS NULL OR role = 'association_evaluator')
    `;

    // Increment uses
    await sql`UPDATE evaluator_join_codes SET uses = uses + 1 WHERE id = ${joinCode.id}`;

    return NextResponse.json({
      success: true,
      message: `Joined ${joinCode.org_name} as a ${isTesterCode ? "tester" : "evaluator"}`,
      organization: { id: joinCode.organization_id, name: joinCode.org_name },
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
