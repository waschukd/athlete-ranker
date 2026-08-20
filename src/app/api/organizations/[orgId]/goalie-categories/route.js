import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";

// Goalie-only categories for an association. A goalie-ONLY age category holds only
// goalies and uses the same goalie tools a goalie SP would. Two callers can create
// one: the association itself, evaluating in-house (goalie_eval_mode = 'association'),
// or a connected goalie service provider running the association's goalies entirely
// on their behalf (goalie_eval_mode = 'goalie_service_provider') -- see the eval_mode
// gate in POST below, which is role-aware rather than a blanket block.

const WRITE_ROLES = new Set(["super_admin", "association_admin", "goalie_service_provider_admin"]);

// GET — this association's goalie-only categories, each with its live goalie count.
export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { orgId } = params;
    const auth = await authorizeOrgAccess(session, orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [org] = await sql`SELECT goalie_eval_mode FROM organizations WHERE id = ${orgId}`;
    const categories = await sql`
      SELECT ac.id, ac.name, ac.setup_complete,
        COUNT(a.id) FILTER (WHERE a.position = 'goalie' AND a.is_active = true)::int AS goalie_count
      FROM age_categories ac
      LEFT JOIN athletes a ON a.age_category_id = ac.id
      WHERE ac.organization_id = ${orgId} AND ac.goalie_only = true AND COALESCE(ac.status,'active') <> 'archived'
      GROUP BY ac.id, ac.name, ac.setup_complete
      ORDER BY ac.name`;
    return NextResponse.json({ goalie_eval_mode: org?.goalie_eval_mode || "association", categories });
  } catch (e) {
    console.error("goalie-categories GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST { name, min_age?, max_age? } — create a goalie-only category. Only permitted
// when the association evaluates goalies in-house (no goalie SP driving it).
export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!WRITE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { orgId } = params;
    const auth = await authorizeOrgAccess(session, orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [org] = await sql`SELECT goalie_eval_mode FROM organizations WHERE id = ${orgId}`;
    const delegatedToGoalieSp = (org?.goalie_eval_mode || "association") === "goalie_service_provider";
    // An association admin can't self-create once they've delegated to a connected
    // goalie SP -- but the connected goalie SP themselves is exactly who's supposed
    // to be creating categories in that state, so only block the association side.
    if (delegatedToGoalieSp && session.role !== "goalie_service_provider_admin" && session.role !== "super_admin") {
      return NextResponse.json({ error: "A goalie service provider handles your goalies. Switch to in-house evaluation to create your own goalie categories." }, { status: 400 });
    }

    const { name, min_age, max_age } = await request.json();
    if (!name || !name.trim()) return NextResponse.json({ error: "A category name is required" }, { status: 400 });

    const [category] = await sql`
      INSERT INTO age_categories (organization_id, name, min_age, max_age, goalie_only, evaluates_goalies)
      VALUES (${orgId}, ${name.trim()}, ${min_age || null}, ${max_age || null}, true, true)
      RETURNING *`;

    // Materialize the org's goalie template into this category (goalie_config +
    // goalie scoring categories), same as a normal category inherits it.
    try {
      const { getEffectiveGoalieTemplate, applyTemplateToCategory } = await import("@/lib/goalieTemplate");
      const { template } = await getEffectiveGoalieTemplate(orgId);
      await applyTemplateToCategory(category.id, template);
    } catch (e) { console.error("goalie template apply on goalie-category create:", e?.message); }

    return NextResponse.json({ category }, { status: 201 });
  } catch (e) {
    console.error("goalie-categories POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
