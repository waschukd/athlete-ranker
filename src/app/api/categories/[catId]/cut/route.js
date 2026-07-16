// Cut a player from an elite/Tournament division and re-register them at a lower
// level (e.g. U11 AA → U11 house). The source athlete is deactivated (is_active
// = false) and stamped cut_at/cut_to_category_id, so they drop out of every AA
// roster, ranking, and check-in automatically — but their scores are untouched
// (scores are keyed by athlete_id + session, never deleted). A fresh athlete is
// created in the destination category with a clean slate, and (optionally) the
// parents get a gentle notification email.

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { emailPlayerCut, parentEmails } from "@/lib/email";
import { resolveTemplate, renderTemplate } from "@/lib/emailTemplates";

const MANAGE = new Set(["super_admin", "association_admin", "director", "service_provider_admin"]);

// Destination options + the placement-email template, so the modal can show the
// admin exactly what will go out (pre-filled and editable) instead of a blank box.
// The template is returned unmerged — the modal re-renders it as the destination
// division changes.
export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [cat] = await sql`SELECT organization_id FROM age_categories WHERE id = ${params.catId}`;
    if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const categories = await sql`
      SELECT id, name FROM age_categories
      WHERE organization_id = ${cat.organization_id} AND id <> ${params.catId} AND COALESCE(status,'active') <> 'archived'
      ORDER BY name`;

    const template = await resolveTemplate(cat.organization_id, "player_cut");
    return NextResponse.json({ categories, template, organizationId: cat.organization_id });
  } catch (error) {
    console.error("cut GET error:", error);
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
    const athleteId = parseInt(body.athleteId);
    const toCategoryId = parseInt(body.toCategoryId);
    if (!athleteId || !toCategoryId) return NextResponse.json({ error: "athleteId and toCategoryId required" }, { status: 400 });

    // Source athlete must belong to this category.
    const [athlete] = await sql`SELECT * FROM athletes WHERE id = ${athleteId} AND age_category_id = ${params.catId}`;
    if (!athlete) return NextResponse.json({ error: "Athlete not found in this category" }, { status: 404 });

    const [fromCat] = await sql`SELECT id, name, organization_id FROM age_categories WHERE id = ${params.catId}`;
    const [toCat] = await sql`SELECT id, name, organization_id FROM age_categories WHERE id = ${toCategoryId}`;
    if (!toCat) return NextResponse.json({ error: "Destination category not found" }, { status: 404 });
    if (toCat.organization_id !== fromCat.organization_id) return NextResponse.json({ error: "Destination must be in the same association" }, { status: 400 });

    const [org] = await sql`SELECT name FROM organizations WHERE id = ${fromCat.organization_id}`;

    // 1) Stamp the source athlete cut — but keep them ACTIVE so they stay VISIBLE
    // (flagged "Cut") in this division's ranking with their real scores. cut_at is
    // what removes them from FUTURE games, not is_active. Scores stay put.
    await sql`UPDATE athletes SET cut_at = NOW(), cut_to_category_id = ${toCategoryId} WHERE id = ${athleteId}`;
    // Pull them off any Tournament team so re-seeds / future matchups exclude them.
    try {
      await sql`DELETE FROM scrimmage_team_members WHERE athlete_id = ${athleteId} AND scrimmage_team_id IN (SELECT id FROM scrimmage_teams WHERE age_category_id = ${params.catId})`;
    } catch { /* no teams */ }
    // Remove them from UPCOMING game rosters (past/played games keep them for history).
    try {
      await sql`
        DELETE FROM player_group_assignments
        WHERE athlete_id = ${athleteId}
          AND session_group_id IN (
            SELECT sg.id FROM session_groups sg
            JOIN evaluation_schedule es ON es.age_category_id = sg.age_category_id AND es.session_number = sg.session_number AND es.group_number = sg.group_number
            WHERE sg.age_category_id = ${params.catId} AND es.scheduled_date >= CURRENT_DATE
          )`;
    } catch { /* best-effort */ }

    // 2) Create a fresh athlete in the destination category (clean slate).
    await sql`
      INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, external_id, position, birth_year, parent_email, parent_email_2, is_active)
      VALUES (${fromCat.organization_id}, ${toCategoryId}, ${athlete.first_name}, ${athlete.last_name}, ${athlete.external_id || null}, ${athlete.position || null}, ${athlete.birth_year || null}, ${athlete.parent_email || null}, ${athlete.parent_email_2 || null}, true)`;

    // 3) Optional gentle email to the parents.
    let emailSent = false;
    if (body.notify) {
      const playerName = `${athlete.first_name || ""} ${athlete.last_name || ""}`.trim();
      const orgName = org?.name || "the association";

      // The admin may have edited the copy in the modal. If they didn't, fall
      // back to the org's saved template, and failing that the built-in wording —
      // resolved here rather than trusting the client to send it.
      const tpl = await resolveTemplate(fromCat.organization_id, "player_cut");
      const vars = {
        player_name: athlete.first_name || playerName,
        org_name: orgName,
        from_category: fromCat.name,
        to_category: toCat.name,
      };
      const message = (body.message && body.message.trim()) || renderTemplate(tpl.body, vars);
      const subject = renderTemplate(tpl.subject, vars);

      for (const to of parentEmails(athlete)) {
        const r = await emailPlayerCut({ to, playerName, orgName, message, subject });
        if (r?.ok) emailSent = true;
      }
    }

    return NextResponse.json({ success: true, emailSent, movedTo: toCat.name });
  } catch (error) {
    console.error("cut POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
