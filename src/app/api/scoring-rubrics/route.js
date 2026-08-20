import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { resolveSkillKey, resolveAgeTier } from "@/lib/rubric";

// A shared, platform-wide reference an evaluator can pull up while scoring:
// "what does a 0 look like, what does a 10 look like" per skill, per age tier --
// e.g. U9 skating vs U15 skating are graded to different physical expectations.
// Deliberately NOT per-organization: this is Sideline Star's own calibration
// content, the same guide regardless of which association a category belongs to.

async function ensureTable() {
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
}

// GET ?category_id=X — every scoring_category for that age category, each
// resolved to its rubric bands (age-tier-specific if authored, else the
// age-agnostic 'ALL' set, else no bands at all if nothing's been written yet).
export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const catId = new URL(request.url).searchParams.get("category_id");
    if (!catId) return NextResponse.json({ error: "category_id required" }, { status: 400 });
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await ensureTable();
    const [category] = await sql`SELECT name FROM age_categories WHERE id = ${catId}`;
    if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const ageTier = resolveAgeTier(category.name);

    const scoringCats = await sql`SELECT id, name, applies_to FROM scoring_categories WHERE age_category_id = ${catId} ORDER BY display_order`;
    const allBands = await sql`SELECT skill_key, age_tier, band_min, band_max, description FROM scoring_rubrics WHERE age_tier = ${ageTier} OR age_tier = 'ALL' ORDER BY skill_key, band_min`;

    const guide = scoringCats.map(sc => {
      const isGoalie = sc.applies_to !== "all";
      const skillKey = resolveSkillKey(sc.name, isGoalie);
      if (!skillKey) return { scoring_category_id: sc.id, name: sc.name, skill_key: null, bands: [] };
      // Prefer this tier's own bands; only fall back to ALL if the tier has none for this skill.
      const tierBands = allBands.filter(b => b.skill_key === skillKey && b.age_tier === ageTier);
      const bands = tierBands.length ? tierBands : allBands.filter(b => b.skill_key === skillKey && b.age_tier === "ALL");
      return { scoring_category_id: sc.id, name: sc.name, skill_key: skillKey, bands };
    });

    return NextResponse.json({ age_tier: ageTier, guide });
  } catch (e) {
    console.error("scoring-rubrics GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const WRITE_ROLES = new Set(["super_admin", "service_provider_admin", "goalie_service_provider_admin"]);

// POST { skill_key, age_tier, band_min, band_max, description, display_order } —
// upsert one band. Authoring is SP-level (Competitive Thread's own calibration
// content), not association-level.
export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!WRITE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await ensureTable();

    const body = await request.json();
    const { skill_key, description } = body;
    const age_tier = (body.age_tier || "ALL").trim() || "ALL";
    const band_min = parseFloat(body.band_min);
    const band_max = parseFloat(body.band_max);
    const display_order = parseInt(body.display_order) || Math.round(band_min * 10);
    if (!skill_key || !description || Number.isNaN(band_min) || Number.isNaN(band_max)) {
      return NextResponse.json({ error: "skill_key, band_min, band_max, description required" }, { status: 400 });
    }

    if (body.id) {
      await sql`UPDATE scoring_rubrics SET skill_key = ${skill_key}, age_tier = ${age_tier}, band_min = ${band_min}, band_max = ${band_max}, description = ${description.trim()}, display_order = ${display_order}, updated_at = NOW() WHERE id = ${body.id}`;
    } else {
      await sql`INSERT INTO scoring_rubrics (skill_key, age_tier, band_min, band_max, description, display_order) VALUES (${skill_key}, ${age_tier}, ${band_min}, ${band_max}, ${description.trim()}, ${display_order})`;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("scoring-rubrics POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!WRITE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await sql`DELETE FROM scoring_rubrics WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("scoring-rubrics DELETE error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
