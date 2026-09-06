// Sorting + per-athlete indexing for testing results.
//
// Kept out of the components so the ordering rules are testable: getting them
// subtly wrong is invisible on screen but changes who looks fastest.

// Athletes with no value for the column being sorted always sink to the bottom,
// in BOTH directions. Treating a missing drill as 0 (or as Infinity) would put
// the kids who never skated it at the top of "fastest" -- which is how a page of
// dashes ended up sitting above real results.
function compareMissingLast(av, bv, dir) {
  const aMissing = av == null || Number.isNaN(av);
  const bMissing = bv == null || Number.isNaN(bv);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return dir === "desc" ? bv - av : av - bv;
}

function valueFor(athlete, key, field) {
  if (key === "rank") return athlete.overall_rank;
  if (key === "name") return null;
  const t = (athlete.tests || []).find(x => x.test_name === key);
  if (!t) return null;
  const v = field === "rank" ? t.rank : t.value;
  return v == null ? null : Number(v);
}

/**
 * @param athletes  rows from the testing-scores endpoint
 * @param sort      { key, dir, field } -- key is "rank", "name", or a drill
 *                  name; field is "value" (default) or "rank" for a drill.
 */
export function sortTestingAthletes(athletes, sort) {
  const list = [...(athletes || [])];
  const { key = "rank", dir = "asc", field = "value" } = sort || {};

  if (key === "name") {
    return list.sort((a, b) => {
      const an = `${a.last_name} ${a.first_name}`.toLowerCase();
      const bn = `${b.last_name} ${b.first_name}`.toLowerCase();
      const c = an.localeCompare(bn);
      return dir === "desc" ? -c : c;
    });
  }

  return list.sort((a, b) => {
    const c = compareMissingLast(valueFor(a, key, field), valueFor(b, key, field), dir);
    // A tie on a drill falls back to overall rank so the order is stable and
    // meaningful rather than whatever the array happened to hold.
    if (c !== 0) return c;
    return compareMissingLast(a.overall_rank, b.overall_rank, "asc");
  });
}

// Clicking the column you are already sorted by flips direction; clicking a new
// one starts it in its natural direction. For a time or a rank, lower is better,
// so ascending is the useful default -- but a name reads A-Z.
export function nextSort(current, key, field = "value") {
  const same = current?.key === key && (current?.field || "value") === field;
  if (same) return { key, field, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, field, dir: "asc" };
}

/**
 * Index the testing-scores payload by athlete so a player's own results can be
 * shown on their record. Returns Map<athlete_id, { sessions: [...] }> where each
 * session carries the athlete's overall rank, how many athletes were tested
 * (so a rank reads "31 of 111"), and their drills in the order they were run.
 */
export function indexTestingByAthlete(sessions) {
  const byAthlete = new Map();
  for (const s of sessions || []) {
    const tested = (s.athletes || []).length;
    for (const a of s.athletes || []) {
      if (!byAthlete.has(a.athlete_id)) byAthlete.set(a.athlete_id, { sessions: [] });
      byAthlete.get(a.athlete_id).sessions.push({
        session_number: s.session_number,
        overall_rank: a.overall_rank,
        tested,
        // test_names is the run order; a drill the athlete missed is left out
        // rather than shown as a blank row.
        tests: (s.test_names || []).
          map(name => (a.tests || []).find(t => t.test_name === name)).
          filter(Boolean),
      });
    }
  }
  for (const v of byAthlete.values()) v.sessions.sort((a, b) => a.session_number - b.session_number);
  return byAthlete;
}
