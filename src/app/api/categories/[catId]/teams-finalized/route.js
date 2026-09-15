// Manual, per-category confirmation gate for "Send Reports to Parents".
// Deliberately not auto-detected from anything in-app -- many associations
// build their real rosters in a separate tool entirely, so this app has no
// reliable signal for "teams are decided." The director/SP flips this
// themselves once it's actually true, wherever the deciding happened.

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

const MANAGE_ROLES = new Set(["super_admin", "association_admin", "director", "service_provider_admin", "goalie_service_provider_admin"]);

export async function PATCH(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!MANAGE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { finalized } = await request.json();
    const rows = finalized === true
      ? await sql`UPDATE age_categories SET teams_finalized_at = NOW() WHERE id = ${params.catId} RETURNING teams_finalized_at`
      : await sql`UPDATE age_categories SET teams_finalized_at = NULL WHERE id = ${params.catId} RETURNING teams_finalized_at`;
    const [row] = rows;
    if (!row) return NextResponse.json({ error: "Category not found" }, { status: 404 });

    return NextResponse.json({ success: true, teamsFinalizedAt: row.teams_finalized_at });
  } catch (error) {
    console.error("teams-finalized PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
