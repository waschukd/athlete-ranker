import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { appUserId } from "@/lib/notify";
import { eligibleNoteCount, getNoteBonusRate } from "@/lib/reportBonus";
import { recomputeTesterHours } from "@/lib/testerHours";

// The evaluator's own hours + pay, per organization. Pay = (approved + paid)
// hours × the rate the org set for them. Degrades to [] if the wages column
// isn't migrated yet.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = await appUserId(session);
    if (!userId) return NextResponse.json({ orgs: [] });

    // Refresh this user's auto tester hours from their schedule before summing, so
    // their pay reflects the true span. No-op for non-testers. Never blocks the read.
    try { await recomputeTesterHours(userId); } catch (e) { console.error("tester hours recompute:", e?.message); }

    try {
      // Each logged hour is TESTING or EVALUATION, decided by the session its hours
      // were logged against (a 'testing' category session, or an SP-owned testing
      // event). Testing hours pay at tester_hourly_rate, evaluation hours at
      // hourly_rate — they're usually different (testing typically lower).
      const rows = await sql`
        SELECT o.id AS org_id, o.name AS org_name, em.hourly_rate, em.tester_hourly_rate,
          COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status = 'pending'), 0)  AS pending_hours,
          COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status = 'approved'), 0) AS approved_hours,
          COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status = 'paid'), 0)     AS paid_hours,
          COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status IN ('approved','paid') AND (cs.session_type = 'testing' OR es.service_provider_id IS NOT NULL)), 0) AS testing_payable_hours,
          COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status = 'paid' AND (cs.session_type = 'testing' OR es.service_provider_id IS NOT NULL)), 0) AS testing_paid_hours,
          COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status IN ('approved','paid') AND NOT (cs.session_type = 'testing' OR es.service_provider_id IS NOT NULL)), 0) AS eval_payable_hours,
          COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status = 'paid' AND NOT (cs.session_type = 'testing' OR es.service_provider_id IS NOT NULL)), 0) AS eval_paid_hours
        FROM evaluator_memberships em
        JOIN organizations o ON o.id = em.organization_id
        LEFT JOIN evaluator_hours eh ON eh.evaluator_id = em.user_id AND eh.organization_id = em.organization_id
        LEFT JOIN evaluation_schedule es ON es.id = eh.schedule_id
        LEFT JOIN category_sessions cs ON cs.age_category_id = es.age_category_id AND cs.session_number = es.session_number
        WHERE em.user_id = ${userId} AND em.status = 'active'
        GROUP BY o.id, o.name, em.hourly_rate, em.tester_hourly_rate
        ORDER BY o.name
      `;
      // Eligible notes are evaluator-global (their notes that landed in sold
      // reports); the per-note bonus rate varies by org.
      const eligibleNotes = await eligibleNoteCount(userId);
      const orgs = (await Promise.all(rows.map(async r => {
        const evalRate = r.hourly_rate != null ? parseFloat(r.hourly_rate) : null;
        const testRate = r.tester_hourly_rate != null ? parseFloat(r.tester_hourly_rate) : null;
        const approved = parseFloat(r.approved_hours) || 0;
        const paid = parseFloat(r.paid_hours) || 0;
        const pending = parseFloat(r.pending_hours) || 0;
        const testPayable = parseFloat(r.testing_payable_hours) || 0;
        const testPaid = parseFloat(r.testing_paid_hours) || 0;
        const evalPayable = parseFloat(r.eval_payable_hours) || 0;
        const evalPaid = parseFloat(r.eval_paid_hours) || 0;
        // Earnings = eval hours × eval rate + testing hours × testing rate. A missing
        // rate for a bucket contributes 0 (not the other bucket's rate).
        const money = (evalHrs, testHrs) =>
          Math.round(((evalRate != null ? evalHrs * evalRate : 0) + (testRate != null ? testHrs * testRate : 0)) * 100) / 100;
        const bonusRateCents = await getNoteBonusRate(r.org_id);
        const report_bonus = bonusRateCents > 0
          ? { eligibleNotes, rateCents: bonusRateCents, bonusCents: eligibleNotes * bonusRateCents }
          : null;
        return {
          org_id: r.org_id, org_name: r.org_name,
          hourly_rate: evalRate, tester_hourly_rate: testRate,
          pending_hours: pending, approved_hours: approved, paid_hours: paid,
          earned: (evalRate != null || testRate != null) ? money(evalPayable, testPayable) : null,
          paid_amount: (evalRate != null || testRate != null) ? money(evalPaid, testPaid) : null,
          report_bonus,
        };
      }))).filter(o => o.pending_hours || o.approved_hours || o.paid_hours || o.hourly_rate != null || o.tester_hourly_rate != null || o.report_bonus);
      return NextResponse.json({ orgs });
    } catch {
      return NextResponse.json({ orgs: [] });
    }
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
