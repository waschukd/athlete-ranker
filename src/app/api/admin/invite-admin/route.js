import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { createAndSendOrgInvite } from "@/lib/invites";

const INVITER_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin"]);

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!INVITER_ROLES.has(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { organization_id, email, name } = await request.json();

    if (!organization_id || !email) {
      return NextResponse.json({ error: "Organization and email required" }, { status: 400 });
    }

    const orgAuth = await authorizeOrgAccess(session, organization_id);
    if (!orgAuth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Get org details
    const orgs = await sql`SELECT * FROM organizations WHERE id = ${organization_id}`;
    if (!orgs.length) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    const org = orgs[0];

    const invite = await createAndSendOrgInvite({
      organizationId: organization_id,
      email,
      name,
      orgName: org.name,
      orgType: org.type,
    });

    return NextResponse.json({
      success: true,
      inviteUrl: invite.url,
      message: invite.message,
    });
  } catch (error) {
    console.error("Invite error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
