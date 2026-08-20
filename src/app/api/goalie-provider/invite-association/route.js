import crypto from "node:crypto";
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, resolveGoalieSpOrgId } from "@/lib/auth";
import { randomOrgCode } from "@/lib/random";
import { createAndSendOrgInvite } from "@/lib/invites";
import { emailGoalieSpConnectionRequest } from "@/lib/email";

// A goalie SP proactively reaching out to an association, by email, rather than
// waiting for the association to share a connect code. Two outcomes, chosen
// automatically by whether that email already has an association account:
//
//  - No existing account -> treated as a brand-new client, same as the SP
//    creating one from scratch: new "association" org, auto-linked (trusted,
//    it's the SP's own new client), invite emailed via the normal
//    accept-invite/set-password flow. Mirrors src/app/api/organizations/route.js
//    POST's goalie-SP branch -- duplicated rather than imported so this stays
//    fully isolated from that (already-working, skater-SP-shared) route.
//  - Existing account found -> NEVER auto-linked. A pending sp_connection_requests
//    row is created and an email is sent asking the EXISTING admin to sign in as
//    themselves and approve. Auto-linking on a typed-in email would let anyone
//    claim access to an org they don't own just by knowing its contact address.

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS sp_connection_requests (
      id SERIAL PRIMARY KEY,
      service_provider_id INTEGER NOT NULL REFERENCES organizations(id),
      association_id INTEGER NOT NULL REFERENCES organizations(id),
      invited_email TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      decided_at TIMESTAMPTZ
    )
  `;
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgParam = new URL(request.url).searchParams.get("org");
    const spId = await resolveGoalieSpOrgId(session, orgParam);
    if (!spId) return NextResponse.json({ error: "Not a goalie service provider" }, { status: 403 });

    const { email, name, org_name } = await request.json();
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) return NextResponse.json({ error: "An email address is required." }, { status: 400 });

    const [sp] = await sql`SELECT id, name FROM organizations WHERE id = ${spId}`;

    // Does an association already exist for this email? Same two identity paths
    // authorizeOrgAccess checks: the org's own contact_email, or a secondary
    // admin's user_organization_roles row.
    const [byContact] = await sql`SELECT id, name, contact_email FROM organizations WHERE type = 'association' AND lower(contact_email) = ${cleanEmail} LIMIT 1`;
    let existingAssoc = byContact || null;
    if (!existingAssoc) {
      const [byRole] = await sql`
        SELECT o.id, o.name, o.contact_email FROM organizations o
        JOIN user_organization_roles uor ON uor.organization_id = o.id
        JOIN users u ON u.id = uor.user_id
        WHERE o.type = 'association' AND lower(u.email) = ${cleanEmail} LIMIT 1
      `;
      existingAssoc = byRole || null;
    }

    if (existingAssoc) {
      await ensureTable();
      const [already] = await sql`
        SELECT id FROM sp_association_links WHERE service_provider_id = ${spId} AND association_id = ${existingAssoc.id} AND status = 'active'
      `;
      if (already) return NextResponse.json({ ok: true, outcome: "already_linked", association: { name: existingAssoc.name } });

      const [pending] = await sql`
        SELECT id FROM sp_connection_requests WHERE service_provider_id = ${spId} AND association_id = ${existingAssoc.id} AND status = 'pending'
      `;
      const token = crypto.randomBytes(32).toString("hex");
      if (pending) {
        await sql`UPDATE sp_connection_requests SET token = ${token}, created_at = NOW() WHERE id = ${pending.id}`;
      } else {
        await sql`INSERT INTO sp_connection_requests (service_provider_id, association_id, invited_email, token) VALUES (${spId}, ${existingAssoc.id}, ${cleanEmail}, ${token})`;
      }

      const base = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";
      const result = await emailGoalieSpConnectionRequest({
        email: cleanEmail, name, spName: sp?.name || "A goalie service provider",
        respondUrl: `${base}/goalie-connect/respond?token=${token}`,
      });
      return NextResponse.json({
        ok: true, outcome: "request_sent", association: { name: existingAssoc.name },
        sent: !!result?.ok,
        message: result?.ok ? `Connection request sent to ${cleanEmail}.` : "Couldn't send the email — the association already has an account, so ask them to check their org code instead.",
      });
    }

    // No existing account for this email -- treat as a brand-new client, mirroring
    // src/app/api/organizations/route.js POST's goalie-SP branch.
    if (!org_name || !org_name.trim()) {
      return NextResponse.json({ ok: true, outcome: "needs_org_name" });
    }
    let orgCode = null;
    for (let i = 0; i < 10; i++) {
      const candidate = randomOrgCode();
      const existing = await sql`SELECT id FROM organizations WHERE org_code = ${candidate}`;
      if (!existing.length) { orgCode = candidate; break; }
    }
    const [org] = await sql`
      INSERT INTO organizations (name, type, contact_email, contact_name, org_code)
      VALUES (${org_name.trim()}, 'association', ${cleanEmail}, ${name || null}, ${orgCode})
      RETURNING *
    `;
    await sql`INSERT INTO sp_association_links (service_provider_id, association_id, status) VALUES (${spId}, ${org.id}, 'active')`;
    await sql`UPDATE organizations SET goalie_eval_mode = 'goalie_service_provider' WHERE id = ${org.id}`;

    let invite = null;
    try {
      invite = await createAndSendOrgInvite({ organizationId: org.id, email: cleanEmail, name, orgName: org.name, orgType: "association" });
    } catch (e) { console.error("goalie invite-association: org invite error", e?.message); }

    return NextResponse.json({ ok: true, outcome: "created", association: { name: org.name }, sent: !!invite?.sent, message: invite?.message });
  } catch (e) {
    console.error("goalie invite-association POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
