import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import { logEvent } from "@/lib/analytics";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const auth = await authorizeOrgAccess(session, params.orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const categories = await sql`
      SELECT ac.*,
        COUNT(DISTINCT a.id) as athletes_count,
        COUNT(DISTINCT es.id) as sessions_count,
        (SELECT COUNT(*) FROM category_sessions cs WHERE cs.age_category_id = ac.id) AS cs_total,
        (SELECT COUNT(*) FROM category_sessions cs WHERE cs.age_category_id = ac.id AND cs.status = 'complete') AS cs_complete,
        ac.setup_complete
      FROM age_categories ac
      LEFT JOIN athletes a ON a.age_category_id = ac.id AND a.is_active = true
      LEFT JOIN evaluation_schedule es ON es.age_category_id = ac.id
      -- Goalie-only categories live in the association's Manage Goalies area, not
      -- the main (player) category list.
      WHERE ac.organization_id = ${params.orgId} AND COALESCE(ac.goalie_only, false) = false
      GROUP BY ac.id
      ORDER BY ac.name
    `;

    // Per-category "up next": which sessions are complete (computed live the same
    // way the ranking engine does — testing done when every skater has a testing
    // rank; scrimmage done at >=70% of athletes scored — not the stored
    // category_sessions.status flag, which real flows don't keep current). Drives
    // the dashboard's next-step card.
    try {
      const rows = await sql`
        SELECT cs.age_category_id AS cat, cs.session_number AS sn, cs.session_type AS type,
          (SELECT COUNT(*) FROM athletes a WHERE a.age_category_id = cs.age_category_id AND a.is_active = true AND a.position <> 'goalie')::int AS skaters,
          (SELECT COUNT(*) FROM athletes a WHERE a.age_category_id = cs.age_category_id AND a.is_active = true)::int AS total_ath,
          (SELECT COUNT(*) FROM testing_drill_results t WHERE t.age_category_id = cs.age_category_id AND t.session_number = cs.session_number)::int AS testing_n,
          (SELECT COUNT(DISTINCT c.athlete_id) FROM category_scores c WHERE c.age_category_id = cs.age_category_id AND c.session_number = cs.session_number)::int AS scored_n
        FROM category_sessions cs
        JOIN age_categories ac ON ac.id = cs.age_category_id
        WHERE ac.organization_id = ${params.orgId}
        ORDER BY cs.age_category_id, cs.session_number`;

      const byCat = {};
      for (const r of rows) {
        (byCat[r.cat] = byCat[r.cat] || { total: 0, complete: [] });
        byCat[r.cat].total++;
        const done = r.type === "testing"
          ? (r.skaters > 0 && r.testing_n >= r.skaters)
          : (r.total_ath > 0 && r.scored_n >= Math.ceil(r.total_ath * 0.7));
        if (done) byCat[r.cat].complete.push(r.sn);
      }
      for (const c of categories) {
        const info = byCat[c.id];
        c.next_action = null;
        // Only the AFTER-session steps surface on the main dashboard. The
        // before-session-1 first step lives on the age-category page only
        // (computed there), by request.
        if (info && info.complete.length) {
          const last = Math.max(...info.complete);
          if (info.complete.length === info.total) c.next_action = { kind: "teams", last };
          else if (last < info.total) c.next_action = { kind: "groups", last, next: last + 1 };
        }
      }
    } catch { /* non-fatal — card just won't show */ }

    // Next upcoming sessions across the whole association (for the dashboard's
    // "Upcoming schedule" rail). signups lets us flag understaffed sessions.
    let upcoming = [];
    try {
      upcoming = await sql`
        SELECT es.id, es.scheduled_date, es.start_time, es.end_time, es.location,
          es.session_number, es.group_number, es.evaluators_required, es.goalie_evaluators_required,
          ac.name AS category_name, cs.session_type,
          COUNT(ess.id) FILTER (WHERE ess.status = 'signed_up') AS signups
        FROM evaluation_schedule es
        JOIN age_categories ac ON ac.id = es.age_category_id
        LEFT JOIN category_sessions cs ON cs.age_category_id = es.age_category_id AND cs.session_number = es.session_number
        LEFT JOIN evaluator_session_signups ess ON ess.schedule_id = es.id
        WHERE ac.organization_id = ${params.orgId}
          AND es.scheduled_date >= CURRENT_DATE
          AND es.status = 'scheduled'
        GROUP BY es.id, ac.name, cs.session_type
        ORDER BY es.scheduled_date ASC, es.start_time ASC
        LIMIT 8
      `;
    } catch { upcoming = []; }

    // True count of all upcoming sessions (the list above is capped) so the
    // dashboard can show "next 3" + an accurate "N more" ticker.
    let upcomingTotal = upcoming.length;
    try {
      const [row] = await sql`
        SELECT COUNT(*)::int AS n
        FROM evaluation_schedule es
        JOIN age_categories ac ON ac.id = es.age_category_id
        WHERE ac.organization_id = ${params.orgId}
          AND es.scheduled_date >= CURRENT_DATE
          AND es.status = 'scheduled'
      `;
      upcomingTotal = row?.n ?? upcoming.length;
    } catch { /* keep fallback */ }

    return NextResponse.json({ categories, upcoming, upcomingTotal });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const CAT_WRITE_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin", "goalie_service_provider_admin"]);

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!CAT_WRITE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const auth = await authorizeOrgAccess(session, params.orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { name, min_age, max_age } = await request.json();
    const result = await sql`
      INSERT INTO age_categories (organization_id, name, min_age, max_age)
      VALUES (${params.orgId}, ${name}, ${min_age || null}, ${max_age || null})
      RETURNING *
    `;
    // New category inherits the org-level goalie template (materialized into its
    // goalie_config + goalie scoring_categories). Best-effort — never block create.
    try {
      const { getEffectiveGoalieTemplate, applyTemplateToCategory } = await import("@/lib/goalieTemplate");
      const { template } = await getEffectiveGoalieTemplate(params.orgId);
      await applyTemplateToCategory(result[0].id, template);
    } catch (e) { console.error("goalie template apply on create:", e?.message); }

    logEvent({
      userId: await getAppUserId(session),
      role: session.role || "anonymous",
      event: "category.created",
      orgId: parseInt(params.orgId, 10) || null,
      metadata: { catId: result[0].id },
    });
    return NextResponse.json({ category: result[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
