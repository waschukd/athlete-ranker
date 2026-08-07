import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { verifyCoachReportToken } from "@/lib/calendar-token";
import { buildCoachesReport } from "@/lib/coachesReport";

// Public, token-gated single-team development report for an emailed coach.
// The token IS the authorization; it unlocks exactly one team and carries no
// scores (only within-team ranking + aggregated themes).
export async function GET(request, { params }) {
  try {
    const teamId = verifyCoachReportToken(params.token);
    if (!teamId) return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });

    const [team] = await sql`SELECT id, age_category_id FROM teams WHERE id = ${teamId}`;
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    const report = await buildCoachesReport(team.age_category_id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const teamReport = report.teams.find(t => t.id === teamId);
    if (!teamReport) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    return NextResponse.json({
      category: { name: report.category.name, org_name: report.category.org_name },
      team: teamReport,
    });
  } catch (error) {
    console.error("Coach report (token) error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
