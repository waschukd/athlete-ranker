import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

// Flat listing for the admin authoring page (src/app/service-provider/dashboard/
// scoring-guide/page.jsx) -- unlike the main GET, this isn't category-scoped,
// it's a direct filter by skill_key + age_tier so the author can see and edit
// exactly the rows they're working on.
const WRITE_ROLES = new Set(["super_admin", "service_provider_admin", "goalie_service_provider_admin"]);

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!WRITE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const skillKey = searchParams.get("skill_key");
    const ageTier = searchParams.get("age_tier") || "ALL";
    if (!skillKey) return NextResponse.json({ error: "skill_key required" }, { status: 400 });

    await sql`
      CREATE TABLE IF NOT EXISTS scoring_rubrics (
        id SERIAL PRIMARY KEY,
        skill_key TEXT NOT NULL,
        age_tier TEXT NOT NULL DEFAULT 'ALL',
        band_min NUMERIC NOT NULL,
        band_max NUMERIC NOT NULL,
        description TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    const bands = await sql`
      SELECT id, skill_key, age_tier, band_min, band_max, description
      FROM scoring_rubrics WHERE skill_key = ${skillKey} AND age_tier = ${ageTier}
      ORDER BY band_min
    `;
    return NextResponse.json({ bands });
  } catch (e) {
    console.error("scoring-rubrics/all GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
