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
