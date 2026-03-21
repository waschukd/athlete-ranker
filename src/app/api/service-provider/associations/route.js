import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

async function getSpId(email) {
  // Try contact_email on organizations first
  const byContact = await sql`
    SELECT id FROM organizations
    WHERE contact_email = ${email} AND type = 'service_provider'
    LIMIT 1
  `;
  if (byContact.length) return byContact[0].id;

  // Fall back to evaluator_memberships
  const byMembership = await sql`
    SELECT em.organization_id as id
    FROM evaluator_memberships em
    JOIN organizations o ON o.id = em.organization_id
    JOIN users u ON u.id = em.user_id
    WHERE u.email = ${email} AND o.type = 'service_provider'
    LIMIT 1
  `;
  if (byMembership.length) return byMembership[0].id;
  return null;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const spId = await getSpId(session.email);
    if (!spId) return NextResponse.json({ error: "No service provider found for this user" }, { status: 403 });

    const spInfo = await sql`SELECT id, name FROM organizations WHERE id = ${spId} LIMIT 1`;

    const associations = await sql`
      SELECT
        o.id, o.name, o.contact_email, o.contact_name, o.org_code,
        sal.linked_at, sal.status,
        COUNT(DISTINCT ac.id) as age_categories,
        COUNT(DISTINCT a.id) FILTER (WHERE a.is_active = true) as athletes,
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
      GROUP BY o.id, o.name, o.contact_email, o.contact_name, o.org_code, sal.linked_at, sal.status
      ORDER BY o.name
    `;

    const evaluatorStats = await sql`
      SELECT COUNT(DISTINCT em.user_id) as total_evaluators
      FROM evaluator_memberships em
      WHERE em.organization_id = ${spId} AND em.status = 'active'
    `;

    return NextResponse.json({
      sp: spInfo[0],
      associations,
      evaluatorStats: evaluatorStats[0],
    });
  } catch (error) {
    console.error("SP associations error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { association_id } = await request.json();
    if (!association_id) return NextResponse.json({ error: "association_id required" }, { status: 400 });

    const spId = await getSpId(session.email);
    if (!spId) return NextResponse.json({ error: "No service provider found" }, { status: 403 });

    // Check if already linked
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
