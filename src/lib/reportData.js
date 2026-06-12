import sql from "@/lib/db";
import { computeCategoryRankings } from "@/lib/rankings";
import { getCoachUserIds } from "@/lib/categoryEvaluators";

// Canonical SportTesting order: Forward Sprint, Forward Sprint w/ Puck, Backward
// Sprint, Weave Agility, Transition Agility L, Transition Agility R, Stop & Start.
// Keyword-matched so name variants ("30M Forward Sprint") still slot in; unknown
// tests fall to the end (alphabetical among themselves).
function testOrder(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("forward")) return n.includes("puck") ? 2 : 1;
  if (n.includes("backward")) return 3;
  if (n.includes("puck")) return 2; // "sprint with puck" without the word "forward"
  if (n.includes("transition")) return n.includes("right") ? 6 : 5;
  if (n.includes("weave") || n.includes("agility")) return 4;
  if (n.includes("stop") || n.includes("start") || n.includes("caps")) return 7;
  return 99;
}

// Single source of truth for the parent Development Report payload. Used by both
// the authed director render (/api/athletes/[id]/report) and the token-gated
// paid-parent render (/api/report/[token]). The caller is responsible for
// authorization; this just computes the data for an athlete in a category.
//
// Notes are returned WITHOUT evaluator names — the report design never shows
// who wrote a note, and this payload is served to paying parents, so we never
// put real evaluator identities on the wire.
export async function buildAthleteReport(catId, athleteId) {
  const athleteRes = await sql`
    SELECT a.*, o.name as org_name
    FROM athletes a JOIN organizations o ON o.id = a.organization_id
    WHERE a.id = ${athleteId}
  `;
  if (!athleteRes.length) return null;

  const category = await sql`SELECT * FROM age_categories WHERE id = ${catId}`;
  const round1 = (v) => (v != null ? Math.round(v * 10) / 10 : null);

  // ── Rankings from the single source of truth (no HTTP self-fetch) ──
  const rankData = await computeCategoryRankings(catId);
  const athleteRanking = rankData.athletes?.find(a => String(a.id) === String(athleteId));
  const totalAthletes = rankData.athletes?.length || 0;

  // ── Standing: tier + coarse band, deliberately NOT an exact rank ──
  const rank = athleteRanking?.rank || null;
  let standing = null;
  if (rank && totalAthletes > 0) {
    const percentile = totalAthletes > 1 ? Math.round(((totalAthletes - rank) / (totalAthletes - 1)) * 100) : 100;
    const tier = percentile >= 90 ? "Elite" : percentile >= 75 ? "Above Average" : percentile >= 50 ? "Average" : percentile >= 25 ? "Below Average" : "Developing";
    const band = percentile >= 90 ? "Top 10%" : percentile >= 75 ? "Top 25%" : percentile >= 50 ? "Top half" : percentile >= 25 ? "Bottom half" : "Bottom 25%";
    standing = { percentile, tier, band, total: totalAthletes };
  }

  // ── Per-skill profile: player vs group vs top tier (coach scores excluded) ──
  const coachIds = await getCoachUserIds(catId);
  const coachKeys = coachIds.map(String);
  const groupAvg = await sql`
    SELECT cs.scoring_category_id, sc.name AS category_name, sc.display_order, AVG(cs.score)::float AS avg
    FROM category_scores cs JOIN scoring_categories sc ON sc.id = cs.scoring_category_id
    WHERE cs.age_category_id = ${catId} AND cs.evaluator_id <> ALL(${coachIds})
    GROUP BY cs.scoring_category_id, sc.name, sc.display_order
    ORDER BY sc.display_order
  `;
  const topCount = Math.max(1, Math.ceil(totalAthletes * 0.25));
  const topIds = (rankData.athletes || []).filter(a => a.rank && a.rank <= topCount).map(a => a.id);
  let topMap = {};
  if (topIds.length) {
    const topAvg = await sql`
      SELECT cs.scoring_category_id, AVG(cs.score)::float AS avg
      FROM category_scores cs
      WHERE cs.age_category_id = ${catId} AND cs.evaluator_id <> ALL(${coachIds}) AND cs.athlete_id = ANY(${topIds})
      GROUP BY cs.scoring_category_id
    `;
    topMap = Object.fromEntries(topAvg.map(r => [r.scoring_category_id, r.avg]));
  }
  const playerScores = await sql`
    SELECT cs.scoring_category_id, cs.score, cs.evaluator_id, cs.session_number
    FROM category_scores cs
    WHERE cs.athlete_id = ${athleteId} AND cs.age_category_id = ${catId}
  `;
  const playerSum = {}, playerCnt = {};
  for (const s of playerScores) {
    if (coachKeys.includes(String(s.evaluator_id))) continue;
    const k = s.scoring_category_id;
    playerSum[k] = (playerSum[k] || 0) + parseFloat(s.score);
    playerCnt[k] = (playerCnt[k] || 0) + 1;
  }
  const skillProfile = groupAvg.map(r => ({
    scoring_category_id: r.scoring_category_id,
    name: r.category_name,
    display_order: r.display_order,
    player: playerCnt[r.scoring_category_id] ? round1(playerSum[r.scoring_category_id] / playerCnt[r.scoring_category_id]) : null,
    group: round1(r.avg),
    top: round1(topMap[r.scoring_category_id]),
  }));

  // ── Objective testing: best per test vs group avg / group best (lower = better) ──
  let testingProfile = [];
  try {
    const tp = await sql`
      SELECT b.test_name,
        AVG(b.best)::float AS group_avg,
        MIN(b.best)::float AS group_best,
        (MAX(b.best) FILTER (WHERE b.athlete_id = ${athleteId}))::float AS player_best
      FROM (
        SELECT athlete_id, test_name, MIN(value) AS best
        FROM testing_results WHERE age_category_id = ${catId}
        GROUP BY athlete_id, test_name
      ) b
      GROUP BY b.test_name
      ORDER BY b.test_name
    `;
    const round3 = (v) => (v != null ? Math.round(v * 1000) / 1000 : null);
    testingProfile = tp
      .filter(r => r.player_best != null)
      .map(r => ({
        test_name: r.test_name,
        player_best: round3(r.player_best),
        group_avg: round3(r.group_avg),
        group_best: round3(r.group_best),
        lower_is_better: true,
      }))
      .sort((a, b) => testOrder(a.test_name) - testOrder(b.test_name) || a.test_name.localeCompare(b.test_name));
  } catch { testingProfile = []; }

  // ── Session-over-session progress: player avg vs group avg per session ──
  // The $24.99 value-add — shows movement across the evaluation, not just a
  // single snapshot. Coach scores excluded to match the skill profile.
  const groupBySession = await sql`
    SELECT cs.session_number, AVG(cs.score)::float AS avg
    FROM category_scores cs
    WHERE cs.age_category_id = ${catId} AND cs.evaluator_id <> ALL(${coachIds})
    GROUP BY cs.session_number ORDER BY cs.session_number
  `;
  const playerBySession = {};
  const playerCntSession = {};
  for (const s of playerScores) {
    if (coachKeys.includes(String(s.evaluator_id))) continue;
    const k = s.session_number;
    playerBySession[k] = (playerBySession[k] || 0) + parseFloat(s.score);
    playerCntSession[k] = (playerCntSession[k] || 0) + 1;
  }
  const progress = groupBySession.map(r => ({
    session_number: r.session_number,
    player: playerCntSession[r.session_number] ? round1(playerBySession[r.session_number] / playerCntSession[r.session_number]) : null,
    group: round1(r.avg),
  }));

  // ── Evaluator notes (no names) ──
  const notesRows = await sql`
    SELECT session_number, note_text
    FROM player_notes
    WHERE athlete_id = ${athleteId} AND age_category_id = ${catId}
    ORDER BY session_number, created_at
  `;
  const notes = notesRows.map(n => ({ session_number: n.session_number, note_text: n.note_text }));

  // Association-curated local training providers ("Where to put in the work"),
  // grouped by area. Renders in the report only when present.
  let trainingProviders = [];
  try {
    const tp = await sql`
      SELECT area, name, blurb, contact
      FROM training_providers
      WHERE organization_id = ${athleteRes[0].organization_id}
      ORDER BY area, sort_order, id
    `;
    const byArea = {};
    for (const p of tp) { (byArea[p.area] ||= []).push({ name: p.name, blurb: p.blurb, contact: p.contact }); }
    trainingProviders = Object.entries(byArea).map(([area, providers]) => ({ area, providers }));
  } catch { trainingProviders = []; }

  return {
    athlete: athleteRes[0],
    category: category[0] || null,
    org_name: athleteRes[0].org_name || null,
    standing,
    skillProfile,
    testingProfile,
    progress,
    notes,
    trainingProviders,
    ranking: athleteRanking || null,
    total_athletes: totalAthletes,
  };
}
