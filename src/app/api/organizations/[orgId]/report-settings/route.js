// An association's own self-service view of their Development Report setup --
// backs the "End of Eval Reports" card on the main dashboard. Price is only
// settable if the SP has granted this org control (see
// /api/service-provider/associations "set_report_control"); the purchasing
// on/off switch (report_purchasing_enabled) is unconditional -- it isn't new,
// it just had no UI anywhere until now.

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import { resolveReportPrice, DEFAULT_REPORT_PRICE_CENTS, SP_FLAT_FEE_CENTS, ASSOCIATION_TX_FEE_CENTS, splitReportSale } from "@/lib/reportProvider";

const WRITE_ROLES = new Set(["super_admin", "association_admin", "director"]);

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const auth = await authorizeOrgAccess(session, params.orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [org] = await sql`
      SELECT report_control_granted, custom_report_price_cents, report_purchasing_enabled
      FROM organizations WHERE id = ${params.orgId}`;
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    const { priceCents } = await resolveReportPrice(params.orgId);
    const split = splitReportSale(priceCents);

    const categories = await sql`
      SELECT ac.id, ac.name,
        EXISTS(SELECT 1 FROM category_scores cs WHERE cs.age_category_id = ac.id) AS has_scores
      FROM age_categories ac
      WHERE ac.organization_id = ${params.orgId} AND COALESCE(ac.status, 'active') <> 'archived'
      ORDER BY ac.name`;

    return NextResponse.json({
      granted: !!org.report_control_granted,
      purchasingEnabled: org.report_purchasing_enabled !== false,
      priceCents,
      customPriceCents: org.custom_report_price_cents || null,
      defaultPriceCents: DEFAULT_REPORT_PRICE_CENTS,
      spFlatFeeCents: SP_FLAT_FEE_CENTS,
      associationTxFeeCents: ASSOCIATION_TX_FEE_CENTS,
      associationAmountCents: split.associationAmountCents,
      categories,
    });
  } catch (error) {
    console.error("report-settings GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!WRITE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const auth = await authorizeOrgAccess(session, params.orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [org] = await sql`SELECT report_control_granted FROM organizations WHERE id = ${params.orgId}`;
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    const body = await request.json();

    if ("purchasing_enabled" in body) {
      await sql`UPDATE organizations SET report_purchasing_enabled = ${body.purchasing_enabled === true} WHERE id = ${params.orgId}`;
    }

    if ("price_cents" in body) {
      if (!org.report_control_granted) {
        return NextResponse.json({ error: "Your provider hasn't granted you pricing control yet." }, { status: 403 });
      }
      const price = parseInt(body.price_cents);
      if (!Number.isFinite(price) || price <= 0) {
        return NextResponse.json({ error: "price_cents must be a positive number" }, { status: 400 });
      }
      await sql`UPDATE organizations SET custom_report_price_cents = ${price} WHERE id = ${params.orgId}`;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("report-settings PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
