import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

import { NextResponse } from "next/server";
import { computeCategoryRankings } from "@/lib/rankings";
import sql from "@/lib/db";

// No fixed jersey/helmet number exists on the athlete record in practice --
// pinnies/jerseys get reshuffled, so the number is entered fresh at each
// check-in. "Last used" is the most recent one on file, per athlete.
async function attachLastJerseyNumbers(catId, result) {
  const rows = await sql`
    SELECT DISTINCT ON (pc.athlete_id) pc.athlete_id, pc.jersey_number
    FROM player_checkins pc
    JOIN evaluation_schedule es ON es.id = pc.schedule_id
    WHERE es.age_category_id = ${catId} AND pc.checked_in = true AND pc.jersey_number IS NOT NULL
    ORDER BY pc.athlete_id, pc.checked_in_at DESC
  `;
  const numByAthlete = Object.fromEntries(rows.map(r => [r.athlete_id, r.jersey_number]));
  const withNumber = (list) => (list || []).map(a => ({ ...a, last_jersey_number: numByAthlete[a.id] ?? null }));
  return { ...result, athletes: withNumber(result.athletes), goalies: withNumber(result.goalies) };
}

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const scope = new URL(request.url).searchParams.get("scope") === "coach" ? "coach" : "official";
    const result = await computeCategoryRankings(catId, { scope });
    return NextResponse.json(await attachLastJerseyNumbers(catId, result));
  } catch (error) {
    console.error("Rankings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
