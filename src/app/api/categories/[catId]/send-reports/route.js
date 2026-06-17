import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { sendParentReportEmail, parentEmails } from "@/lib/email";

const PRICE_CENTS = parseInt(process.env.REPORT_PRICE_CENTS || "2499", 10);

async function ctx(session, catId) {
  const auth = await authorizeCategoryAccess(session, catId);
  if (!auth.authorized) return null;
  const cat = await sql`
    SELECT ac.name, o.name AS org_name
    FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id
    WHERE ac.id = ${catId}
  `;
  return { auth, orgName: cat[0]?.org_name || "Your association" };
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
    WHERE age_category_id = ${params.catId} AND is_active = true
      AND ((parent_email IS NOT NULL AND parent_email != '') OR (parent_email_2 IS NOT NULL AND parent_email_2 != ''))
  `;
  return NextResponse.json({ org_name: c.orgName, with_email: rows[0]?.with_email || 0, price_cents: PRICE_CENTS });
}

// Email each parent a link to their child's report (free preview → paywall).
export async function POST(request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await ctx(session, params.catId);
  if (!c) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const spName = (body.spName || "").trim() || null;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";
  const priceStr = `$${(PRICE_CENTS / 100).toFixed(2)}`;
  const userId = (await sql`SELECT id FROM users WHERE email = ${session.email}`)[0]?.id;

  const athletes = await sql`
    SELECT id, first_name, last_name, parent_email, parent_email_2
    FROM athletes
    WHERE age_category_id = ${params.catId} AND is_active = true
      AND ((parent_email IS NOT NULL AND parent_email != '') OR (parent_email_2 IS NOT NULL AND parent_email_2 != ''))
  `;

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
    for (const to of parentEmails(a)) {
      const res = await sendParentReportEmail({
        to,
        playerName: `${a.first_name} ${a.last_name}`.trim(),
        orgName: c.orgName, spName,
        reportUrl: `${baseUrl}/report/${token}`,
        priceStr,
      });
      if (res?.ok) sent++; else if (res?.skipped) skipped++; else failed++;
    }
  }
  return NextResponse.json({ success: true, total: athletes.length, sent, skipped, failed });
}
