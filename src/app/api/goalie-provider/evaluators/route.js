import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, resolveGoalieSpOrgId } from "@/lib/auth";

// Goalie evaluators for a goalie SP: those designated kind='goalie' on categories
// in the SP's linked associations. GET lists them; POST adds one by email to a
// category (they then only see goalies when scoring).
async function linkedCategoryIds(spId) {
  const rows = await sql`
    SELECT ac.id FROM age_categories ac
    JOIN sp_association_links sal ON sal.association_id = ac.organization_id
    WHERE sal.service_provider_id = ${spId} AND sal.status = 'active'`;
  return rows.map(r => r.id);
}

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const spId = await resolveGoalieSpOrgId(session, new URL(request.url).searchParams.get("org"));
    if (!spId) return NextResponse.json({ error: "Not a goalie service provider" }, { status: 403 });
    const catIds = await linkedCategoryIds(spId);
    if (!catIds.length) return NextResponse.json({ evaluators: [] });
    const rows = await sql`
      SELECT ce.age_category_id, ce.email, u.name, u.email AS user_email, ac.name AS category_name, o.name AS org_name
      FROM category_evaluators ce
      JOIN age_categories ac ON ac.id = ce.age_category_id
      JOIN organizations o ON o.id = ac.organization_id
      LEFT JOIN users u ON u.id = ce.user_id
      WHERE ce.kind = 'goalie' AND ce.age_category_id = ANY(${catIds})
      ORDER BY o.name, ac.name`;
    return NextResponse.json({ evaluators: rows });
  } catch (e) {
    console.error("goalie-provider evaluators GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const spId = await resolveGoalieSpOrgId(session, new URL(request.url).searchParams.get("org"));
    if (!spId) return NextResponse.json({ error: "Not a goalie service provider" }, { status: 403 });
    const { age_category_id, email } = await request.json();
    if (!age_category_id || !email) return NextResponse.json({ error: "age_category_id and email required" }, { status: 400 });

    const catIds = await linkedCategoryIds(spId);
    if (!catIds.includes(Number(age_category_id))) return NextResponse.json({ error: "Category not linked to this provider" }, { status: 403 });

    const existing = await sql`SELECT id FROM category_evaluators WHERE age_category_id = ${age_category_id} AND kind = 'goalie' AND lower(email) = lower(${email})`;
    if (existing.length) return NextResponse.json({ success: true, already: true });

    const user = await sql`SELECT id FROM users WHERE lower(email) = lower(${email}) LIMIT 1`;
    await sql`INSERT INTO category_evaluators (age_category_id, user_id, email, kind) VALUES (${age_category_id}, ${user[0]?.id || null}, ${email}, 'goalie')`;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("goalie-provider evaluators POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
