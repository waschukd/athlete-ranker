import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

import { NextResponse } from "next/server";
import sql from "@/lib/db";

// Roster mutations (bulk import, quick-add, deactivate) are for admins/directors —
// authorizeCategoryAccess alone also admits plain evaluators, who should only GET.
const ROSTER_WRITE_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin", "goalie_service_provider_admin", "director"]);

const positionMap = {
  "f": "forward", "forward": "forward", "fwd": "forward",
  "d": "defense", "defense": "defense", "def": "defense", "defence": "defense",
  "g": "goalie", "goalie": "goalie", "gk": "goalie",
};

function normalizePosition(pos) {
  if (!pos) return null;
  return positionMap[pos.toLowerCase().trim()] || pos.toLowerCase().trim();
}

function extractBirthYear(val) {
  if (val == null || val === "") return null;
  // Importer sends birth_year as a NUMBER; other paths send date strings.
  // Coerce to string first (calling .includes on a number throws → the whole
  // row was being skipped, which is what caused "0 of N imported").
  const s = String(val);
  const m = s.match(/(19|20)\d{2}/); // first 4-digit year anywhere (handles 05/22/2012, 2012-05-01, 2012)
  return m ? parseInt(m[0], 10) : null;
}

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const athletes = await sql`
      SELECT * FROM athletes 
      WHERE age_category_id = ${catId} AND is_active = true
      ORDER BY last_name, first_name
    `;
    return NextResponse.json({ athletes, total: athletes.length });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ROSTER_WRITE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();

    const cats = await sql`SELECT organization_id FROM age_categories WHERE id = ${catId}`;
    if (!cats.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const orgId = cats[0].organization_id;

    // Bulk import
    if (body.athletes && Array.isArray(body.athletes)) {
      let imported = 0;
      let updated = 0;
      let skipped = 0;
      const errors = [];

      for (const athlete of body.athletes) {
        try {
          const first_name = athlete.first_name || athlete["First Name"] || athlete["FirstName"] || "";
          const last_name = athlete.last_name || athlete["Last Name"] || athlete["LastName"] || "";
          const external_id = athlete["HC#"] || athlete.external_id || athlete["ID"] || athlete["HC"] || "";
          const position = normalizePosition(athlete.Position || athlete.position || "");
          const birth_year = extractBirthYear(athlete.birth_year || athlete.date_of_birth || athlete["Birth Year"] || athlete["DOB"] || "");
          const parent_email = athlete.parent_email || athlete["Parent Email"] || athlete["Email"] || "";
          const parent_email_2 = athlete.parent_email_2 || athlete["Parent Email 2"] || athlete["Email 2"] || athlete["Parent 2 Email"] || "";
          const helmet_number = (athlete.helmet_number || athlete["Helmet #"] || athlete["Helmet Number"] || athlete["Helmet"] || "").toString().trim().slice(0, 4) || null;

          if (!first_name || !last_name) { skipped++; continue; }

          // Use upsert — insert or update based on external_id or name match
          if (external_id) {
            const result = await sql`
              INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, external_id, position, birth_year, parent_email, parent_email_2, helmet_number, is_active)
              VALUES (${orgId}, ${catId}, ${first_name}, ${last_name}, ${external_id}, ${position}, ${birth_year}, ${parent_email || null}, ${parent_email_2 || null}, ${helmet_number}, true)
              ON CONFLICT (age_category_id, external_id) WHERE external_id IS NOT NULL
              DO UPDATE SET
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                position = COALESCE(EXCLUDED.position, athletes.position),
                birth_year = COALESCE(EXCLUDED.birth_year, athletes.birth_year),
                parent_email = COALESCE(EXCLUDED.parent_email, athletes.parent_email),
                parent_email_2 = COALESCE(EXCLUDED.parent_email_2, athletes.parent_email_2),
                helmet_number = COALESCE(EXCLUDED.helmet_number, athletes.helmet_number),
                age_category_id = EXCLUDED.age_category_id,
                is_active = true
              RETURNING (xmax = 0) as inserted
            `;
            if (result[0]?.inserted) imported++; else updated++;
          } else {
            const existing = await sql`
              SELECT id FROM athletes WHERE age_category_id = ${catId} AND first_name = ${first_name} AND last_name = ${last_name}
            `;
            if (existing.length) {
              await sql`
                UPDATE athletes SET position = COALESCE(${position}, position), birth_year = COALESCE(${birth_year}, birth_year), parent_email = COALESCE(${parent_email || null}, parent_email), parent_email_2 = COALESCE(${parent_email_2 || null}, parent_email_2), helmet_number = COALESCE(${helmet_number}, helmet_number), is_active = true
                WHERE id = ${existing[0].id}
              `;
              updated++;
            } else {
              await sql`
                INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, external_id, position, birth_year, parent_email, parent_email_2, helmet_number, is_active)
                VALUES (${orgId}, ${catId}, ${first_name}, ${last_name}, null, ${position}, ${birth_year}, ${parent_email || null}, ${parent_email_2 || null}, ${helmet_number}, true)
              `;
              imported++;
            }
          }
        } catch (e) {
          errors.push(`${athlete.first_name || "?"} ${athlete.last_name || "?"}: ${e.message}`);
          skipped++;
        }
      }
      return NextResponse.json({ success: true, imported, updated, skipped, errors });
    }

    // Single quick-add
    const { first_name, last_name, external_id, position, birth_year, parent_email, parent_email_2 } = body;
    if (!first_name || !last_name) {
      return NextResponse.json({ error: "First and last name required" }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, external_id, position, birth_year, parent_email, parent_email_2, is_active)
      VALUES (${orgId}, ${catId}, ${first_name}, ${last_name}, ${external_id || null}, ${normalizePosition(position)}, ${birth_year || null}, ${parent_email || null}, ${parent_email_2 || null}, true)
      RETURNING *
    `;
    return NextResponse.json({ athlete: result[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ROSTER_WRITE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const athleteId = searchParams.get("athlete_id");
    if (!athleteId) return NextResponse.json({ error: "athlete_id required" }, { status: 400 });
    await sql`UPDATE athletes SET is_active = false WHERE id = ${athleteId} AND age_category_id = ${catId}`;
      // Clean up related data for deactivated athlete
      await sql`DELETE FROM player_checkins WHERE athlete_id = ${athleteId} AND schedule_id IN (SELECT id FROM evaluation_schedule WHERE age_category_id = ${catId})`;
      await sql`DELETE FROM player_group_assignments WHERE athlete_id = ${athleteId}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
