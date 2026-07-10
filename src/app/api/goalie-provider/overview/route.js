import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, resolveGoalieSpOrgId } from "@/lib/auth";

// Overview for a Goalie Service Provider: the associations linked to them and,
// per association, each category's goalie count. Scoped to goalies only.
export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgParam = new URL(request.url).searchParams.get("org");
    let spId = await resolveGoalieSpOrgId(session, orgParam);
    // God can view any goalie SP's overview, even when they aren't its admin. The
    // link from an association card passes the ASSOCIATION id, so for a super_admin
    // resolve the goalie SP from that association's active link.
    if (!spId && session.role === "super_admin" && orgParam) {
      const link = await sql`
        SELECT sal.service_provider_id FROM sp_association_links sal
        JOIN organizations sp ON sp.id = sal.service_provider_id AND sp.type = 'goalie_service_provider'
        WHERE sal.association_id = ${orgParam} AND sal.status = 'active' LIMIT 1`;
      spId = link[0]?.service_provider_id || null;
    }
    if (!spId) return NextResponse.json({ error: "Not a goalie service provider" }, { status: 403 });

    const sp = (await sql`SELECT id, name FROM organizations WHERE id = ${spId}`)[0] || null;
    const links = await sql`SELECT association_id FROM sp_association_links WHERE service_provider_id = ${spId} AND status = 'active'`;
    const assocIds = links.map(l => l.association_id);

    let rows = [];
    if (assocIds.length) {
      rows = await sql`
        SELECT o.id AS org_id, o.name AS org_name, ac.id AS cat_id, ac.name AS cat_name,
          COUNT(a.id) FILTER (WHERE a.position = 'goalie' AND a.is_active = true)::int AS goalie_count
        FROM organizations o
        JOIN age_categories ac ON ac.organization_id = o.id
        LEFT JOIN athletes a ON a.age_category_id = ac.id
        WHERE o.id = ANY(${assocIds})
        GROUP BY o.id, o.name, ac.id, ac.name
        ORDER BY o.name, ac.name
      `;
    }
    const byOrg = new Map();
    for (const r of rows) {
      if (!byOrg.has(r.org_id)) byOrg.set(r.org_id, { id: r.org_id, name: r.org_name, categories: [] });
      byOrg.get(r.org_id).categories.push({ id: r.cat_id, name: r.cat_name, goalie_count: r.goalie_count });
    }
    const associations = Array.from(byOrg.values());
    const totalGoalies = rows.reduce((n, r) => n + r.goalie_count, 0);

    return NextResponse.json({ sp, associations, total_goalies: totalGoalies, total_associations: associations.length });
  } catch (e) {
    console.error("goalie-provider overview error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
