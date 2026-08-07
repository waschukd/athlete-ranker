import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { buildCoachesReport } from "@/lib/coachesReport";

// Team Development (coaches) report — aggregated, free to the association.
// Viewable by association admin / SP / director / super admin; not evaluators.
const VIEW_ROLES = new Set([
  "super_admin", "association_admin", "director",
  "service_provider_admin", "goalie_service_provider_admin",
]);

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!VIEW_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const report = await buildCoachesReport(catId);
    if (!report) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    return NextResponse.json(report);
  } catch (error) {
    console.error("Coaches report error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
