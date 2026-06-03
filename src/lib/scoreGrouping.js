// Shapes the flat per-score rows returned by GET /scores (detailed mode) into
// the nested structure the ScoreEditor renders: athlete → session → evaluator
// → { scoring_category_id: { score, category_name } }.
//
// Kept pure (no React, no fetch) so it can be unit-tested directly.
export function groupDetailedScores(rows) {
  if (!rows?.length) return [];
  const map = {};
  for (const row of rows) {
    const aKey = row.athlete_id;
    if (!map[aKey]) {
      map[aKey] = {
        id: row.athlete_id,
        name: `${row.first_name} ${row.last_name}`,
        jersey: row.jersey_number,
        sessions: {},
      };
    }
    const sKey = row.session_number;
    if (!map[aKey].sessions[sKey]) map[aKey].sessions[sKey] = {};
    const eKey = row.evaluator_id;
    if (!map[aKey].sessions[sKey][eKey]) {
      map[aKey].sessions[sKey][eKey] = {
        evaluator_name: row.evaluator_name,
        evaluator_id: row.evaluator_id,
        scores: {},
      };
    }
    map[aKey].sessions[sKey][eKey].scores[row.scoring_category_id] = {
      score: parseFloat(row.score),
      category_name: row.category_name,
    };
  }
  return Object.values(map);
}

// Flattens the same per-score rows into a spreadsheet grid: one row per
// (athlete, session, evaluator), with a `scores` map keyed by scoring category
// id. Row order follows the API's ordering (last name, first name, session,
// evaluator). Used by the Scores tab's spreadsheet view.
export function toScoreGrid(rows) {
  if (!rows?.length) return [];
  const map = {};
  for (const row of rows) {
    const key = `${row.athlete_id}|${row.session_number}|${row.evaluator_id}`;
    if (!map[key]) {
      map[key] = {
        key,
        athlete_id: row.athlete_id,
        athlete_name: `${row.first_name} ${row.last_name}`,
        jersey: row.jersey_number,
        session_number: row.session_number,
        evaluator_id: row.evaluator_id,
        evaluator_name: row.evaluator_name,
        scores: {},
      };
    }
    map[key].scores[row.scoring_category_id] = parseFloat(row.score);
  }
  return Object.values(map);
}
