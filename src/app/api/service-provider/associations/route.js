import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, resolveSpContext } from "@/lib/auth";

const SP_ADMIN = new Set(["service_provider_admin", "goalie_service_provider_admin", "super_admin"]);

// SP grants/revokes an association's ability to add its OWN (coach) evaluators.
// Scoped to the SP's own links (IDOR-safe).
export async function PATCH(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!SP_ADMIN.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { orgId: spId } = await resolveSpContext(session, new URL(request.url).searchParams.get("org"));
    if (!spId) return NextResponse.json({ error: "Not a service provider" }, { status: 403 });
    const body = await request.json();
    if (body.action !== "set_evaluator_access") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    const associationId = parseInt(body.association_id);
    const allow = !!body.allow;
    if (!associationId) return NextResponse.json({ error: "association_id required" }, { status: 400 });
    const res = await sql`
      UPDATE sp_association_links SET allow_association_evaluators = ${allow}
      WHERE service_provider_id = ${spId} AND association_id = ${associationId} RETURNING id`;
    if (!res.length) return NextResponse.json({ error: "Not one of your associations" }, { status: 403 });
    return NextResponse.json({ success: true, allow });
  } catch (error) {
    console.error("SP evaluator-access error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    // A goalie SP gets the same dashboard, scoped to goalies; a skater SP is unchanged.
    const { orgId: spId, isGoalie } = await resolveSpContext(session, searchParams.get("org"));
    if (!spId) return NextResponse.json({ error: "No service provider found for this user" }, { status: 403 });

    const spInfo = await sql`SELECT id, name, type, logo_url FROM organizations WHERE id = ${spId} LIMIT 1`;

    const associations = await sql`
      SELECT
        o.id, o.name, o.contact_email, o.contact_name, o.org_code, o.logo_url,
        sal.linked_at, sal.status,
        COUNT(DISTINCT ac.id) as age_categories,
        COUNT(DISTINCT a.id) FILTER (WHERE a.is_active = true AND ((${isGoalie}::boolean AND a.position = 'goalie') OR (NOT ${isGoalie}::boolean))) as athletes,
        COUNT(DISTINCT es.id) FILTER (WHERE es.scheduled_date >= CURRENT_DATE) as upcoming_sessions,
        COUNT(DISTINCT es.id) FILTER (WHERE es.scheduled_date >= CURRENT_DATE AND (
          SELECT COUNT(*) FROM evaluator_session_signups ess2
          WHERE ess2.schedule_id = es.id AND ess2.status = 'signed_up'
        ) < COALESCE(es.evaluators_required, 4) AND COALESCE((
          SELECT cs2.session_type FROM category_sessions cs2
          WHERE cs2.age_category_id = ac.id AND cs2.session_number = es.session_number LIMIT 1
        ), '') != 'testing') as needs_evaluators
      FROM sp_association_links sal
      JOIN organizations o ON o.id = sal.association_id
      LEFT JOIN age_categories ac ON ac.organization_id = o.id
      LEFT JOIN athletes a ON a.organization_id = o.id
      LEFT JOIN evaluation_schedule es ON es.age_category_id = ac.id
      WHERE sal.service_provider_id = ${spId}
      GROUP BY o.id, o.name, o.contact_email, o.contact_name, o.org_code, o.logo_url, sal.linked_at, sal.status
      ORDER BY o.name
    `;

    // Per-association "can add their own evaluators" grant — separate + resilient so
    // the dashboard doesn't break before the column migration is applied.
    let accessMap = {};
    try {
      const grants = await sql`SELECT association_id, allow_association_evaluators FROM sp_association_links WHERE service_provider_id = ${spId}`;
      for (const g of grants) accessMap[g.association_id] = !!g.allow_association_evaluators;
    } catch { /* pre-migration */ }
    for (const a of associations) a.allow_association_evaluators = !!accessMap[a.id];

    const evaluatorStats = await sql`
      SELECT COUNT(DISTINCT em.user_id) as total_evaluators
      FROM evaluator_memberships em
      WHERE em.organization_id = ${spId} AND em.status = 'active'
    `;

    return NextResponse.json({ sp: spInfo[0], associations, evaluatorStats: evaluatorStats[0] });
  } catch (error) {
    console.error("SP associations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Linking an SP to an ARBITRARY association would grant access to that
    // association's athletes/scores — so the standalone link is super-admin only.
    // The sanctioned SP flow (create a client) links atomically in POST /api/organizations.
    if (session.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { association_id } = await request.json();
    if (!association_id) return NextResponse.json({ error: "association_id required" }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const { orgId: spId } = await resolveSpContext(session, searchParams.get("org"));
    if (!spId) return NextResponse.json({ error: "No service provider found" }, { status: 403 });

    const existing = await sql`
      SELECT id FROM sp_association_links
      WHERE service_provider_id = ${spId} AND association_id = ${association_id}
    `;
    if (existing.length) return NextResponse.json({ success: true, message: "Already linked" });

    await sql`
      INSERT INTO sp_association_links (service_provider_id, association_id, status)
      VALUES (${spId}, ${association_id}, 'active')
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("SP link association error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
