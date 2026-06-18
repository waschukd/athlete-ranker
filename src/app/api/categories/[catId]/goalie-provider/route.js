import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { createAndSendOrgInvite } from "@/lib/invites";

// Goalie-provider picker for the category setup (Goalie Scoring step, option C).
// Lists existing goalie SPs to search/select, links one to this category's
// association, or creates + invites a new goalie SP and links it.

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const providers = await sql`
      SELECT id, name, contact_email FROM organizations
      WHERE type = 'goalie_service_provider' ORDER BY name`;
    // Which goalie SP (if any) is already linked to this association
    const linked = await sql`
      SELECT o.id, o.name FROM sp_association_links sal
      JOIN organizations o ON o.id = sal.service_provider_id AND o.type = 'goalie_service_provider'
      WHERE sal.association_id = ${auth.orgId} AND sal.status = 'active'
      LIMIT 1`;
    return NextResponse.json({ providers, linked: linked[0] || null });
  } catch (e) {
    console.error("goalie-provider GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const associationId = auth.orgId;

    const body = await request.json();

    // Link an existing goalie SP to this association.
    if (body.action === "link") {
      const spId = parseInt(body.goalie_sp_id);
      if (!spId) return NextResponse.json({ error: "goalie_sp_id required" }, { status: 400 });
      const sp = await sql`SELECT id FROM organizations WHERE id = ${spId} AND type = 'goalie_service_provider'`;
      if (!sp.length) return NextResponse.json({ error: "Not a goalie service provider" }, { status: 400 });
      const existing = await sql`SELECT id FROM sp_association_links WHERE service_provider_id = ${spId} AND association_id = ${associationId}`;
      if (!existing.length) {
        await sql`INSERT INTO sp_association_links (service_provider_id, association_id, status) VALUES (${spId}, ${associationId}, 'active')`;
      } else {
        await sql`UPDATE sp_association_links SET status = 'active' WHERE id = ${existing[0].id}`;
      }
      return NextResponse.json({ success: true, goalie_sp_id: spId });
    }

    // Create + invite a new goalie SP, then link it.
    if (body.action === "invite") {
      const name = (body.name || "").trim();
      const email = (body.email || "").trim();
      if (!name || !email) return NextResponse.json({ error: "Company name and contact email are required" }, { status: 400 });

      let orgCode = null;
      for (let i = 0; i < 10; i++) {
        const candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
        const exists = await sql`SELECT id FROM organizations WHERE org_code = ${candidate}`;
        if (!exists.length) { orgCode = candidate; break; }
      }
      const [org] = await sql`
        INSERT INTO organizations (name, type, contact_email, org_code)
        VALUES (${name}, 'goalie_service_provider', ${email}, ${orgCode}) RETURNING *`;
      await sql`INSERT INTO sp_association_links (service_provider_id, association_id, status) VALUES (${org.id}, ${associationId}, 'active')`;

      let invite = null;
      try {
        invite = await createAndSendOrgInvite({ organizationId: org.id, email, name: null, orgName: name, orgType: "goalie_service_provider" });
      } catch (e) {
        console.error("goalie SP invite error:", e);
        invite = { sent: false, url: null, message: "Created, but the invite link could not be generated." };
      }
      return NextResponse.json({ success: true, goalie_sp_id: org.id, name: org.name, invite });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("goalie-provider POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
