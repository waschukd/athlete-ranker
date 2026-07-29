import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get the director's assigned categories, each with light stats so a director
    // assigned to more than one (e.g. Millwoods U11 Tier 1 + House) gets an
    // association-style overview of all of them.
    const assignments = await sql`
      SELECT
        da.age_category_id, da.organization_id,
        ac.name as category_name, ac.setup_complete, ac.status,
        ac.scoring_scale, ac.scoring_increment, ac.position_tagging,
        ac.evaluators_required,
        o.name as org_name,
        (SELECT COUNT(*) FROM athletes a WHERE a.age_category_id = ac.id AND a.is_active = true)::int AS athletes_count,
        (SELECT COUNT(*) FROM evaluation_schedule es WHERE es.age_category_id = ac.id)::int AS sessions_count
      FROM director_assignments da
      JOIN age_categories ac ON ac.id = da.age_category_id
      JOIN organizations o ON o.id = da.organization_id
      WHERE da.user_id = (SELECT id FROM users WHERE email = ${session.email}) AND da.status = 'active'
      ORDER BY o.name, ac.name
    `;

    if (!assignments.length) {
      return NextResponse.json({ error: "No category assigned" }, { status: 404 });
    }

    return NextResponse.json({ assignments });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
