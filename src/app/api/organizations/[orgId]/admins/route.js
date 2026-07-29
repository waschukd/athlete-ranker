import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";

// Who has admin access to this organization — so the dashboard can show it near
// the top. Active admins = user_organization_roles admin rows + the org's own
// contact_email owner; pending = unaccepted admin_invites.
export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgId = parseInt(params.orgId, 10);
    if (!orgId) return NextResponse.json({ error: "Invalid organization" }, { status: 400 });
    const auth = await authorizeOrgAccess(session, orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const ADMIN_ROLES = ["association_admin", "service_provider_admin", "goalie_service_provider_admin"];

    // Linked admins (accepted invites / owners) via user_organization_roles.
    let linked = [];
    try {
      linked = await sql`
        SELECT DISTINCT u.name, u.email
        FROM user_organization_roles uor
        JOIN users u ON u.id = uor.user_id
        WHERE uor.organization_id = ${orgId} AND uor.role = ANY(${ADMIN_ROLES})`;
    } catch { linked = []; }

    // The org's own contact_email admin (the original owner) may predate the
    // user_organization_roles link — include them too.
    let owner = [];
    try {
      owner = await sql`
        SELECT u.name, u.email
        FROM organizations o JOIN users u ON u.email = o.contact_email
        WHERE o.id = ${orgId}`;
    } catch { owner = []; }

    const byEmail = new Map();
    for (const r of [...linked, ...owner]) {
      const email = (r.email || "").toLowerCase();
      if (email && !byEmail.has(email)) byEmail.set(email, { name: r.name || email, email, status: "active" });
    }

    // Pending invites not yet accepted.
    try {
      const pending = await sql`
        SELECT name, email FROM admin_invites
        WHERE organization_id = ${orgId} AND status = 'pending'`;
      for (const p of pending) {
        const email = (p.email || "").toLowerCase();
        if (email && !byEmail.has(email)) byEmail.set(email, { name: p.name || email, email, status: "pending" });
      }
    } catch { /* table may not exist */ }

    const admins = [...byEmail.values()].sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1) || String(a.name).localeCompare(String(b.name)));
    return NextResponse.json({ admins });
  } catch (error) {
    console.error("List admins error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
