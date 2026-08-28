// The association's own purchase tracker for the "End of Eval Reports" card --
// who bought a report, what they paid, and what the association's own cut
// was (association_fee_cents / the platform's flat cut are recorded per sale
// so this always matches what was actually charged, not today's settings).

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const auth = await authorizeOrgAccess(session, params.orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rows = await sql`
      SELECT rp.id, rp.status, rp.amount_cents, rp.platform_fee_cents, rp.association_fee_cents,
        rp.currency, rp.created_at, rp.completed_at,
        a.first_name, a.last_name, ac.name AS category_name
      FROM report_purchases rp
      JOIN athletes a ON a.id = rp.athlete_id
      JOIN age_categories ac ON ac.id = rp.age_category_id
      WHERE ac.organization_id = ${params.orgId}
      ORDER BY rp.created_at DESC
      LIMIT 500`;

    const purchases = rows.map(r => ({
      id: r.id,
      athlete_name: `${r.first_name} ${r.last_name}`.trim(),
      category_name: r.category_name,
      status: r.status,
      amount_cents: r.amount_cents,
      currency: r.currency,
      // What the association actually netted -- 0 for any sale made before this
      // feature existed, or while not granted (association_fee_cents is only
      // ever set on a custom-priced sale; nothing to derive it from otherwise).
      association_amount_cents: r.status === "completed" && r.association_fee_cents != null
        ? Math.max(0, (r.amount_cents || 0) - (r.platform_fee_cents || 0) - r.association_fee_cents)
        : 0,
      created_at: r.created_at,
      completed_at: r.completed_at,
    }));

    const totalCompleted = purchases.filter(p => p.status === "completed").length;
    const totalAssociationCents = purchases.reduce((sum, p) => sum + p.association_amount_cents, 0);

    return NextResponse.json({ purchases, totalCompleted, totalAssociationCents });
  } catch (error) {
    console.error("report-purchases GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
