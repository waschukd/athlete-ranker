// Whole-association schedule: every evaluation_schedule row across all of the
// org's age categories, for the association dashboard's day/week/month view.
// Mirrors the SP master-schedule feed but scoped to one organization and without
// the SP-private tester staffing fields.

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

    const { searchParams } = new URL(request.url);
    // Full season either side by default so "Show Past" reaches old sessions.
    const from = searchParams.get("from") || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const to = searchParams.get("to") || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const schedule = await sql`
      SELECT
        es.id as schedule_id, es.id as id,
        es.scheduled_date, es.day_of_week, es.start_time, es.end_time,
        es.location, es.session_number, es.group_number, es.status,
        ac.id as age_category_id, ac.id as category_id, ac.name as category_name,
        cs.session_type, cs.name as session_name,
        COALESCE(es.evaluators_required, cs.evaluators_required, ac.evaluators_required, 4) as evaluators_required,
        COALESCE(es.goalie_evaluators_required, 0) as goalie_evaluators_required,
        COUNT(DISTINCT ess.id) FILTER (WHERE ess.status = 'signed_up') as evaluators_signed_up
      FROM age_categories ac
      JOIN evaluation_schedule es ON es.age_category_id = ac.id
      LEFT JOIN category_sessions cs ON cs.age_category_id = ac.id AND cs.session_number = es.session_number
      LEFT JOIN evaluator_session_signups ess ON ess.schedule_id = es.id AND ess.status != 'cancelled'
      WHERE ac.organization_id = ${params.orgId}
        AND es.scheduled_date BETWEEN ${from} AND ${to}
      GROUP BY es.id, ac.id, ac.name, cs.session_type, cs.name, cs.evaluators_required, ac.evaluators_required
      ORDER BY es.scheduled_date, es.start_time, ac.name
    `;

    // Alias org_name → category_name so the shared Week/Month/Strip views color
    // and label by category out of the box. Compute open evaluator spots.
    const byDate = {};
    const rows = schedule.map(entry => {
      const isTesting = entry.session_type === "testing"; // objective testing needs no evaluators
      const req = isTesting ? 0 : parseInt(entry.evaluators_required || 0);
      const spots_open = Math.max(0, req - parseInt(entry.evaluators_signed_up || 0));
      const row = { ...entry, org_name: entry.category_name, spots_open };
      const date = entry.scheduled_date?.toString().split("T")[0];
      if (date) (byDate[date] ||= []).push(row);
      return row;
    });

    return NextResponse.json({ schedule: rows, byDate });
  } catch (error) {
    console.error("Association schedule error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
