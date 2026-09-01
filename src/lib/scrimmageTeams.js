import sql from "@/lib/db";
import { DEFAULT_TEAM_COLORS, colorNames } from "@/lib/teamColors";

// Persistent scrimmage teams (A/B/C…) for a round-robin category. Used ONLY when
// age_categories.eval_format = 'round_robin'; standard categories never touch this.
// Before session 1 there are no scores to seed from, so seeds are score-free:
// alphabetical, or an even snake by jersey. AFTER scores exist -- rebuilding into
// two teams post-cuts, say -- 'ranked' snake-drafts by current standing, which is
// the only mode that actually produces balanced sides. A director then drags to
// adjust. All reads are resilient (return [] pre-migration).

export const TEAM_LETTERS = ["A", "B", "C", "D", "E", "F"];

export async function getScrimmageTeams(catId) {
  try {
    const teams = await sql`SELECT id, name, display_order FROM scrimmage_teams WHERE age_category_id = ${catId} ORDER BY display_order, id`;
    if (!teams.length) return [];
    const members = await sql`
      SELECT stm.scrimmage_team_id, a.id AS athlete_id, a.first_name, a.last_name, a.jersey_number, a.helmet_number, a.position
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

// Change how many teams a category has, keeping the ones it already has.
//
// Dropping from 3 teams to 2 after a round of cuts is a normal, expected move,
// but there was no way to do it: createTeams() wipes and rebuilds (losing every
// custom team NAME), addTeam() only ever goes up, and removeTeam() had to be
// clicked once per team. So a director either deleted teams one at a time or
// blew the whole set away.
//
// Grows by appending (addTeam's naming), shrinks by dropping the HIGHEST
// display_order teams -- so "Team A"/"Team B", or whatever the director renamed
// them to, survive and the ones that disappear are the ones added last. Members
// of a dropped team are released; a reseed straight after redistributes
// everyone, which is why seed() calls this first.
//
// Floor of 2 (a scrimmage needs two sides) and ceiling of 6, same as elsewhere.
export async function setTeamCount(catId, count) {
  const want = Math.max(2, Math.min(6, parseInt(count) || 2));
  let existing = await sql`SELECT id, display_order FROM scrimmage_teams WHERE age_category_id = ${catId} ORDER BY display_order, id`;

  if (!existing.length) return createTeams(catId, want);

  while (existing.length < want) {
    await addTeam(catId);
    existing = await sql`SELECT id, display_order FROM scrimmage_teams WHERE age_category_id = ${catId} ORDER BY display_order, id`;
  }
  while (existing.length > want) {
    const drop = existing[existing.length - 1];
    await removeTeam(catId, drop.id);
    existing = await sql`SELECT id, display_order FROM scrimmage_teams WHERE age_category_id = ${catId} ORDER BY display_order, id`;
  }
  return getScrimmageTeams(catId);
}

// Current standing for every athlete in a category: { athleteId: rank }, rank 1
// = best. Lifted from the same computeCategoryRankings the Rankings tab uses, so
// a team built from this cannot disagree with what the director is looking at.
// Best-effort -- a failure here just means an unranked seed, never a crash.
export async function rankMap(catId) {
  try {
    const { computeCategoryRankings } = await import("@/lib/rankings");
    const r = await computeCategoryRankings(catId, {});
    const m = new Map();
    for (const a of [...(r.athletes || []), ...(r.goalies || [])]) {
      if (a?.id != null && a.rank != null) m.set(a.id, a.rank);
    }
    return m;
  } catch (e) {
    console.error("rankMap:", e?.message);
    return new Map();
  }
}

// Snake one group across T teams, optionally starting on a team other than the
// first. Each round hands out exactly one player per team, so counts stay even
// no matter where the snake starts.
function snake(list, T, startOffset = 0) {
  return list.map((athlete, i) => {
    const round = Math.floor(i / T);
    const pos = i % T;
    const base = round % 2 === 0 ? pos : T - 1 - pos;
    return { athlete, teamIdx: (base + startOffset) % T };
  });
}

// Decide who goes where. Defense is drafted first so no team ends up short a
// blueliner, then forwards.
//
// Rule: the top-ranked defender and the top-ranked forward never land on the
// same team. The old single continuous snake ran D and F as one sequence, so
// with an ODD number of defenders it turned back on itself at the boundary and
// handed the same team both -- EFHA's U13 came out with the #1 D and the #1
// forward together, which is the opposite of a balanced draft. Starting the
// forward pass one team along fixes it structurally rather than by swapping
// players afterwards, and because each snake still gives one player per team
// per round, roster sizes stay as even as before.
//
// Exported for testing: this is the part that has to stay correct.
export function draftAssignments(dRanked, fRanked, T) {
  if (T < 1) return [];
  const dPicks = snake(dRanked, T, 0);
  // Only shift when there is actually a top D to avoid -- with no defenders the
  // forwards should start at team 0 like any other single group.
  const forwardOffset = dRanked.length && T > 1 ? 1 : 0;
  const fPicks = snake(fRanked, T, forwardOffset);
  return [...dPicks, ...fPicks];
}

// Seed players into the teams.
//
// mode:
//   'ranked'       — snake draft by current ranking (best available alternates),
//                    which is what actually produces two even teams after cuts.
//                    Alphabetical order says nothing about ability, so the old
//                    default could stack one side.
//   'alphabetical' — by name
//   'even'         — by jersey number
//
// In every mode defense is distributed first so no team ends up short a
// blueliner, then the rest follow.
export async function seedTeams(catId, mode = "alphabetical") {
  const teams = await sql`SELECT id FROM scrimmage_teams WHERE age_category_id = ${catId} ORDER BY display_order, id`;
  if (!teams.length) return getScrimmageTeams(catId);
  const athletes = await sql`
    SELECT id, first_name, last_name, jersey_number, position FROM athletes
    WHERE age_category_id = ${catId} AND is_active = true AND cut_at IS NULL AND COALESCE(position,'') <> 'goalie'
    ORDER BY last_name, first_name`;

  // Clear current membership.
  await sql`DELETE FROM scrimmage_team_members WHERE scrimmage_team_id = ANY(${teams.map(t => t.id)})`;

  // Forward/Defense players count as D-capable here too, so a team seeded
  // "D-first" doesn't end up short a blueliner because a hybrid got sorted
  // into the forward pass instead.
  const isD = (a) => { const p = (a.position || "").toLowerCase(); return p.startsWith("d") || p === "forward_defense"; };
  let order;
  if (mode === "ranked") {
    // Best first. An unranked player (no scores yet) sorts to the back rather
    // than to the front, which is what a missing rank actually means here.
    const ranks = await rankMap(catId);
    order = [...athletes].sort((a, b) => (ranks.get(a.id) ?? 9999) - (ranks.get(b.id) ?? 9999));
  } else if (mode === "even") {
    order = [...athletes].sort((a, b) => (Number(a.jersey_number) || 999) - (Number(b.jersey_number) || 999));
  } else {
    order = athletes; // already alphabetical
  }
  const assignments = draftAssignments(order.filter(isD), order.filter(a => !isD(a)), teams.length);
  for (const { athlete, teamIdx } of assignments) {
    await sql`INSERT INTO scrimmage_team_members (scrimmage_team_id, athlete_id) VALUES (${teams[teamIdx].id}, ${athlete.id}) ON CONFLICT DO NOTHING`;
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

  const split = (str) => {
    const m = str.match(/^(.+?)\s*(?:vs\.?|\/)\s*(.+)$/i);
    return m ? [m[1], m[2]] : null;
  };
  const resolve = async (parts) => {
    if (!parts) return [];
    const a = await findTeamByLabel(catId, parts[0]);
    const b = await findTeamByLabel(catId, parts[1]);
    return a && b ? [a, b] : [];
  };

  // Try the label exactly as written first, so nothing that already resolved
  // changes behaviour.
  const direct = await resolve(split(s));
  if (direct.length) return direct;

  // Then retry without a leading descriptive prefix. Schedules routinely carry
  // one -- "Post-cut: White vs Blue", "Final: A vs B" -- and the lazy split
  // above hands "Post-cut: White" to an exact name match, which finds nothing.
  // The whole game then silently keeps no roster, with no error anywhere.
  // Only attempted after the direct match fails, so a team genuinely named with
  // a colon still wins.
  const colon = s.indexOf(":");
  if (colon > -1 && colon < s.length - 1) {
    return resolve(split(s.slice(colon + 1).trim()));
  }
  return [];
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
// the two teams they're on (teamIds[0] -> first palette colour, teamIds[1] ->
// second) via
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
        VALUES (${scheduleId}, ${catId}, ${JSON.stringify(DEFAULT_TEAM_COLORS)}, false)
        ON CONFLICT (schedule_id) DO UPDATE SET schedule_id = EXCLUDED.schedule_id
        RETURNING id, team_colors`;
      // Map team slot -> jersey colour slot using THIS session's palette, so a
      // Red/Blue session seeds Red/Blue rather than a hardcoded White/Dark that
      // the check-in and scoring screens would then render as unknown.
      const palette = colorNames(cs.team_colors);
      const colorOf = {};
      teamIds.forEach((id, i) => { if (palette[i]) colorOf[id] = palette[i]; });
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
