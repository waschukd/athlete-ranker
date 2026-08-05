import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, resolveSpContext } from "@/lib/auth";
import { recomputeTesterHours } from "@/lib/testerHours";

// SP-wide payroll: what the service provider owes each person (tester and/or
// evaluator) across every session in its scope — its client associations' sessions
// plus its own testing events. Hours are attributed by the SESSION (association or
// SP-owned), not by a possibly-inconsistent organization_id on the hours row. Each
// hour is TESTING (a 'testing' session or an SP-owned event) or EVALUATION, and
// paid at that person's tester_hourly_rate or hourly_rate respectively.

const ADMIN = new Set(["service_provider_admin", "goalie_service_provider_admin", "super_admin"]);

async function ctx(request) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!ADMIN.has(session.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const { orgId: spId } = await resolveSpContext(session, new URL(request.url).searchParams.get("org"));
  if (!spId) return { error: NextResponse.json({ error: "Not a service provider" }, { status: 403 }) };
  return { session, spId };
}

export async function GET(request) {
  try {
    const c = await ctx(request);
    if (c.error) return c.error;
    const { spId } = c;

    // Refresh auto tester hours for this SP's testers so the numbers are current.
    try {
      const testers = await sql`SELECT user_id FROM evaluator_memberships WHERE organization_id = ${spId} AND is_tester = true AND status = 'active'`;
      for (const t of testers) await recomputeTesterHours(t.user_id);
    } catch (e) { console.error("payroll tester recompute:", e?.message); }

    const assocIds = (await sql`SELECT association_id FROM sp_association_links WHERE service_provider_id = ${spId} AND status = 'active'`).map(r => r.association_id);

    // Per-person hours split by kind (testing/eval) and status. A LEFT JOIN keeps
    // people with no hours (shown at 0); the scope filter allows NULL (no hours).
    const rows = await sql`
      SELECT u.id, u.name, u.email, em.hourly_rate, em.tester_hourly_rate, em.is_evaluator, em.is_tester,
        COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status='pending'  AND     is_testing), 0) AS test_pending,
        COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status='approved' AND     is_testing), 0) AS test_approved,
        COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status='paid'     AND     is_testing), 0) AS test_paid,
        COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status='pending'  AND NOT is_testing), 0) AS eval_pending,
        COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status='approved' AND NOT is_testing), 0) AS eval_approved,
        COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status='paid'     AND NOT is_testing), 0) AS eval_paid
      FROM evaluator_memberships em
      JOIN users u ON u.id = em.user_id
      LEFT JOIN LATERAL (
        SELECT eh.status, eh.hours_worked,
          (COALESCE(cs.session_type,'') = 'testing' OR es.service_provider_id IS NOT NULL) AS is_testing
        FROM evaluator_hours eh
        JOIN evaluation_schedule es ON es.id = eh.schedule_id
        LEFT JOIN age_categories ac ON ac.id = es.age_category_id
        LEFT JOIN category_sessions cs ON cs.age_category_id = es.age_category_id AND cs.session_number = es.session_number
        WHERE eh.evaluator_id = em.user_id
          AND (es.service_provider_id = ${spId} OR ac.organization_id = ANY(${assocIds}))
      ) eh ON true
      WHERE em.organization_id = ${spId} AND em.status = 'active'
      GROUP BY u.id, u.name, u.email, em.hourly_rate, em.tester_hourly_rate, em.is_evaluator, em.is_tester
      ORDER BY u.name`;

    const money = (hrs, rate) => rate != null ? Math.round(parseFloat(hrs) * parseFloat(rate) * 100) / 100 : 0;
    const people = rows.map(r => {
      const owed = money(r.test_approved, r.tester_hourly_rate) + money(r.eval_approved, r.hourly_rate);
      const pendingAmt = money(r.test_pending, r.tester_hourly_rate) + money(r.eval_pending, r.hourly_rate);
      const paidAmt = money(r.test_paid, r.tester_hourly_rate) + money(r.eval_paid, r.hourly_rate);
      return {
        id: r.id, name: r.name, email: r.email,
        is_evaluator: r.is_evaluator, is_tester: r.is_tester,
        eval_rate: r.hourly_rate != null ? parseFloat(r.hourly_rate) : null,
        tester_rate: r.tester_hourly_rate != null ? parseFloat(r.tester_hourly_rate) : null,
        testing_hours: { pending: +r.test_pending, approved: +r.test_approved, paid: +r.test_paid },
        eval_hours: { pending: +r.eval_pending, approved: +r.eval_approved, paid: +r.eval_paid },
        owed: Math.round(owed * 100) / 100,
        pending_amount: Math.round(pendingAmt * 100) / 100,
        paid_amount: Math.round(paidAmt * 100) / 100,
      };
    }).filter(p => p.owed || p.pending_amount || p.paid_amount || p.testing_hours.pending || p.testing_hours.approved || p.eval_hours.pending || p.eval_hours.approved);

    const totals = people.reduce((t, p) => ({
      owed: t.owed + p.owed, pending: t.pending + p.pending_amount, paid: t.paid + p.paid_amount,
    }), { owed: 0, pending: 0, paid: 0 });
    for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k] * 100) / 100;

    return NextResponse.json({ people, totals, assocCount: assocIds.length });
  } catch (e) {
    console.error("payroll GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Bulk approve / mark-paid a person's hours in this SP's scope.
export async function POST(request) {
  try {
    const c = await ctx(request);
    if (c.error) return c.error;
    const { spId } = c;
    const body = await request.json();
    const userId = parseInt(body.user_id);
    if (!userId || !["approve", "mark_paid"].includes(body.action)) {
      return NextResponse.json({ error: "user_id and a valid action (approve|mark_paid) required" }, { status: 400 });
    }
    const assocIds = (await sql`SELECT association_id FROM sp_association_links WHERE service_provider_id = ${spId} AND status = 'active'`).map(r => r.association_id);
    const from = body.action === "approve" ? "pending" : "approved";
    const to = body.action === "approve" ? "approved" : "paid";
    // Only touch hours for sessions in this SP's scope.
    await sql`
      UPDATE evaluator_hours SET status = ${to}
      WHERE evaluator_id = ${userId} AND status = ${from}
        AND schedule_id IN (
          SELECT es.id FROM evaluation_schedule es
          LEFT JOIN age_categories ac ON ac.id = es.age_category_id
          WHERE es.service_provider_id = ${spId} OR ac.organization_id = ANY(${assocIds})
        )`;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("payroll POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
