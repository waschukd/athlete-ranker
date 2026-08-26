import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";

// Read-only: who is this association's designated lead(s), for display on its
// own dashboard (name + email so the association can reach them directly).
// Deliberately a separate, lighter check than /leads' canManageSessionAssignments
// gate -- an association's own in-house admin can be locked out of MANAGING
// staffing the moment an SP serves them, but must always be able to at least
// SEE who their point of contact is.
export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgId = parseInt(params.orgId, 10);
    if (!orgId) return NextResponse.json({ error: "Invalid organization" }, { status: 400 });
    const auth = await authorizeOrgAccess(session, orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const leads = await sql`
      SELECT u.id AS user_id, u.name, u.email
      FROM evaluator_memberships em
      JOIN users u ON u.id = em.user_id
      WHERE em.organization_id = ${orgId} AND em.status = 'active' AND em.is_lead = true
      ORDER BY u.name
    `;
    return NextResponse.json({ leads });
  } catch (error) {
    console.error("lead-contact GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
