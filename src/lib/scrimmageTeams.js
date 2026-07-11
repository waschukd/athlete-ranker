import sql from "@/lib/db";

// Persistent scrimmage teams (A/B/C…) for a round-robin category. Used ONLY when
// age_categories.eval_format = 'round_robin'; standard categories never touch this.
// Teams are assigned BEFORE session 1 (no scores to seed from), so seeds are
// score-free: alphabetical or an even snake by jersey. A director then drags to
// adjust. All reads are resilient (return [] pre-migration).

export const TEAM_LETTERS = ["A", "B", "C", "D", "E", "F"];

export async function getScrimmageTeams(catId) {
  try {
    const teams = await sql`SELECT id, name, display_order FROM scrimmage_teams WHERE age_category_id = ${catId} ORDER BY display_order, id`;
    if (!teams.length) return [];
    const members = await sql`
      SELECT stm.scrimmage_team_id, a.id AS athlete_id, a.first_name, a.last_name, a.jersey_number, a.position
      FROM scrimmage_team_members stm
      JOIN athletes a ON a.id = stm.athlete_id
      WHERE stm.scrimmage_team_id = ANY(${teams.map(t => t.id)})
      ORDER BY a.last_name, a.first_name`;
    const byTeam = new Map(teams.map(t => [t.id, { ...t, members: [] }]));
    for (const m of members) byTeam.get(m.scrimmage_team_id)?.members.push(m);
    return [...byTeam.values()];
  } catch { return []; }
}

// Create N empty teams (A..N) for a category, replacing any existing set.
export async function createTeams(catId, count) {
  const n = Math.max(2, Math.min(6, parseInt(count) || 3));
  await sql`DELETE FROM scrimmage_teams WHERE age_category_id = ${catId}`;
  for (let i = 0; i < n; i++) {
    await sql`INSERT INTO scrimmage_teams (age_category_id, name, display_order) VALUES (${catId}, ${"Team " + TEAM_LETTERS[i]}, ${i})`;
  }
  return getScrimmageTeams(catId);
}

// Seed players into the teams. mode: 'alphabetical' | 'even'. Balances D roughly
// evenly first (so no team is short on defense), then distributes the rest.
export async function seedTeams(catId, mode = "alphabetical") {
  const teams = await sql`SELECT id FROM scrimmage_teams WHERE age_category_id = ${catId} ORDER BY display_order, id`;
  if (!teams.length) return getScrimmageTeams(catId);
  const athletes = await sql`
    SELECT id, first_name, last_name, jersey_number, position FROM athletes
    WHERE age_category_id = ${catId} AND is_active = true AND COALESCE(position,'') <> 'goalie'
    ORDER BY last_name, first_name`;

  // Clear current membership.
  await sql`DELETE FROM scrimmage_team_members WHERE scrimmage_team_id = ANY(${teams.map(t => t.id)})`;

  const isD = (a) => (a.position || "").toLowerCase().startsWith("d");
  const order = mode === "even"
    ? [...athletes].sort((a, b) => (Number(a.jersey_number) || 999) - (Number(b.jersey_number) || 999))
    : athletes; // already alphabetical
  // Defense first, then forwards — snake across teams so counts stay even.
  const ranked = [...order.filter(isD), ...order.filter(a => !isD(a))];
  const T = teams.length;
  for (let i = 0; i < ranked.length; i++) {
    const round = Math.floor(i / T);
    const pos = i % T;
    const teamIdx = round % 2 === 0 ? pos : T - 1 - pos; // snake
    await sql`INSERT INTO scrimmage_team_members (scrimmage_team_id, athlete_id) VALUES (${teams[teamIdx].id}, ${ranked[i].id}) ON CONFLICT DO NOTHING`;
  }
  return getScrimmageTeams(catId);
}

// Move one athlete to a team (removing from any other team in this category).
export async function moveAthlete(catId, athleteId, toTeamId) {
  const teams = await sql`SELECT id FROM scrimmage_teams WHERE age_category_id = ${catId}`;
  const ids = teams.map(t => t.id);
  if (!ids.includes(parseInt(toTeamId))) return;
  await sql`DELETE FROM scrimmage_team_members WHERE athlete_id = ${athleteId} AND scrimmage_team_id = ANY(${ids})`;
  await sql`INSERT INTO scrimmage_team_members (scrimmage_team_id, athlete_id) VALUES (${toTeamId}, ${athleteId}) ON CONFLICT DO NOTHING`;
}

// Resolve a team letter (A/B/…) to its id for a category — for matchup import.
export async function teamIdByLetter(catId, letter) {
  const name = "Team " + String(letter || "").trim().toUpperCase();
  const rows = await sql`SELECT id FROM scrimmage_teams WHERE age_category_id = ${catId} AND name = ${name} LIMIT 1`;
  return rows[0]?.id || null;
}

// Parse a matchup label ("A vs B", "A/B", "Bubble A/B", "Team A vs Team C") into
// the two scrimmage-team ids for this category. Returns [] if it can't resolve
// both (so the caller just leaves the game's roster to be set manually).
export async function resolveMatchupTeams(catId, matchup) {
  const letters = String(matchup || "").toUpperCase().match(/\b([A-F])\b/g);
  if (!letters || letters.length < 2) return [];
  const a = await teamIdByLetter(catId, letters[0]);
  const b = await teamIdByLetter(catId, letters[1]);
  return a && b ? [a, b] : [];
}

// Populate a game's session group with both teams' players so the existing
// scoring/check-in screens scope the roster to exactly those two teams. Reuses
// session_groups/player_group_assignments — no schema change, and directors can
// still tweak the roster in the Groups UI afterwards.
export async function assignMatchupRoster(catId, session_number, group_number, teamIds) {
  if (!Array.isArray(teamIds) || teamIds.length < 2) return;
  let [grp] = await sql`SELECT id FROM session_groups WHERE age_category_id = ${catId} AND session_number = ${session_number} AND group_number = ${group_number} LIMIT 1`;
  if (!grp) {
    [grp] = await sql`INSERT INTO session_groups (age_category_id, session_number, group_number, name, display_order) VALUES (${catId}, ${session_number}, ${group_number}, ${"Group " + group_number}, ${group_number}) RETURNING id`;
  }
  await sql`DELETE FROM player_group_assignments WHERE session_group_id = ${grp.id}`;
  const members = await sql`SELECT athlete_id FROM scrimmage_team_members WHERE scrimmage_team_id = ANY(${teamIds})`;
  for (let i = 0; i < members.length; i++) {
    await sql`INSERT INTO player_group_assignments (athlete_id, session_group_id, display_order) VALUES (${members[i].athlete_id}, ${grp.id}, ${i}) ON CONFLICT DO NOTHING`;
  }
}

// A game is "frozen" once it's been played — its date has passed, or players
// have checked in. Frozen games are never re-resolved, so moving a player
// between teams can't disturb a game that already happened. (Scores are anchored
// to athlete_id + session regardless, so history is safe either way.)
export function isGameFrozen({ past, hasCheckins }) {
  return !!(past || hasCheckins);
}

// Resolve every stored matchup label into that game's roster — but ONLY for
// un-played games. Backs the Teams tab's "Apply to schedule". Returns
// { applied, skipped }. Resilient pre-migration.
export async function applyAllMatchups(catId) {
  let rows;
  try {
    rows = await sql`
      SELECT id, session_number, group_number, matchup, (scheduled_date < CURRENT_DATE) AS past
      FROM evaluation_schedule
      WHERE age_category_id = ${catId} AND matchup IS NOT NULL AND status <> 'cancelled'`;
  } catch { return { applied: 0, skipped: 0 }; }
  let applied = 0, skipped = 0;
  for (const r of rows) {
    let hasCheckins = false;
    try { const c = await sql`SELECT 1 FROM player_checkins WHERE schedule_id = ${r.id} LIMIT 1`; hasCheckins = c.length > 0; } catch { /* table optional */ }
    if (isGameFrozen({ past: r.past, hasCheckins })) { skipped++; continue; }
    const teams = await resolveMatchupTeams(catId, r.matchup);
    if (teams.length) { await assignMatchupRoster(catId, r.session_number, r.group_number, teams); applied++; }
    else skipped++;
  }
  return { applied, skipped };
}
