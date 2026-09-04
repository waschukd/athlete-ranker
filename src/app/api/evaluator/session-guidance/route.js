// Combines the group-range calibration (session-floor/session-ranges) with a
// per-evaluator bias signal into one payload for a single guidance popup
// shown when an evaluator opens a session. Real incident (BAHA "Grant
// factor"): a systematically generous evaluator ran ~1-1.5 points above every
// other evaluator, every night, in a category where round_robin rankings now
// correct for that AFTER the fact -- but the evaluator scoring live had no
// idea they ran hot, and no idea what range the tier in front of them should
// land in. This surfaces both proactively, before they enter a single score.
//
// Session 1 is conventionally a testing/skills session with no evaluator
// scoring group structure to calibrate against -- returns applicable:false
// for any session_type other than a real scored group session.
//
// Returns: { applicable, scale, group_number, total_groups, suggested_range,
//            established_range, prior_floor, bias }

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { MIN_SCORES_FOR_EVALUATOR_CORRECTION } from "@/lib/rankings";
import { suggestedRange } from "@/lib/scoringGuidance";

// Below this, a personal average vs. the field is noise, not a real signal
// worth acting on -- same idea as the sample-size floor above, just on the
// gap itself rather than the count.
const MIN_BIAS_TO_SHOW = 0.3;

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const appUserId = await getAppUserId(session);

    const { searchParams } = new URL(request.url);
    const catId = searchParams.get("category_id");
    const sessionNumber = searchParams.get("session_number");
    const groupNumber = parseInt(searchParams.get("group_number"), 10);

    if (!catId || !sessionNumber || !groupNumber) {
      return NextResponse.json({ error: "category_id, session_number, group_number required" }, { status: 400 });
    }

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [catRow] = await sql`SELECT scoring_scale FROM age_categories WHERE id = ${catId}`;
    const scale = parseFloat(catRow?.scoring_scale || 10);

    const [sessCfg] = await sql`
      SELECT session_type FROM category_sessions
      WHERE age_category_id = ${catId} AND session_number = ${sessionNumber}
    `;
    if (!sessCfg || sessCfg.session_type === "testing") {
      return NextResponse.json({ applicable: false });
    }

    const [groupCountRow] = await sql`
      SELECT COUNT(*)::int AS n FROM session_groups
      WHERE age_category_id = ${catId} AND session_number = ${sessionNumber}
    `;
    const totalGroups = groupCountRow?.n || groupNumber;

    // Same source as session-ranges (per-group real range so far) and
    // session-floor (the lowest average from every group before this one) --
    // computed together here as one query instead of the popup firing three
    // separate requests.
    const rangeRows = await sql`
      WITH scored AS (
        SELECT cs.athlete_id, cs.score, sg.group_number
        FROM category_scores cs
        JOIN player_group_assignments pga ON pga.athlete_id = cs.athlete_id
        JOIN session_groups sg ON sg.id = pga.session_group_id
          AND sg.age_category_id = cs.age_category_id AND sg.session_number = cs.session_number
        WHERE cs.age_category_id = ${catId} AND cs.session_number = ${sessionNumber}
      ),
      athlete_avgs AS (
        SELECT athlete_id, group_number, AVG(score)::float AS avg_score FROM scored GROUP BY athlete_id, group_number
      )
      SELECT group_number, MIN(avg_score)::float AS floor, MAX(avg_score)::float AS ceiling, COUNT(*)::int AS athletes_counted
      FROM athlete_avgs GROUP BY group_number
    `;
    const byGroup = Object.fromEntries(rangeRows.map(r => [r.group_number, r]));
    const thisGroup = byGroup[groupNumber];
    const establishedRange = thisGroup
      ? { floor: Math.round(thisGroup.floor * 10) / 10, ceiling: Math.round(thisGroup.ceiling * 10) / 10, athletes_counted: thisGroup.athletes_counted }
      : null;

    let priorFloor = null;
    if (groupNumber > 1) {
      const priorFloors = Object.entries(byGroup)
        .filter(([g]) => parseInt(g, 10) < groupNumber)
        .map(([, r]) => r.floor);
      if (priorFloors.length) priorFloor = Math.round(Math.min(...priorFloors) * 10) / 10;
    }

    // Personal bias: this evaluator's own average in this category so far vs.
    // every evaluator's average in this category so far -- same math and
    // sample-size floor as applyEvaluatorCorrection (rankings.js), so this
    // message and the correction actually applied to rankings never disagree.
    let bias = null;
    if (appUserId) {
      const [biasRow] = await sql`
        SELECT
          COUNT(*)::int AS total_n, AVG(score)::float AS grand_mean,
          COUNT(*) FILTER (WHERE evaluator_id = ${appUserId})::int AS my_n,
          AVG(score) FILTER (WHERE evaluator_id = ${appUserId})::float AS my_mean
        FROM category_scores WHERE age_category_id = ${catId}
      `;
      if (biasRow?.my_n >= MIN_SCORES_FOR_EVALUATOR_CORRECTION && biasRow.total_n > 0) {
        const delta = biasRow.my_mean - biasRow.grand_mean;
        if (Math.abs(delta) >= MIN_BIAS_TO_SHOW) {
          bias = { delta: Math.round(Math.abs(delta) * 10) / 10, direction: delta > 0 ? "higher" : "lower", sample_size: biasRow.my_n };
        }
      }
    }

    return NextResponse.json({
      applicable: true,
      scale,
      group_number: groupNumber,
      total_groups: totalGroups,
      suggested_range: suggestedRange(groupNumber, totalGroups, scale),
      established_range: establishedRange,
      prior_floor: priorFloor,
      bias,
    });
  } catch (error) {
    console.error("Session guidance error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
