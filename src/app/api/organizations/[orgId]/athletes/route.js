// Club-wide athlete directory: every athlete across all of the org's age
// categories, for the association dashboard's Athletes tab (search + quick report).

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const auth = await authorizeOrgAccess(session, params.orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const athletes = await sql`
      SELECT
        a.id, a.first_name, a.last_name, a.position, a.birth_year,
        a.external_id, a.jersey_number, a.cut_at,
        ac.id as age_category_id, ac.name as category_name, ac.setup_complete
      FROM athletes a
      JOIN age_categories ac ON ac.id = a.age_category_id
      WHERE ac.organization_id = ${params.orgId} AND a.is_active = true
      ORDER BY a.last_name, a.first_name, ac.name
    `;

    return NextResponse.json({ athletes });
  } catch (error) {
    console.error("Association athletes error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
