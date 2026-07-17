import { requireSuperAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { PLATFORM_FEE_BPS } from "@/lib/reportProvider";

// Day boundaries follow the association's wall clock, not UTC — a 7pm MT session
// belongs to that evening, not the next UTC day.
const TZ = "America/Edmonton";
const SPARK_DAYS = 14;
const PULSE_DAYS = 30;

// Every non-cancelled session, attributed to an org and tagged testing/not.
//
// Two attribution paths, and both are load-bearing: association sessions reach an
// org through their age_category, while SP-owned testing events carry a NULL
// age_category_id and hang off service_provider_id instead. Rolling up through
// age_categories alone silently drops the SP events (14 sessions / 14.0 hrs today).
//
// An SP-owned event is testing by definition — see scripts/migrate-sp-testing-events.mjs.
const SESSIONS_CTE = sql`
  SELECT
    es.id,
    es.scheduled_date,
    COALESCE(ac.organization_id, es.service_provider_id) AS org_id,
    (es.age_category_id IS NULL AND es.service_provider_id IS NOT NULL)
      OR cs.session_type = 'testing' AS is_testing,
    COALESCE(EXTRACT(EPOCH FROM (es.end_time - es.start_time)) / 3600.0, 0) AS hours
  FROM evaluation_schedule es
  LEFT JOIN age_categories ac ON ac.id = es.age_category_id
  LEFT JOIN category_sessions cs
    ON cs.age_category_id = es.age_category_id AND cs.session_number = es.session_number
  WHERE es.status IS DISTINCT FROM 'cancelled'
`;

export async function GET() {
  try {
    const adminUser = await requireSuperAdmin();
    if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [overview, today, series, pulse, topOrgs, providerLedger, feed] = await Promise.all([
      sql`
        WITH sess AS (${SESSIONS_CTE})
        SELECT
          (SELECT COUNT(*) FROM organizations) AS total_organizations,
          (SELECT COUNT(*) FROM organizations WHERE type = 'association') AS total_associations,
          (SELECT COUNT(*) FROM users) AS total_users,
          (SELECT COUNT(*) FROM athletes WHERE is_active = true) AS total_athletes,
          (SELECT COUNT(*) FROM category_scores) AS total_scores,
          (SELECT COUNT(*) FROM testing_results) AS total_testing_scores,
          (SELECT COUNT(*) FROM report_purchases WHERE status = 'completed') AS total_reports,
          (SELECT COALESCE(SUM(amount_cents), 0) FROM report_purchases WHERE status = 'completed') AS total_revenue_cents,
          (SELECT COUNT(*) FROM sess) AS total_sessions,
          (SELECT COUNT(*) FROM sess WHERE is_testing) AS total_testing_sessions,
          (SELECT ROUND(COALESCE(SUM(hours), 0)::numeric, 1) FROM sess) AS total_hours,
          (SELECT ROUND(COALESCE(SUM(hours) FILTER (WHERE is_testing), 0)::numeric, 1) FROM sess) AS total_testing_hours
      `,
      sql`
        WITH sess AS (${SESSIONS_CTE}), d AS (SELECT (NOW() AT TIME ZONE ${TZ})::date AS day)
        SELECT
          (SELECT COUNT(*) FROM sess, d WHERE sess.scheduled_date = d.day) AS sessions,
          (SELECT ROUND(COALESCE(SUM(hours), 0)::numeric, 1) FROM sess, d WHERE sess.scheduled_date = d.day) AS hours,
          (SELECT ROUND(COALESCE(SUM(hours) FILTER (WHERE is_testing), 0)::numeric, 1)
             FROM sess, d WHERE sess.scheduled_date = d.day) AS testing_hours,
          (SELECT COUNT(*) FROM category_scores, d
            WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})::date = d.day) AS scores,
          (SELECT COUNT(*) FROM testing_results, d
            WHERE (created_at AT TIME ZONE ${TZ})::date = d.day) AS testing_scores,
          (SELECT COUNT(*) FROM athletes, d
            WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})::date = d.day) AS athletes,
          (SELECT COUNT(*) FROM report_purchases, d
            WHERE status = 'completed'
              AND (completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})::date = d.day) AS reports,
          (SELECT COUNT(DISTINCT user_id) FROM analytics_events, d
            WHERE (ts AT TIME ZONE ${TZ})::date = d.day) AS active_users
      `,
      // 14-day sparkline behind each tile, zero-filled so the shape is honest.
      sql`
        WITH sess AS (${SESSIONS_CTE}),
        days AS (
          SELECT generate_series(
            (NOW() AT TIME ZONE ${TZ})::date - (${SPARK_DAYS - 1} || ' days')::interval,
            (NOW() AT TIME ZONE ${TZ})::date,
            '1 day'::interval
          )::date AS day
        )
        SELECT
          d.day,
          (SELECT COUNT(*) FROM sess s WHERE s.scheduled_date = d.day)::int AS sessions,
          (SELECT ROUND(COALESCE(SUM(s.hours), 0)::numeric, 1) FROM sess s WHERE s.scheduled_date = d.day) AS hours,
          (SELECT ROUND(COALESCE(SUM(s.hours) FILTER (WHERE s.is_testing), 0)::numeric, 1)
             FROM sess s WHERE s.scheduled_date = d.day) AS testing_hours,
          (SELECT COUNT(*) FROM category_scores cs
            WHERE (cs.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})::date = d.day)::int AS scores,
          (SELECT COUNT(*) FROM testing_results tr
            WHERE (tr.created_at AT TIME ZONE ${TZ})::date = d.day)::int AS testing_scores,
          (SELECT COUNT(DISTINCT ae.user_id) FROM analytics_events ae
            WHERE (ae.ts AT TIME ZONE ${TZ})::date = d.day)::int AS active_users
        FROM days d
        ORDER BY d.day
      `,
      // Platform pulse — the one genuinely live series we have pre-season.
      sql`
        WITH days AS (
          SELECT generate_series(
            (NOW() AT TIME ZONE ${TZ})::date - (${PULSE_DAYS - 1} || ' days')::interval,
            (NOW() AT TIME ZONE ${TZ})::date,
            '1 day'::interval
          )::date AS day
        )
        SELECT d.day, COALESCE(e.c, 0)::int AS events, COALESCE(e.users, 0)::int AS users
        FROM days d
        LEFT JOIN (
          SELECT (ts AT TIME ZONE ${TZ})::date AS day,
                 COUNT(*) AS c,
                 COUNT(DISTINCT user_id) AS users
          FROM analytics_events
          WHERE ts >= NOW() - (${PULSE_DAYS} || ' days')::interval
          GROUP BY 1
        ) e ON e.day = d.day
        ORDER BY d.day
      `,
      sql`
        WITH sess AS (${SESSIONS_CTE})
        SELECT
          o.id, o.name, o.type,
          COALESCE(s.sessions, 0)::int AS session_count,
          COALESCE(s.hours, 0) AS hours,
          COALESCE(s.testing_hours, 0) AS testing_hours,
          (SELECT COUNT(*) FROM age_categories ac WHERE ac.organization_id = o.id)::int AS category_count,
          (SELECT COUNT(*) FROM athletes a WHERE a.organization_id = o.id AND a.is_active = true)::int AS athlete_count,
          (SELECT COUNT(*) FROM category_scores cs
             JOIN age_categories ac ON ac.id = cs.age_category_id
            WHERE ac.organization_id = o.id)::int AS score_count
        FROM organizations o
        LEFT JOIN (
          SELECT org_id,
                 COUNT(*) AS sessions,
                 ROUND(SUM(hours)::numeric, 1) AS hours,
                 ROUND(COALESCE(SUM(hours) FILTER (WHERE is_testing), 0)::numeric, 1) AS testing_hours
          FROM sess GROUP BY org_id
        ) s ON s.org_id = o.id
        ORDER BY hours DESC NULLS LAST, session_count DESC
        LIMIT 8
      `,
      // Provider payout ledger. Sideline Star collects every charge and remits
      // each provider's share off-platform, so this is the statement: what they
      // sold, what we kept, what they're owed.
      //
      // Joins on provider_org_id — who actually EARNED the sale (the SP that ran
      // the evals, else the association). The old query joined through the
      // category to the association, which is a different question and wrong
      // whenever an SP is involved. Falls back to the category's org for rows
      // written before the ledger existed.
      sql`
        SELECT
          o.id, o.name, o.type,
          COUNT(rp.id)::int AS reports,
          COALESCE(SUM(rp.amount_cents), 0)::int AS gross_cents,
          COALESCE(SUM(COALESCE(rp.platform_fee_cents, 0)), 0)::int AS platform_cents,
          COALESCE(SUM(rp.amount_cents - COALESCE(rp.platform_fee_cents, 0)), 0)::int AS owed_cents,
          MAX(rp.completed_at) AS last_purchase
        FROM report_purchases rp
        LEFT JOIN age_categories ac ON ac.id = rp.age_category_id
        JOIN organizations o ON o.id = COALESCE(rp.provider_org_id, ac.organization_id)
        WHERE rp.status = 'completed'
        GROUP BY o.id, o.name, o.type
        ORDER BY owed_cents DESC, reports DESC
        LIMIT 8
      `,
      sql`
        SELECT ae.id, ae.ts, ae.event, ae.role, ae.duration_ms,
               u.name AS user_name, o.name AS org_name
        FROM analytics_events ae
        LEFT JOIN users u ON u.id = ae.user_id
        LEFT JOIN organizations o ON o.id = ae.org_id
        ORDER BY ae.ts DESC
        LIMIT 25
      `,
    ]);

    const n = v => (v == null ? 0 : Number(v));

    return NextResponse.json({
      overview: Object.fromEntries(Object.entries(overview[0]).map(([k, v]) => [k, n(v)])),
      today: Object.fromEntries(Object.entries(today[0]).map(([k, v]) => [k, n(v)])),
      series: series.map(r => ({
        day: r.day,
        sessions: n(r.sessions),
        hours: n(r.hours),
        testing_hours: n(r.testing_hours),
        scores: n(r.scores),
        testing_scores: n(r.testing_scores),
        active_users: n(r.active_users),
      })),
      pulse: pulse.map(r => ({ day: r.day, events: n(r.events), users: n(r.users) })),
      topOrgs: topOrgs.map(o => ({ ...o, hours: n(o.hours), testing_hours: n(o.testing_hours) })),
      // Surfaced so the ledger footer states the actual configured cut rather
      // than a hardcoded 25% that could drift from REPORT_PLATFORM_FEE_BPS.
      feeBps: PLATFORM_FEE_BPS(),
      providerLedger: providerLedger.map(b => ({
        ...b,
        gross_cents: n(b.gross_cents),
        platform_cents: n(b.platform_cents),
        owed_cents: n(b.owed_cents),
      })),
      feed,
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
