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
    const body = await request.json();
    const { organization_id } = body;
    if (!organization_id) return NextResponse.json({ error: "Organization required" }, { status: 400 });

    const orgAuth = await authorizeOrgAccess(session, organization_id);
    if (!orgAuth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Accept a single { email, name } or a batch { admins: [{name,email}] }.
    const list = Array.isArray(body.admins) ? body.admins : [{ name: body.name, email: body.email }];
    const seen = new Set();
    const dedup = [];
    for (const d of list) {
      const email = String(d?.email || "").trim().toLowerCase();
      const name = String(d?.name || "").trim();
      if (email && !seen.has(email)) { seen.add(email); dedup.push({ name, email }); }
    }
    if (!dedup.length) return NextResponse.json({ error: "At least one email required" }, { status: 400 });

    // Get org details
    const orgs = await sql`SELECT * FROM organizations WHERE id = ${organization_id}`;
    if (!orgs.length) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    const org = orgs[0];

    const results = [];
    for (const d of dedup) {
      try {
        const invite = await createAndSendOrgInvite({ organizationId: organization_id, email: d.email, name: d.name, orgName: org.name, orgType: org.type });
        results.push({ email: d.email, name: d.name, ok: true, url: invite.url });
      } catch (e) {
        console.error("Invite admin failed for " + d.email + ":", e?.message || e);
        results.push({ email: d.email, name: d.name, ok: false, error: e?.message || "failed" });
      }
    }
    const invited = results.filter(r => r.ok).length;
    const failed = results.length - invited;
    const message = failed
      ? `${invited} invited, ${failed} failed.`
      : `${invited} admin${invited === 1 ? "" : "s"} invited.`;
    return NextResponse.json({
      success: invited > 0,
      invited, failed, results, message,
      inviteUrl: results.length === 1 && results[0].ok ? results[0].url : undefined,
    });
  } catch (error) {
    console.error("Invite error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
