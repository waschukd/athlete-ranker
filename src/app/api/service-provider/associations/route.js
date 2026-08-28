import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, resolveSpContext } from "@/lib/auth";

const SP_ADMIN = new Set(["service_provider_admin", "goalie_service_provider_admin", "super_admin"]);

// Scoped to the SP's own links (IDOR-safe).
export async function PATCH(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!SP_ADMIN.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { orgId: spId } = await resolveSpContext(session, new URL(request.url).searchParams.get("org"));
    if (!spId) return NextResponse.json({ error: "Not a service provider" }, { status: 403 });
    const body = await request.json();
    const associationId = parseInt(body.association_id);
    if (!associationId) return NextResponse.json({ error: "association_id required" }, { status: 400 });

    // Set this association's colour on the SP master schedule.
    if (body.action === "set_schedule_color") {
      const color = typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : null;
      const res = await sql`
        UPDATE sp_association_links SET schedule_color = ${color}
        WHERE service_provider_id = ${spId} AND association_id = ${associationId} RETURNING id`;
      if (!res.length) return NextResponse.json({ error: "Not one of your associations" }, { status: 403 });
      return NextResponse.json({ success: true, color });
    }

    // Grant/revoke an association's own control over their report price and
    // purchasing switch. Off by default and nobody can self-serve it -- only
    // the SP flips this, from here. Revoking leaves any custom price they'd
    // set in place (harmless — resolveReportPrice ignores it while not
    // granted) so re-granting later doesn't require them to re-enter it.
    if (body.action === "set_report_control") {
      const linked = await sql`
        SELECT 1 FROM sp_association_links
        WHERE service_provider_id = ${spId} AND association_id = ${associationId} LIMIT 1`;
      if (!linked.length) return NextResponse.json({ error: "Not one of your associations" }, { status: 403 });
      const granted = body.granted === true;
      await sql`UPDATE organizations SET report_control_granted = ${granted} WHERE id = ${associationId}`;
      return NextResponse.json({ success: true, granted });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("SP associations PATCH error:", error);
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
        o.report_control_granted, o.custom_report_price_cents,
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
      GROUP BY o.id, o.name, o.contact_email, o.contact_name, o.org_code, o.logo_url,
               o.report_control_granted, o.custom_report_price_cents, sal.linked_at, sal.status
      ORDER BY o.name
    `;

    const colorMap = {};
    const grants = await sql`SELECT association_id, schedule_color FROM sp_association_links WHERE service_provider_id = ${spId}`;
    for (const g of grants) { colorMap[g.association_id] = g.schedule_color || null; }
    for (const a of associations) { a.schedule_color = colorMap[a.id] || null; }

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
