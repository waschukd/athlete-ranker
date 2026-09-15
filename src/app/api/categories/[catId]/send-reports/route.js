import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { sendParentReportEmail, parentEmails } from "@/lib/email";
import { ensureEmailLogTable, logEmailSend } from "@/lib/emailLog";
import { resolveReportPrice } from "@/lib/reportProvider";

// Emailing every parent a paid-report link (and minting the report_links
// tokens) is a director/admin-level action -- the GET dry-run count stays
// open to any category-authorized role.
const MANAGE_ROLES = new Set(["super_admin", "association_admin", "director", "service_provider_admin", "goalie_service_provider_admin"]);

async function ctx(session, catId) {
  const auth = await authorizeCategoryAccess(session, catId);
  if (!auth.authorized) return null;
  const cat = await sql`
    SELECT ac.name, ac.teams_finalized_at, o.name AS org_name
    FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id
    WHERE ac.id = ${catId}
  `;
  return { auth, orgName: cat[0]?.org_name || "Your association", teamsFinalized: !!cat[0]?.teams_finalized_at };
}

// Dry-run: how many parents would be emailed.
export async function GET(request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await ctx(session, params.catId);
  if (!c) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await sql`
    SELECT COUNT(*)::int AS with_email
    FROM athletes
    WHERE age_category_id = ${params.catId} AND is_active = true AND cut_at IS NULL
      AND ((parent_email IS NOT NULL AND parent_email != '') OR (parent_email_2 IS NOT NULL AND parent_email_2 != ''))
  `;
  const { priceCents } = await resolveReportPrice(c.auth.orgId);
  return NextResponse.json({ org_name: c.orgName, with_email: rows[0]?.with_email || 0, price_cents: priceCents, teams_finalized: c.teamsFinalized });
}

// Email each parent a link to their child's report (free preview → paywall).
export async function POST(request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const c = await ctx(session, params.catId);
  if (!c) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Enforced here too, not just a disabled button -- teams_finalized_at is a
  // manual, per-category confirmation (see categories/[catId]/teams-finalized)
  // since this app can't reliably know whether a roster built in a separate
  // tool is actually done.
  if (!c.teamsFinalized) {
    return NextResponse.json({ error: "Mark teams as finalized for this category before sending reports." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const spName = (body.spName || "").trim() || null;
  const athleteId = body.athlete_id || null;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";
  const { priceCents } = await resolveReportPrice(c.auth.orgId);
  const priceStr = `$${(priceCents / 100).toFixed(2)}`;
  const userId = (await sql`SELECT id FROM users WHERE email = ${session.email}`)[0]?.id;

  // cut_at IS NULL: a player cut from THIS category (moved to another tier,
  // or released) stays active + visible here on purpose, flagged "Cut", so
  // their real scores still show in this division's own ranking -- see
  // categories/[catId]/cut/route.js. But that means they'd otherwise still
  // get offered a report purchase for a tier they're no longer part of,
  // which reads as very confusing to a parent (an AA-tryout report landing
  // in the inbox of a family who already knows their kid plays House now).
  // A "move" also gives the player a brand-new athlete row in the
  // destination category (clean slate, no AA-tagged scores/notes at all --
  // see buildAthleteReport's own athlete_id + age_category_id scoping), so
  // excluding the cut row here never loses anyone a report; it's covered
  // once reports go out for their real, current category instead.
  const athletes = await sql`
    SELECT id, first_name, last_name, parent_email, parent_email_2
    FROM athletes
    WHERE age_category_id = ${params.catId} AND is_active = true AND cut_at IS NULL
      AND ((parent_email IS NOT NULL AND parent_email != '') OR (parent_email_2 IS NOT NULL AND parent_email_2 != ''))
      ${athleteId ? sql`AND id = ${athleteId}` : sql``}
  `;

  await ensureEmailLogTable();
  let sent = 0, skipped = 0, failed = 0;
  for (const a of athletes) {
    let token;
    const existing = await sql`SELECT token FROM report_links WHERE athlete_id = ${a.id} AND age_category_id = ${params.catId}`;
    if (existing.length) token = existing[0].token;
    else {
      const r = await sql`
        INSERT INTO report_links (athlete_id, age_category_id, organization_id, created_by)
        VALUES (${a.id}, ${params.catId}, ${c.auth.orgId}, ${userId})
        RETURNING token
      `;
      token = r[0].token;
    }
    // Email both households (if a second parent email is on file); they share
    // the one report link — a purchase by either unlocks it for both.
    const playerName = `${a.first_name} ${a.last_name}`.trim();
    for (const to of parentEmails(a)) {
      const res = await sendParentReportEmail({
        to, playerName, orgName: c.orgName, spName,
        reportUrl: `${baseUrl}/report/${token}`,
        priceStr,
      });
      if (res?.ok) sent++; else if (res?.skipped) skipped++; else failed++;
      await logEmailSend({
        catId: params.catId, emailType: "report", athleteId: a.id, athleteName: playerName, to,
        resendId: res?.id || null, status: res?.ok ? "sent" : (res?.skipped ? "skipped" : "failed"),
        error: res?.ok ? null : (res?.error || "send failed").toString().slice(0, 500),
      });
    }
  }
  return NextResponse.json({ success: true, total: athletes.length, sent, skipped, failed });
}
