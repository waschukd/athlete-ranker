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

    // Add membership
    await sql`
      INSERT INTO evaluator_memberships (user_id, organization_id, role, status, joined_via)
      VALUES (${session.userId}, ${joinCode.organization_id}, 'evaluator', 'active', 'join_code')
      ON CONFLICT (user_id, organization_id) DO UPDATE SET status = 'active'
    `;

    // Update user role if needed
    await sql`
      UPDATE users SET role = 'association_evaluator' WHERE id = ${session.userId} AND role = 'association_evaluator'
    `;

    // Increment uses
    await sql`UPDATE evaluator_join_codes SET uses = uses + 1 WHERE id = ${joinCode.id}`;

    return NextResponse.json({ 
      success: true, 
      message: `Joined ${joinCode.org_name} as an evaluator`,
      organization: { id: joinCode.organization_id, name: joinCode.org_name }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
