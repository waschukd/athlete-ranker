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

// Append one new empty team, keeping every existing team and its roster intact
// (unlike createTeams, which wipes and rebuilds the whole set). Named after the
// next unused letter; if a director has renamed everything, falls back to the
// next display_order slot. Capped at 6 total, same as createTeams.
export async function addTeam(catId) {
  const existing = await sql`SELECT id, name, display_order FROM scrimmage_teams WHERE age_category_id = ${catId} ORDER BY display_order, id`;
  if (existing.length >= 6) throw new Error("Maximum of 6 teams");
  const usedLetters = new Set(existing.map(t => t.name).filter(n => /^Team [A-F]$/.test(n)).map(n => n.slice(-1)));
  const letter = TEAM_LETTERS.find(l => !usedLetters.has(l)) || TEAM_LETTERS[existing.length];
  const nextOrder = existing.length ? Math.max(...existing.map(t => t.display_order ?? 0)) + 1 : 0;
  await sql`INSERT INTO scrimmage_teams (age_category_id, name, display_order) VALUES (${catId}, ${"Team " + letter}, ${nextOrder})`;
  return getScrimmageTeams(catId);
}

// Seed players into the teams. mode: 'alphabetical' | 'even'. Balances D roughly
// evenly first (so no team is short on defense), then distributes the rest.
export async function seedTeams(catId, mode = "alphabetical") {
  const teams = await sql`SELECT id FROM scrimmage_teams WHERE age_category_id = ${catId} ORDER BY display_order, id`;
  if (!teams.length) return getScrimmageTeams(catId);
  const athletes = await sql`
    SELECT id, first_name, last_name, jersey_number, position FROM athletes
    WHERE age_category_id = ${catId} AND is_active = true AND cut_at IS NULL AND COALESCE(position,'') <> 'goalie'
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

// Dissolve one team (e.g. after cuts consolidate 3 teams down to 2). Its
// members just drop back into the pool — no reassignment here, a director
// drags them onto the remaining teams. Cut/released players never reappear:
// the pool query already filters cut_at IS NULL, and that's untouched by this
// (a cut player's membership row is gone regardless of which team dissolves).
// Already-played games are unaffected — their rosters are athlete snapshots,
// never linked back to scrimmage_teams.
export async function removeTeam(catId, teamId) {
  await sql`DELETE FROM scrimmage_team_members WHERE scrimmage_team_id = ${teamId}`;
  await sql`DELETE FROM scrimmage_teams WHERE id = ${teamId} AND age_category_id = ${catId}`;
}

// Rename a team — directors aren't stuck with "Team A/B/C"; real names ("White",
// "Gold Rush") set the tone for the whole evaluation. Matchup resolution below
// matches by whatever the name currently is, so this is safe at any time; any
// already-stored matchup text just needs "Apply to schedule" re-run afterward
// to pick up the new name.
export async function renameTeam(catId, teamId, name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return;
  await sql`UPDATE scrimmage_teams SET name = ${trimmed} WHERE id = ${teamId} AND age_category_id = ${catId}`;
}

// Resolve a team letter (A/B/…) to its id for a category — legacy fallback for
// older CSV imports still using the bare-letter convention.
export async function teamIdByLetter(catId, letter) {
  const name = "Team " + String(letter || "").trim().toUpperCase();
  const rows = await sql`SELECT id FROM scrimmage_teams WHERE age_category_id = ${catId} AND name = ${name} LIMIT 1`;
  return rows[0]?.id || null;
}

// Find a team by its CURRENT name (case-insensitive, exact) — the primary
// resolution path now that teams can be renamed to anything ("White", "Gold
// Rush"), not just letters. Falls back to the legacy "single letter -> Team X"
// convention so older imports/templates still work.
async function findTeamByLabel(catId, label) {
  const trimmed = String(label || "").trim();
  if (!trimmed) return null;
  const rows = await sql`SELECT id FROM scrimmage_teams WHERE age_category_id = ${catId} AND lower(name) = lower(${trimmed}) LIMIT 1`;
  if (rows[0]) return rows[0].id;
  if (/^[A-F]$/i.test(trimmed)) return teamIdByLetter(catId, trimmed);
  return null;
}

// Parse a matchup label ("White vs Gold", "A vs B", "Bubble A/B") into the two
// scrimmage-team ids for this category, matching against each team's CURRENT
// name. Returns [] if it can't resolve both (so the caller just leaves the
// game's roster to be set manually).
export async function resolveMatchupTeams(catId, matchup) {
  const s = String(matchup || "").trim();
  if (!s) return [];
  const m = s.match(/^(.+?)\s*(?:vs\.?|\/)\s*(.+)$/i);
  if (!m) return [];
  const a = await findTeamByLabel(catId, m[1]);
  const b = await findTeamByLabel(catId, m[2]);
  return a && b ? [a, b] : [];
}

// Build a canonical matchup label from two team ids, using their current names
// — what the schedule's team picker writes, so the stored text always matches
// reality (never a stale letter that no longer means anything after a rename).
export async function matchupLabel(catId, teamAId, teamBId) {
  const rows = await sql`SELECT id, name FROM scrimmage_teams WHERE age_category_id = ${catId} AND id = ANY(${[teamAId, teamBId]})`;
  const a = rows.find(r => r.id === teamAId)?.name;
  const b = rows.find(r => r.id === teamBId)?.name;
  return a && b ? `${a} vs ${b}` : null;
}

// Populate a game's session group with both teams' players so the existing
// scoring/check-in screens scope the roster to exactly those two teams. Reuses
// session_groups/player_group_assignments — no schema change, and directors can
// still tweak the roster in the Groups UI afterwards.
//
// When scheduleId is given, also pre-colors every player's jersey by which of
// the two teams they're on (teamIds[0] -> White, teamIds[1] -> Dark) via
// player_checkins.team_color. Without this, a freshly-built roster rendered as
// one undifferentiated list — every jersey circle the same neutral grey until
// someone manually clicked each one — which reads as "one big team" rather
// than two, even though the two teams were assigned correctly underneath.
export async function assignMatchupRoster(catId, session_number, group_number, teamIds, scheduleId) {
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

  if (scheduleId) {
    try {
      const [cs] = await sql`
        INSERT INTO checkin_sessions (schedule_id, age_category_id, team_colors, is_open)
        VALUES (${scheduleId}, ${catId}, ${JSON.stringify(["White", "Dark"])}, false)
        ON CONFLICT (schedule_id) DO UPDATE SET schedule_id = EXCLUDED.schedule_id
        RETURNING id`;
      const colorOf = { [teamIds[0]]: "White", [teamIds[1]]: "Dark" };
      const withTeam = await sql`SELECT athlete_id, scrimmage_team_id FROM scrimmage_team_members WHERE scrimmage_team_id = ANY(${teamIds})`;
      for (const m of withTeam) {
        const color = colorOf[m.scrimmage_team_id];
        if (!color) continue;
        await sql`
          INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, team_color)
          VALUES (${m.athlete_id}, ${scheduleId}, ${cs.id}, ${color})
          ON CONFLICT (athlete_id, schedule_id) DO UPDATE SET team_color = ${color}
          WHERE player_checkins.checked_in IS NOT TRUE`;
      }
    } catch (e) { console.error("assignMatchupRoster: team_color seed failed:", e?.message); }
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
    // Row EXISTENCE is not the right signal anymore -- assignMatchupRoster
    // pre-creates player_checkins rows just to seed jersey colors, before
    // anyone has actually checked in. Only a row with checked_in = true
    // means someone genuinely showed up, which is the only thing that should
    // freeze a game against further re-resolution.
    let hasCheckins = false;
    try { const c = await sql`SELECT 1 FROM player_checkins WHERE schedule_id = ${r.id} AND checked_in = true LIMIT 1`; hasCheckins = c.length > 0; } catch { /* table optional */ }
    if (isGameFrozen({ past: r.past, hasCheckins })) { skipped++; continue; }
    const teams = await resolveMatchupTeams(catId, r.matchup);
    if (teams.length) { await assignMatchupRoster(catId, r.session_number, r.group_number, teams, r.id); applied++; }
    else skipped++;
  }
  return { applied, skipped };
}
