import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import { createAndSendOrgInvite } from "@/lib/invites";

// An association invites a Goalie Service Provider: creates the goalie SP org,
// links it to the association, and emails the accept-invite link (existing flow).
export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { association_id, name, email } = await request.json();
    if (!association_id || !name || !email) {
      return NextResponse.json({ error: "association_id, name and email are required" }, { status: 400 });
    }
    const auth = await authorizeOrgAccess(session, association_id);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Create the goalie SP org
    let orgCode = null;
    for (let i = 0; i < 10; i++) {
      const candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
      const exists = await sql`SELECT id FROM organizations WHERE org_code = ${candidate}`;
      if (!exists.length) { orgCode = candidate; break; }
    }
    const [org] = await sql`
      INSERT INTO organizations (name, type, contact_email, org_code)
      VALUES (${name}, 'goalie_service_provider', ${email}, ${orgCode})
      RETURNING *`;

    // Link to the inviting association
    await sql`
      INSERT INTO sp_association_links (service_provider_id, association_id, status)
      VALUES (${org.id}, ${association_id}, 'active')`;

    let invite = null;
    try {
      invite = await createAndSendOrgInvite({
        organizationId: org.id, email, name, orgName: name, orgType: "goalie_service_provider",
      });
    } catch (e) {
      console.error("goalie SP invite error:", e);
      invite = { sent: false, url: null, message: "Provider created, but the invite could not be generated." };
    }
    return NextResponse.json({ organization: org, invite }, { status: 201 });
  } catch (e) {
    console.error("goalie-provider invite error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
