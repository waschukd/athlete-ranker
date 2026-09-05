import sql from "@/lib/db";
import { tierDisagreementStats } from "@/lib/scoring";
import { getCoachPairSet } from "@/lib/categoryEvaluators";

// Real tier-consensus agreement rate + raw signed bias for one evaluator,
// scoped to whatever categories they've actually scored in. Shared by the
// "send report card" education email (service-provider/evaluators POST) so
// it sends the same numbers a director sees on the evaluator's own report
// card page, not a re-derived approximation.
export async function computeEvaluatorReportCard(evalId) {
  const allScores = await sql`
    SELECT score, session_number, age_category_id, scoring_category_id, athlete_id
    FROM category_scores WHERE evaluator_id = ${evalId}
  `;
  if (!allScores.length) return { agreementPct: null, judged: 0, bias: null };

  const touchedCatIds = [...new Set(allScores.map(s => s.age_category_id))];

  const peerScores = await sql`
    SELECT cs.score, cs.session_number, cs.age_category_id, cs.scoring_category_id, cs.athlete_id
    FROM category_scores cs
    WHERE cs.evaluator_id != ${evalId} AND cs.age_category_id = ANY(${touchedCatIds})
      AND EXISTS (
        SELECT 1 FROM category_scores mine
        WHERE mine.evaluator_id = ${evalId} AND mine.athlete_id = cs.athlete_id
          AND mine.session_number = cs.session_number AND mine.scoring_category_id = cs.scoring_category_id
          AND mine.age_category_id = cs.age_category_id
      )
  `;
  const peerMap = new Map();
  for (const ps of peerScores) {
    const key = `${ps.athlete_id}-${ps.scoring_category_id}-${ps.session_number}-${ps.age_category_id}`;
    if (!peerMap.has(key)) peerMap.set(key, []);
    peerMap.get(key).push(parseFloat(ps.score));
  }
  let totalMine = 0, totalPeers = 0, n = 0;
  for (const s of allScores) {
    const key = `${s.athlete_id}-${s.scoring_category_id}-${s.session_number}-${s.age_category_id}`;
    const peers = peerMap.get(key);
    if (peers?.length) {
      totalMine += parseFloat(s.score);
      totalPeers += peers.reduce((a, b) => a + b, 0) / peers.length;
      n++;
    }
  }
  const bias = n > 0 ? Math.round(((totalMine / n) - (totalPeers / n)) * 100) / 100 : null;

  const groupedRows = await sql`
    SELECT cs.age_category_id, cs.session_number, sg.group_number, cs.athlete_id, cs.evaluator_id, cs.score::float as score
    FROM category_scores cs
    JOIN player_group_assignments pga ON pga.athlete_id = cs.athlete_id
    JOIN session_groups sg ON sg.id = pga.session_group_id
      AND sg.age_category_id = cs.age_category_id AND sg.session_number = cs.session_number
    WHERE cs.age_category_id = ANY(${touchedCatIds})
  `;
  const coachSet = await getCoachPairSet(touchedCatIds);
  const stats = tierDisagreementStats(groupedRows, coachSet);
  const mine = stats.get(parseInt(evalId));
  const agreementPct = mine && mine.totalJudged > 0 ? Math.round((1 - mine.timesDiffered / mine.totalJudged) * 100) : null;
  const judged = mine?.totalJudged || 0;

  return { agreementPct, judged, bias };
}
