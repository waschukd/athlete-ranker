import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { buildAthleteReport } from "@/lib/reportData";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { athleteId } = params;
    const { searchParams } = new URL(request.url);
    const catId = searchParams.get("cat") || searchParams.get("catId");

    // A category is required so every request is gated by authorizeCategoryAccess
    // plus the athlete-in-category check below. Without it the route would return
    // athlete data with no authorization gate at all (IDOR).
    if (!catId) return NextResponse.json({ error: "category required" }, { status: 400 });

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Verify the athlete actually belongs to the authorized category (IDOR guard)
    const ath = await sql`SELECT id FROM athletes WHERE id = ${athleteId} AND age_category_id = ${catId}`;
    if (!ath.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const report = await buildAthleteReport(catId, athleteId);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(report);
  } catch (error) {
    console.error("Player report error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
