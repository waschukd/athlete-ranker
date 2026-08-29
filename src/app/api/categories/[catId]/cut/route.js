// Cut a player from an elite/Tournament division. Two modes:
//   "move"    — re-register them one level down (e.g. U11 AA → U11 house). A fresh
//               athlete is created in the destination category with a clean slate,
//               and the destination's director (or the association's admin, if it
//               has no director) is always emailed to expect them -- regardless of
//               whether the parent-facing notify checkbox below was used.
//   "release" — they've finished tryouts here and go nowhere (common in AA, where a
//               cut player simply leaves). No re-registration, no director to alert;
//               the parents get a warm "thank you for coming out" note instead.
//               cut_to_category_id stays NULL.
// In both modes the source athlete is stamped cut_at (kept active + visible, flagged
// "Cut", real scores intact) and pulled from future teams/rosters. Scores are keyed
// by athlete_id + session and never deleted.

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { emailPlayerCut, emailPlayerIncoming, parentEmails } from "@/lib/email";
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

    // Some associations never place a cut player into another division -- every
    // cut is a straight release with one standard letter. For them the
    // move-vs-release choice is a decision they do not make, and offering it is
    // just a chance to send the wrong email. Read via to_jsonb so this works
    // before the column has been migrated.
    const [orgFlags] = await sql`
      SELECT (to_jsonb(o) ->> 'release_only') AS release_only
      FROM organizations o WHERE o.id = ${cat.organization_id}`;
    const releaseOnly = orgFlags?.release_only === true || orgFlags?.release_only === "true";
    const categories = await sql`
      SELECT id, name FROM age_categories
      WHERE organization_id = ${cat.organization_id} AND id <> ${params.catId} AND COALESCE(status,'active') <> 'archived'
      ORDER BY name`;

    const template = await resolveTemplate(cat.organization_id, "player_cut");
    const releaseTemplate = await resolveTemplate(cat.organization_id, "player_released");
    return NextResponse.json({ categories, template, releaseTemplate, organizationId: cat.organization_id, releaseOnly });
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
    // "release" = cut with no destination: the player has finished tryouts here and
    // isn't being re-registered anywhere (common in AA — they simply leave). "move"
    // (default) re-registers them one level down.
    const mode = body.mode === "release" ? "release" : "move";
    const toCategoryId = parseInt(body.toCategoryId);
    if (!athleteId) return NextResponse.json({ error: "athleteId required" }, { status: 400 });
    if (mode === "move" && !toCategoryId) return NextResponse.json({ error: "toCategoryId required" }, { status: 400 });

    // Source athlete must belong to this category.
    const [athlete] = await sql`SELECT * FROM athletes WHERE id = ${athleteId} AND age_category_id = ${params.catId}`;
    if (!athlete) return NextResponse.json({ error: "Athlete not found in this category" }, { status: 404 });

    const [fromCat] = await sql`SELECT id, name, organization_id FROM age_categories WHERE id = ${params.catId}`;
    let toCat = null;
    if (mode === "move") {
      [toCat] = await sql`SELECT id, name, organization_id FROM age_categories WHERE id = ${toCategoryId}`;
      if (!toCat) return NextResponse.json({ error: "Destination category not found" }, { status: 404 });
      if (toCat.organization_id !== fromCat.organization_id) return NextResponse.json({ error: "Destination must be in the same association" }, { status: 400 });
    }

    const [org] = await sql`SELECT name FROM organizations WHERE id = ${fromCat.organization_id}`;

    // 1) Stamp the source athlete cut — but keep them ACTIVE so they stay VISIBLE
    // (flagged "Cut") in this division's ranking with their real scores. cut_at is
    // what removes them from FUTURE games, not is_active. Scores stay put.
    // Released players carry a NULL destination (they went nowhere).
    await sql`UPDATE athletes SET cut_at = NOW(), cut_to_category_id = ${mode === "move" ? toCategoryId : null} WHERE id = ${athleteId}`;
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

    // 2) Move mode only: create a fresh athlete in the destination category (clean
    // slate). Release mode re-registers nowhere — the player is done here.
    if (mode === "move") {
      await sql`
        INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, external_id, position, birth_year, parent_email, parent_email_2, is_active)
        VALUES (${fromCat.organization_id}, ${toCategoryId}, ${athlete.first_name}, ${athlete.last_name}, ${athlete.external_id || null}, ${athlete.position || null}, ${athlete.birth_year || null}, ${athlete.parent_email || null}, ${athlete.parent_email_2 || null}, true)`;

      // Alert whoever now owns this player's pool. A release goes nowhere, so
      // there's no one to tell -- this only ever fires on a move, and always
      // (not tied to the parent-notify checkbox below, since it's an internal
      // operational heads-up, not a courtesy). Prefer the destination
      // category's own director(s); an association with no director assigned
      // falls back to its admin (role-table entry, or the org's contact_email
      // owner if that predates the role-table link -- same duality used to
      // resolve "the admin of this org" elsewhere, e.g. notifySessionChange).
      try {
        const directors = await sql`
          SELECT DISTINCT u.email, u.name FROM director_assignments da
          JOIN users u ON u.id = da.user_id
          WHERE da.age_category_id = ${toCategoryId} AND da.status = 'active'
        `;
        let recipients = directors;
        if (!recipients.length) {
          const admins = await sql`
            SELECT DISTINCT u.name, u.email FROM user_organization_roles uor
            JOIN users u ON u.id = uor.user_id
            WHERE uor.organization_id = ${toCat.organization_id} AND uor.role = 'association_admin'
          `;
          const [owner] = await sql`
            SELECT u.name, u.email FROM organizations o JOIN users u ON u.email = o.contact_email
            WHERE o.id = ${toCat.organization_id}
          `;
          const seen = new Set();
          recipients = [];
          for (const r of [...admins, ...(owner ? [owner] : [])]) {
            const key = (r.email || "").toLowerCase().trim();
            if (key && !seen.has(key)) { seen.add(key); recipients.push(r); }
          }
        }
        const incomingPlayerName = `${athlete.first_name || ""} ${athlete.last_name || ""}`.trim();
        for (const r of recipients) {
          if (!r.email) continue;
          await emailPlayerIncoming({
            to: r.email, recipientName: r.name, playerName: incomingPlayerName,
            orgName: org?.name || "the association",
            fromCategoryName: fromCat.name, toCategoryName: toCat.name, toCategoryId,
          }).catch((e) => console.error("emailPlayerIncoming send failed:", e?.message));
        }
      } catch (e) { console.error("director notification lookup failed:", e?.message); }
    }

    // 3) Optional gentle email to the parents — placement note for a move, a warm
    // "thank you & released" note when they went nowhere.
    let emailSent = false;
    if (body.notify) {
      const playerName = `${athlete.first_name || ""} ${athlete.last_name || ""}`.trim();
      const orgName = org?.name || "the association";

      // The admin may have edited the copy in the modal. If they didn't, fall
      // back to the org's saved template, and failing that the built-in wording —
      // resolved here rather than trusting the client to send it.
      const tpl = await resolveTemplate(fromCat.organization_id, mode === "release" ? "player_released" : "player_cut");
      const vars = {
        player_name: athlete.first_name || playerName,
        org_name: orgName,
        from_category: fromCat.name,
        to_category: toCat?.name || "",
      };
      const message = (body.message && body.message.trim()) || renderTemplate(tpl.body, vars);
      const subject = renderTemplate(tpl.subject, vars);

      for (const to of parentEmails(athlete)) {
        const r = await emailPlayerCut({ to, playerName, orgName, message, subject });
        if (r?.ok) emailSent = true;
      }
    }

    return NextResponse.json({ success: true, emailSent, released: mode === "release", movedTo: toCat?.name || null });
  } catch (error) {
    console.error("cut POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
