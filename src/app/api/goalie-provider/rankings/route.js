import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, resolveGoalieSpOrgId } from "@/lib/auth";
import { computeCategoryRankings } from "@/lib/rankings";

// Verify a category belongs to an association linked to this goalie SP (or super_admin).
async function authorizeCat(session, orgParam, catId) {
  if (session?.role === "super_admin") return true;
  const spId = await resolveGoalieSpOrgId(session, orgParam);
  if (!spId) return false;
  const cat = await sql`SELECT organization_id FROM age_categories WHERE id = ${catId}`;
  if (!cat.length) return false;
  const linked = await sql`SELECT 1 FROM sp_association_links WHERE service_provider_id = ${spId} AND association_id = ${cat[0].organization_id} AND status = 'active' LIMIT 1`;
  return linked.length > 0;
}

// Goalie rankings for one category (goalies only — never skaters).
export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const catId = searchParams.get("cat");
    if (!catId) return NextResponse.json({ error: "cat required" }, { status: 400 });
    if (!(await authorizeCat(session, searchParams.get("org"), catId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const data = await computeCategoryRankings(catId);
    return NextResponse.json({
      category: data.category || null,
      sessions: data.sessions || [],
      goalies: data.goalies || [],
    });
  } catch (e) {
    console.error("goalie-provider rankings error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
