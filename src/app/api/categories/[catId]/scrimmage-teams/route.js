import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { getScrimmageTeams, createTeams, seedTeams, moveAthlete } from "@/lib/scrimmageTeams";

const MANAGE = new Set(["super_admin", "association_admin", "director", "service_provider_admin"]);

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const teams = await getScrimmageTeams(params.catId);
    // Unassigned skaters (so the UI can show a pool to drag from).
    const assigned = new Set(teams.flatMap(t => t.members.map(m => m.athlete_id)));
    const skaters = await sql`
      SELECT id, first_name, last_name, jersey_number, position FROM athletes
      WHERE age_category_id = ${params.catId} AND is_active = true AND COALESCE(position,'') <> 'goalie'
      ORDER BY last_name, first_name`;
    const unassigned = skaters.filter(a => !assigned.has(a.id));
    return NextResponse.json({ teams, unassigned });
  } catch (error) {
    console.error("scrimmage-teams GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!MANAGE.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    if (body.action === "create") {
      const teams = await createTeams(params.catId, body.count);
      return NextResponse.json({ success: true, teams });
    }
    if (body.action === "seed") {
      // Create the teams first if none exist, then seed.
      const existing = await getScrimmageTeams(params.catId);
      if (!existing.length) await createTeams(params.catId, body.count || 3);
      const teams = await seedTeams(params.catId, body.mode || "alphabetical");
      return NextResponse.json({ success: true, teams });
    }
    if (body.action === "move_player") {
      await moveAthlete(params.catId, parseInt(body.athlete_id), parseInt(body.to_team_id));
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("scrimmage-teams POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
