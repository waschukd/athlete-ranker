import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { getCoachUserIds } from "@/lib/categoryEvaluators";
import { applyEvaluatorCorrection } from "@/lib/rankings";

// Per-criterion averages for every athlete in a category: their mean score in
// Skating, Puck Skills, Effort/Compete, Hockey IQ (or whatever criteria the
// category defines), averaged across every evaluator and every session.
//
// Backs the Analysis -> Reports "Rank by Category" table, which sorts the whole
// roster high-to-low on any single criterion. The Rankings tab answers "who is
// best overall"; this answers "who are the four best skaters", which is the
// question being asked when teams get built around a need.
//
// Coach scores are excluded, matching the official ranking -- a coach's scores
// are advisory and never move a player's standing. Goalie criteria are kept in
// their own set so a goalie's mobility average never lands in a skater column.
//
// GET /api/categories/:catId/skill-averages

// authorizeCategoryAccess alone also admits plain evaluators; this returns the
// whole roster's per-criterion averages with names attached, which is exactly
// what evaluators_anonymous keeps away from an evaluator.
const REPORT_ROLES = new Set([
  "super_admin", "association_admin", "service_provider_admin",
  "goalie_service_provider_admin", "director",
]);

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!REPORT_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [category] = await sql`
      SELECT id, name, scoring_scale, evaluators_anonymous, eval_format FROM age_categories WHERE id = ${catId}`;
    if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const scale = parseFloat(category.scoring_scale || 10);

    const criteria = await sql`
      SELECT id, name, applies_to FROM scoring_categories
      WHERE age_category_id = ${catId}
      ORDER BY display_order NULLS LAST, id`;

    // Coaches' scores are advisory -- excluded here so this table and the
    // official ranking cannot disagree about the same player.
    const coachIds = await getCoachUserIds(catId);

    // Raw per-row scores (not pre-aggregated in SQL) -- for round_robin
    // categories these need the same evaluator-generosity correction the
    // official ranking applies (see applyEvaluatorCorrection in rankings.js)
    // before being averaged, or this table would silently disagree with the
    // official ranking about the same player, which the comment above
    // promises never happens.
    const rawRows = coachIds.length
      ? await sql`
          SELECT cs.athlete_id, cs.scoring_category_id, cs.evaluator_id, cs.session_number, cs.score
          FROM category_scores cs
          WHERE cs.age_category_id = ${catId}
            AND cs.evaluator_id <> ALL(${coachIds})`
      : await sql`
          SELECT cs.athlete_id, cs.scoring_category_id, cs.evaluator_id, cs.session_number, cs.score
          FROM category_scores cs
          WHERE cs.age_category_id = ${catId}`;

    const scoreRows = category.eval_format === "round_robin"
      ? applyEvaluatorCorrection(rawRows, scale)
      : rawRows;

    const grouped = new Map();
    for (const r of scoreRows) {
      const key = `${r.athlete_id}_${r.scoring_category_id}`;
      if (!grouped.has(key)) {
        grouped.set(key, { athlete_id: r.athlete_id, scoring_category_id: r.scoring_category_id, sum: 0, n: 0, evaluators: new Set(), sessions: new Set() });
      }
      const g = grouped.get(key);
      g.sum += parseFloat(r.score);
      g.n++;
      g.evaluators.add(r.evaluator_id);
      g.sessions.add(r.session_number);
    }
    const rows = Array.from(grouped.values()).map(g => ({
      athlete_id: g.athlete_id,
      scoring_category_id: g.scoring_category_id,
      avg_score: g.sum / g.n,
      n_scores: g.n,
      n_evaluators: g.evaluators.size,
      n_sessions: g.sessions.size,
    }));

    const athleteRows = await sql`
      SELECT id, first_name, last_name, position, helmet_number, is_active, cut_at
      FROM athletes
      WHERE age_category_id = ${catId} AND is_active = true
      ORDER BY last_name, first_name`;

    const byAthlete = new Map();
    for (const r of rows) {
      if (!byAthlete.has(r.athlete_id)) byAthlete.set(r.athlete_id, {});
      byAthlete.get(r.athlete_id)[r.scoring_category_id] = {
        avg: Math.round(r.avg_score * 100) / 100,
        n_scores: r.n_scores,
        n_evaluators: r.n_evaluators,
        n_sessions: r.n_sessions,
      };
    }

    const isGoalie = (a) => String(a.position || "").toLowerCase() === "goalie";

    const athletes = athleteRows.map(a => {
      const scores = byAthlete.get(a.id) || {};
      // Only average the criteria that apply to this athlete, so a skater's
      // overall is not diluted by empty goalie columns and vice versa.
      const applicable = criteria.filter(c =>
        isGoalie(a) ? (c.applies_to === "goalies" || c.applies_to === "goalie_skills" || c.applies_to === "all")
                    : (c.applies_to !== "goalies" && c.applies_to !== "goalie_skills"));
      const vals = applicable.map(c => scores[c.id]?.avg).filter(v => typeof v === "number");
      const overall = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : null;
      const evaluators = Math.max(0, ...applicable.map(c => scores[c.id]?.n_evaluators || 0));
      const sessions = Math.max(0, ...applicable.map(c => scores[c.id]?.n_sessions || 0));
      return {
        athlete_id: a.id,
        first_name: a.first_name,
        last_name: a.last_name,
        position: a.position,
        helmet_number: a.helmet_number,
        cut: !!a.cut_at,
        is_goalie: isGoalie(a),
        scores,
        overall,
        evaluators,
        sessions,
        scored: vals.length > 0,
      };
    });

    return NextResponse.json({
      category: { id: category.id, name: category.name, scoring_scale: scale },
      criteria,
      athletes,
      coach_scores_excluded: coachIds.length,
    });
  } catch (error) {
    console.error("Skill averages GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
