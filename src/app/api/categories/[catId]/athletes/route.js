import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { applyAllMatchups } from "@/lib/scrimmageTeams";
import { ensureSessionGroup } from "@/lib/sessionGroups";
import { normalizePosition } from "@/lib/rosterImport";

// Roster mutations (bulk import, quick-add, deactivate) are for admins/directors —
// authorizeCategoryAccess alone also admits plain evaluators, who should only GET.
const ROSTER_WRITE_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin", "goalie_service_provider_admin", "director"]);

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

    const cats = await sql`SELECT organization_id, eval_format FROM age_categories WHERE id = ${catId}`;
    if (!cats.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const orgId = cats[0].organization_id;
    const isTournament = cats[0].eval_format === "round_robin";

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
          const non_contact = athlete.non_contact === true;
          // Deliberately its own column name, not "Team" -- the generic roster
          // importer's column auto-mapper (src/lib/rosterImport.js) already treats
          // a header literally named "Team" as a synonym for age-category
          // Division, so reusing it here would silently misfile this value.
          // Accept "Scrimmage Group" too -- BAHA's own roster template uses that
          // exact wording, and this route (unlike rosterImport.js's flexible
          // synonym matching) only ever matched literal header text, so it was
          // silently importing every player with no team assigned.
          const scrimmageTeamLabel = (athlete["Scrimmage Team"] || athlete["Scrimmage Group"] || athlete.scrimmage_team || athlete.scrimmage_group || "").toString().trim();
          // Standard format: "Session N Group #" columns (see lib/rosterImport.js)
          // pre-assign a player into that session's group at import time, mirroring
          // what scrimmageTeamLabel does for tournament teams above.
          const sessionGroups = Array.isArray(athlete.session_groups) ? athlete.session_groups : [];

          if (!first_name || !last_name) { skipped++; continue; }

          let athleteId = null;
          // Use upsert — insert or update based on external_id or name match
          if (external_id) {
            const result = await sql`
              INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, external_id, position, birth_year, parent_email, parent_email_2, helmet_number, non_contact, is_active)
              VALUES (${orgId}, ${catId}, ${first_name}, ${last_name}, ${external_id}, ${position}, ${birth_year}, ${parent_email || null}, ${parent_email_2 || null}, ${helmet_number}, ${non_contact}, true)
              ON CONFLICT (age_category_id, external_id) WHERE external_id IS NOT NULL
              DO UPDATE SET
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                position = COALESCE(EXCLUDED.position, athletes.position),
                birth_year = COALESCE(EXCLUDED.birth_year, athletes.birth_year),
                parent_email = COALESCE(EXCLUDED.parent_email, athletes.parent_email),
                parent_email_2 = COALESCE(EXCLUDED.parent_email_2, athletes.parent_email_2),
                helmet_number = COALESCE(EXCLUDED.helmet_number, athletes.helmet_number),
                non_contact = athletes.non_contact OR EXCLUDED.non_contact,
                age_category_id = EXCLUDED.age_category_id,
                is_active = true
              RETURNING id, (xmax = 0) as inserted
            `;
            athleteId = result[0]?.id || null;
            if (result[0]?.inserted) imported++; else updated++;
          } else {
            const existing = await sql`
              SELECT id FROM athletes WHERE age_category_id = ${catId} AND first_name = ${first_name} AND last_name = ${last_name}
            `;
            if (existing.length) {
              athleteId = existing[0].id;
              await sql`
                UPDATE athletes SET position = COALESCE(${position}, position), birth_year = COALESCE(${birth_year}, birth_year), parent_email = COALESCE(${parent_email || null}, parent_email), parent_email_2 = COALESCE(${parent_email_2 || null}, parent_email_2), helmet_number = COALESCE(${helmet_number}, helmet_number), non_contact = athletes.non_contact OR ${non_contact}, is_active = true
                WHERE id = ${existing[0].id}
              `;
              updated++;
            } else {
              const [inserted] = await sql`
                INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, external_id, position, birth_year, parent_email, parent_email_2, helmet_number, non_contact, is_active)
                VALUES (${orgId}, ${catId}, ${first_name}, ${last_name}, null, ${position}, ${birth_year}, ${parent_email || null}, ${parent_email_2 || null}, ${helmet_number}, ${non_contact}, true)
                RETURNING id
              `;
              athleteId = inserted?.id || null;
              imported++;
            }
          }

          // Tournament format: a "Scrimmage Team" column lets teams already exist
          // right after import instead of a separate seed-then-drag-and-drop step.
          // Matching later game "A vs B" matchup labels resolves teams by exact
          // (case-insensitive) name (see src/lib/scrimmageTeams.js findTeamByLabel),
          // so a bare letter here is normalized to the same "Team X" convention
          // that letter already falls back to there.
          if (isTournament && athleteId && scrimmageTeamLabel) {
            const canonicalTeamName = /^[a-f]$/i.test(scrimmageTeamLabel) ? `Team ${scrimmageTeamLabel.toUpperCase()}` : scrimmageTeamLabel;
            let [team] = await sql`SELECT id FROM scrimmage_teams WHERE age_category_id = ${catId} AND lower(name) = ${canonicalTeamName.toLowerCase()}`;
            if (!team) {
              const [{ nextOrder }] = await sql`SELECT COALESCE(MAX(display_order), -1) + 1 AS "nextOrder" FROM scrimmage_teams WHERE age_category_id = ${catId}`;
              [team] = await sql`INSERT INTO scrimmage_teams (age_category_id, name, display_order) VALUES (${catId}, ${canonicalTeamName}, ${nextOrder}) RETURNING id`;
            }
            // A re-upload changing someone's team should move them, not add a
            // second membership -- clear any other team in this category first.
            await sql`DELETE FROM scrimmage_team_members WHERE athlete_id = ${athleteId} AND scrimmage_team_id IN (SELECT id FROM scrimmage_teams WHERE age_category_id = ${catId})`;
            await sql`INSERT INTO scrimmage_team_members (scrimmage_team_id, athlete_id) VALUES (${team.id}, ${athleteId}) ON CONFLICT (athlete_id, scrimmage_team_id) DO NOTHING`;
          }

          // Standard format: seed session_groups + player_group_assignments from
          // any "Session N Group #" columns, so Manage Groups opens with the
          // roster already sorted instead of an empty slate to build by hand.
          if (!isTournament && athleteId && sessionGroups.length) {
            for (const sg of sessionGroups) {
              const sNum = parseInt(sg.session_number);
              const gNum = parseInt(sg.group_number);
              if (!sNum || !gNum) continue;
              await ensureSessionGroup(catId, sNum, gNum);
              const [group] = await sql`SELECT id FROM session_groups WHERE age_category_id = ${catId} AND session_number = ${sNum} AND group_number = ${gNum}`;
              if (!group) continue;
              // A re-upload changing someone's group should move them within this
              // session, not add a second membership -- same reasoning as the
              // scrimmage-team clear above.
              await sql`DELETE FROM player_group_assignments WHERE athlete_id = ${athleteId} AND session_group_id IN (SELECT id FROM session_groups WHERE age_category_id = ${catId} AND session_number = ${sNum})`;
              await sql`INSERT INTO player_group_assignments (athlete_id, session_group_id, display_order) VALUES (${athleteId}, ${group.id}, 0) ON CONFLICT (athlete_id, session_group_id) DO NOTHING`;
            }
          }
        } catch (e) {
          errors.push(`${athlete.first_name || "?"} ${athlete.last_name || "?"}: ${e.message}`);
          skipped++;
        }
      }
      // If any games already had a matchup picked before the roster showed up,
      // re-resolve now that the teams they name actually have players.
      if (isTournament) { try { await applyAllMatchups(catId); } catch (e) { console.error("athletes import: re-apply matchups failed:", e?.message); } }
      return NextResponse.json({ success: true, imported, updated, skipped, errors });
    }

    // Single quick-add
    const { first_name, last_name, external_id, position, birth_year, parent_email, parent_email_2, helmet_number, non_contact } = body;
    if (!first_name || !last_name) {
      return NextResponse.json({ error: "First and last name required" }, { status: 400 });
    }
    const helmet = helmet_number ? String(helmet_number).trim().slice(0, 4) || null : null;

    const result = await sql`
      INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, external_id, position, birth_year, parent_email, parent_email_2, helmet_number, non_contact, is_active)
      VALUES (${orgId}, ${catId}, ${first_name}, ${last_name}, ${external_id || null}, ${normalizePosition(position)}, ${birth_year || null}, ${parent_email || null}, ${parent_email_2 || null}, ${helmet}, ${non_contact === true}, true)
      RETURNING *
    `;
    return NextResponse.json({ athlete: result[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Inline single-field edit (currently helmet_number) from the athletes table.
export async function PATCH(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ROSTER_WRITE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const athleteId = parseInt(body.athlete_id);
    if (!athleteId) return NextResponse.json({ error: "athlete_id required" }, { status: 400 });
    if ("helmet_number" in body) {
      const helmet = body.helmet_number != null && String(body.helmet_number).trim() !== "" ? String(body.helmet_number).trim().slice(0, 4) : null;
      await sql`UPDATE athletes SET helmet_number = ${helmet} WHERE id = ${athleteId} AND age_category_id = ${params.catId}`;
    }
    if ("non_contact" in body) {
      await sql`UPDATE athletes SET non_contact = ${body.non_contact === true} WHERE id = ${athleteId} AND age_category_id = ${params.catId}`;
    }
    // Full-edit fields (name, HC#, position, birth year, parent contact) —
    // fixes e.g. a manually-added player whose name got mangled by browser
    // autofill, with no way to correct it after the fact.
    if ("first_name" in body) {
      const v = String(body.first_name || "").trim();
      if (!v) return NextResponse.json({ error: "First name is required" }, { status: 400 });
      await sql`UPDATE athletes SET first_name = ${v} WHERE id = ${athleteId} AND age_category_id = ${params.catId}`;
    }
    if ("last_name" in body) {
      const v = String(body.last_name || "").trim();
      if (!v) return NextResponse.json({ error: "Last name is required" }, { status: 400 });
      await sql`UPDATE athletes SET last_name = ${v} WHERE id = ${athleteId} AND age_category_id = ${params.catId}`;
    }
    if ("external_id" in body) {
      const v = String(body.external_id || "").trim() || null;
      await sql`UPDATE athletes SET external_id = ${v} WHERE id = ${athleteId} AND age_category_id = ${params.catId}`;
    }
    if ("position" in body) {
      const v = normalizePosition(body.position) || null;
      await sql`UPDATE athletes SET position = ${v} WHERE id = ${athleteId} AND age_category_id = ${params.catId}`;
    }
    if ("birth_year" in body) {
      const v = extractBirthYear(body.birth_year);
      await sql`UPDATE athletes SET birth_year = ${v} WHERE id = ${athleteId} AND age_category_id = ${params.catId}`;
    }
    if ("parent_email" in body) {
      const v = String(body.parent_email || "").trim() || null;
      await sql`UPDATE athletes SET parent_email = ${v} WHERE id = ${athleteId} AND age_category_id = ${params.catId}`;
    }
    if ("parent_email_2" in body) {
      const v = String(body.parent_email_2 || "").trim() || null;
      await sql`UPDATE athletes SET parent_email_2 = ${v} WHERE id = ${athleteId} AND age_category_id = ${params.catId}`;
    }
    return NextResponse.json({ success: true });
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
