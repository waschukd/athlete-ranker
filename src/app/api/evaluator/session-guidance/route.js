// Combines a per-evaluator bias signal with format-appropriate range
// calibration into one payload for a single guidance popup shown when an
// evaluator opens a session. Real incident (BAHA "Grant factor"): a
// systematically generous evaluator ran ~1-1.5 points above every other
// evaluator, every night, in a category where round_robin rankings now
// correct for that AFTER the fact -- but the evaluator scoring live had no
// idea they ran hot. This surfaces the bias signal proactively either way.
//
// Standard-format categories use group_number as a skill TIER (Group 1 is
// the top tier) scored alongside every other tier the same night -- those get
// a fixed suggested range (lib/scoringGuidance.js, tier position only, never
// what's actually been scored -- see the "Real incident" comment below) plus
// a "beat the tier above" floor, which IS the real lowest score the tier
// above has actually gotten so far, not a fixed guess.
//
// Tournament (round_robin) categories rotate a DIFFERENT evaluator panel
// across nights, and group_number there means "which game/matchup," not a
// tier -- there IS no fixed range to hold a player to. Those get an
// explicitly open range plus a plain reference point: what the field actually
// scored last time this category was evaluated, so an evaluator isn't
// starting completely blind, without implying a tier boundary that doesn't
// exist for this format.
//
// Session 1 is conventionally a testing/skills session with no evaluator
// scoring to calibrate against -- returns applicable:false for any
// session_type other than a real scored session.
//
// Returns (standard): { applicable, format: "standard", scale, group_number,
//   total_groups, suggested_range, prior_floor, bias }
// Returns (tournament): { applicable, format: "tournament", scale,
//   last_session, bias }

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { getCoachUserIds } from "@/lib/categoryEvaluators";
import { MIN_SCORES_FOR_EVALUATOR_CORRECTION } from "@/lib/rankings";
import { suggestedRange } from "@/lib/scoringGuidance";

// Below this, a personal average vs. the field is noise, not a real signal
// worth acting on -- same idea as the sample-size floor above, just on the
// gap itself rather than the count.
const MIN_BIAS_TO_SHOW = 0.3;
const round1 = (v) => Math.round(v * 10) / 10;

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

    const [catRow] = await sql`SELECT scoring_scale, eval_format FROM age_categories WHERE id = ${catId}`;
    const scale = parseFloat(catRow?.scoring_scale || 10);
    const isTournament = catRow?.eval_format === "round_robin";

    const [sessCfg] = await sql`
      SELECT session_type FROM category_sessions
      WHERE age_category_id = ${catId} AND session_number = ${sessionNumber}
    `;
    if (!sessCfg || sessCfg.session_type === "testing") {
      return NextResponse.json({ applicable: false });
    }

    // Personal bias: this evaluator's own average in this category so far vs.
    // every evaluator's average in this category so far -- same math and
    // sample-size floor as applyEvaluatorCorrection (rankings.js), so this
    // message and the correction actually applied to rankings never disagree.
    // Shared by both formats.
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
          bias = { delta: round1(Math.abs(delta)), direction: delta > 0 ? "higher" : "lower", sample_size: biasRow.my_n };
        }
      }
    }

    if (isTournament) {
      // Most recent EARLIER session that actually has scores -- session
      // numbers can skip a testing/bye session, and the immediately-prior
      // number isn't guaranteed to have anything scored yet either.
      const [lastRow] = await sql`
        SELECT MAX(session_number)::int AS n FROM category_scores
        WHERE age_category_id = ${catId} AND session_number < ${sessionNumber}
      `;
      let lastSession = null;
      if (lastRow?.n != null) {
        const coachIds = await getCoachUserIds(catId);
        const [refRow] = await sql`
          WITH per_athlete AS (
            SELECT athlete_id, AVG(score)::float AS avg_score
            FROM category_scores
            WHERE age_category_id = ${catId} AND session_number = ${lastRow.n}
              AND evaluator_id <> ALL(${coachIds})
            GROUP BY athlete_id
          )
          SELECT MIN(avg_score)::float AS low, MAX(avg_score)::float AS high,
            AVG(avg_score)::float AS avg, COUNT(*)::int AS athletes_counted
          FROM per_athlete
        `;
        if (refRow?.athletes_counted > 0) {
          lastSession = {
            session_number: lastRow.n,
            low: round1(refRow.low), high: round1(refRow.high), avg: round1(refRow.avg),
            athletes_counted: refRow.athletes_counted,
          };
        }
      }
      return NextResponse.json({ applicable: true, format: "tournament", scale, last_session: lastSession, bias });
    }

    const [groupCountRow] = await sql`
      SELECT COUNT(*)::int AS n FROM session_groups
      WHERE age_category_id = ${catId} AND session_number = ${sessionNumber}
    `;
    const totalGroups = groupCountRow?.n || groupNumber;

    // Real incident: this used to ALSO let a live "established_range" (the
    // real min/max of whatever had actually been scored so far, for THIS
    // group) replace the fixed suggested_range the moment any real score
    // existed. That's a feedback loop: if the first evaluator in a group
    // scores low, "established" becomes low, everyone after them is shown
    // that low range as the target, and the group drifts lower call after
    // call -- exactly what happened to EFHA U11 session-to-session (see the
    // group-drift warning, built to detect the symptom of this). The
    // suggested_range for THIS group is fixed by design so it can't do that,
    // and it's the only range ever returned for the group being scored.
    //
    // prior_floor is different in kind, not degree: it's not this group's own
    // target moving, it's a real fact about a DIFFERENT group (the one
    // above) -- the actual lowest score a real evaluator gave a real kid up
    // there, this session. "Score higher than the suggested low of the tier
    // above" is a guess at what that bar will be; "score higher than 6.3,
    // which is literally the worst kid up there right now" is the real bar.
    // Falls back to the suggested low of the tier above only when nobody up
    // there has been scored yet -- there's no real number to give.
    let priorFloor = null;
    if (groupNumber > 1) {
      const [priorRow] = await sql`
        SELECT MIN(avg_score)::float AS floor
        FROM (
          SELECT cs.athlete_id, AVG(cs.score)::float AS avg_score
          FROM category_scores cs
          JOIN player_group_assignments pga ON pga.athlete_id = cs.athlete_id
          JOIN session_groups sg ON sg.id = pga.session_group_id
            AND sg.age_category_id = cs.age_category_id AND sg.session_number = cs.session_number
          WHERE cs.age_category_id = ${catId} AND cs.session_number = ${sessionNumber}
            AND sg.group_number = ${groupNumber - 1}
          GROUP BY cs.athlete_id
        ) per_athlete
      `;
      if (priorRow?.floor != null) priorFloor = round1(priorRow.floor);
    }

    return NextResponse.json({
      applicable: true,
      format: "standard",
      scale,
      group_number: groupNumber,
      total_groups: totalGroups,
      suggested_range: suggestedRange(groupNumber, totalGroups, scale),
      prior_floor: priorFloor,
      bias,
    });
  } catch (error) {
    console.error("Session guidance error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
