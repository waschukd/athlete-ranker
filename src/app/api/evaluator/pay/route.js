import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { appUserId } from "@/lib/notify";
import { eligibleNoteCount, getNoteBonusRate } from "@/lib/reportBonus";

// The evaluator's own hours + pay, per organization. Pay = (approved + paid)
// hours × the rate the org set for them. Degrades to [] if the wages column
// isn't migrated yet.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = await appUserId(session);
    if (!userId) return NextResponse.json({ orgs: [] });

    try {
      const rows = await sql`
        SELECT o.id AS org_id, o.name AS org_name, em.hourly_rate,
          COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status = 'pending'), 0)  AS pending_hours,
          COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status = 'approved'), 0) AS approved_hours,
          COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status = 'paid'), 0)     AS paid_hours
        FROM evaluator_memberships em
        JOIN organizations o ON o.id = em.organization_id
        LEFT JOIN evaluator_hours eh ON eh.evaluator_id = em.user_id AND eh.organization_id = em.organization_id
        WHERE em.user_id = ${userId} AND em.status = 'active'
        GROUP BY o.id, o.name, em.hourly_rate
        ORDER BY o.name
      `;
      // Eligible notes are evaluator-global (their notes that landed in sold
      // reports); the per-note bonus rate varies by org.
      const eligibleNotes = await eligibleNoteCount(userId);
      const orgs = (await Promise.all(rows.map(async r => {
        const rate = r.hourly_rate != null ? parseFloat(r.hourly_rate) : null;
        const approved = parseFloat(r.approved_hours) || 0;
        const paid = parseFloat(r.paid_hours) || 0;
        const pending = parseFloat(r.pending_hours) || 0;
        const bonusRateCents = await getNoteBonusRate(r.org_id);
        const report_bonus = bonusRateCents > 0
          ? { eligibleNotes, rateCents: bonusRateCents, bonusCents: eligibleNotes * bonusRateCents }
          : null;
        return {
          org_id: r.org_id, org_name: r.org_name, hourly_rate: rate,
          pending_hours: pending, approved_hours: approved, paid_hours: paid,
          earned: rate != null ? Math.round((approved + paid) * rate * 100) / 100 : null,
          paid_amount: rate != null ? Math.round(paid * rate * 100) / 100 : null,
          report_bonus,
        };
      }))).filter(o => o.pending_hours || o.approved_hours || o.paid_hours || o.hourly_rate != null || o.report_bonus);
      return NextResponse.json({ orgs });
    } catch {
      return NextResponse.json({ orgs: [] });
    }
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
