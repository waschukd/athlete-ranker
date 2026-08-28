import sql from "@/lib/db";
import { colorNames } from "@/lib/teamColors";

// A scheduled slot carries its group number on evaluation_schedule, but "Manage
// groups" (and auto-assign) read the session_groups table. Both writers must
// create the row or the dashboard reports "No groups found. Upload a schedule
// first." while the Schedule tab happily shows the groups — which is exactly the
// bug that shipped when bulk-onboard grew its own schedule INSERT and didn't
// call this.
//
// Idempotent: safe to call per scheduled row.
export async function ensureSessionGroup(catId, sessionNumber, groupNumber) {
  if (!groupNumber) return;
  const existing = await sql`
    SELECT id FROM session_groups
    WHERE age_category_id = ${catId} AND session_number = ${sessionNumber} AND group_number = ${groupNumber}
  `;
  if (existing.length) return;
  await sql`
    INSERT INTO session_groups (age_category_id, session_number, group_number, name, display_order)
    VALUES (${catId}, ${sessionNumber}, ${groupNumber}, ${"Group " + groupNumber}, ${groupNumber})
  `;
}

// Recolors every player currently in the given groups by snake-draft position
// within each group (alternating through that session's palette). Shared by
// the Groups tab's manual assign_goalie/assign_player actions and auto-place
// below -- both need the group's jerseys to stay balanced right after a player
// lands in it, not just whenever someone next clicks "Apply colors".
export async function applySnakeDraftColors(catId, sessionNumber, groups) {
  const validGroups = groups.filter(g => g);
  if (!validGroups.length) return;

  const groupNumbers = validGroups.map(g => g.group_number);
  const effectiveSession = sessionNumber || validGroups[0].session_number;

  // Fix any null group_numbers in evaluation_schedule (legacy data from single-group categories)
  await sql`
    UPDATE evaluation_schedule SET group_number = 1
    WHERE age_category_id = ${catId} AND session_number = ${effectiveSession} AND group_number IS NULL`;

  // Batch: fetch all schedule entries for these groups at once
  const scheduleEntries = await sql`
    SELECT id, group_number FROM evaluation_schedule
    WHERE age_category_id = ${catId}
      AND session_number = ${effectiveSession}
      AND group_number = ANY(${groupNumbers})`;
  const scheduleByGroup = {};
  for (const se of scheduleEntries) scheduleByGroup[se.group_number] = se.id;

  const scheduleIds = scheduleEntries.map(se => se.id);
  if (!scheduleIds.length) return;

  // Batch: ensure checkin_sessions exist for all schedule IDs (insert missing ones)
  await sql`
    INSERT INTO checkin_sessions (schedule_id, age_category_id, team_colors, is_open)
    SELECT s.id, ${catId}, '["Red","Blue"]', false
    FROM unnest(${scheduleIds}::int[]) AS s(id)
    WHERE NOT EXISTS (SELECT 1 FROM checkin_sessions cs WHERE cs.schedule_id = s.id)`;

  // Batch: fetch all checkin_sessions for these schedule IDs
  const allCs = await sql`
    SELECT id, schedule_id, team_colors FROM checkin_sessions
    WHERE schedule_id = ANY(${scheduleIds})`;
  const csBySchedule = {};
  const csColors = {};
  for (const cs of allCs) { csBySchedule[cs.schedule_id] = cs.id; csColors[cs.id] = cs.team_colors; }

  // Batch: fetch all player assignments for these groups at once
  const groupIds = validGroups.map(g => g.id);
  const allPlayers = await sql`
    SELECT pga.athlete_id, pga.session_group_id
    FROM player_group_assignments pga
    WHERE pga.session_group_id = ANY(${groupIds})
    ORDER BY pga.session_group_id, pga.display_order, pga.athlete_id`;

  // Group players by session_group_id
  const playersByGroup = {};
  for (const p of allPlayers) {
    if (!playersByGroup[p.session_group_id]) playersByGroup[p.session_group_id] = [];
    playersByGroup[p.session_group_id].push(p.athlete_id);
  }

  // Build bulk upsert data for player_checkins
  const upsertAthletes = [];
  const upsertSchedules = [];
  const upsertCsIds = [];
  const upsertColors = [];

  for (const group of validGroups) {
    const scheduleId = scheduleByGroup[group.group_number] || scheduleByGroup[1];
    if (!scheduleId) continue;
    const csId = csBySchedule[scheduleId];
    if (!csId) continue;
    const players = playersByGroup[group.id] || [];
    const palette = colorNames(csColors[csId]);
    for (let i = 0; i < players.length; i++) {
      upsertAthletes.push(players[i]);
      upsertSchedules.push(scheduleId);
      upsertCsIds.push(csId);
      upsertColors.push(palette[i % palette.length]);
    }
  }

  if (upsertAthletes.length) {
    for (let i = 0; i < upsertAthletes.length; i++) {
      await sql`
        INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, team_color, checked_in)
        VALUES (${upsertAthletes[i]}, ${upsertSchedules[i]}, ${upsertCsIds[i]}, ${upsertColors[i]}, false)
        ON CONFLICT (athlete_id, schedule_id) DO UPDATE SET team_color = EXCLUDED.team_color`;
    }
  }
}

// Whether a group's own game has already happened -- past scheduled date, or
// any real check-in recorded. Auto-place must never touch these: recoloring
// (via applySnakeDraftColors above) would silently reassign jerseys for kids
// who may have already checked in.
export async function isGroupFrozen(catId, sessionNumber, groupNumber) {
  const [row] = await sql`
    SELECT es.id, (es.scheduled_date < CURRENT_DATE) AS past
    FROM evaluation_schedule es
    WHERE es.age_category_id = ${catId} AND es.session_number = ${sessionNumber} AND es.group_number = ${groupNumber}`;
  if (!row) return false; // no schedule row yet -- nothing to freeze
  if (row.past) return true;
  const [{ has_checkins }] = await sql`
    SELECT EXISTS(SELECT 1 FROM player_checkins WHERE schedule_id = ${row.id} AND checked_in = true) AS has_checkins`;
  return has_checkins;
}

// Drops a newly added skater into the smallest OPEN group of every session
// that already has groups built for this category, so quick-add / CSV import
// don't require a manual trip to the Groups "Not Yet Placed" panel for the
// common case. Goalies are excluded -- they're never auto-distributed
// anywhere in this app, always assigned by hand. Skips a session entirely if
// it's locked (director has confirmed & sent it to parents) or if every one
// of its groups is already frozen (played) -- nothing left to place into.
export async function autoPlaceInExistingGroups(catId, athleteId, position) {
  if ((position || "").toLowerCase() === "goalie") return { placed: [] };

  const sessions = await sql`
    SELECT DISTINCT session_number FROM session_groups WHERE age_category_id = ${catId} ORDER BY session_number`;
  const placed = [];

  for (const { session_number } of sessions) {
    const [locked] = await sql`SELECT groups_locked_at FROM category_sessions WHERE age_category_id = ${catId} AND session_number = ${session_number}`;
    if (locked?.groups_locked_at) continue;

    // Already placed in this session by some other path (explicit CSV
    // "Session N Group #" column, a prior manual assignment) -- skip, so this
    // is safe to call unconditionally without double-placing across two
    // groups of the same session (the unique constraint is per-group, not
    // per-session, so a second INSERT here would otherwise succeed).
    const already = await sql`
      SELECT 1 FROM player_group_assignments pga
      JOIN session_groups sg ON sg.id = pga.session_group_id
      WHERE sg.age_category_id = ${catId} AND sg.session_number = ${session_number} AND pga.athlete_id = ${athleteId} LIMIT 1`;
    if (already.length) continue;

    const groups = await sql`
      SELECT sg.id, sg.group_number, COUNT(pga.athlete_id)::int AS player_count
      FROM session_groups sg LEFT JOIN player_group_assignments pga ON pga.session_group_id = sg.id
      WHERE sg.age_category_id = ${catId} AND sg.session_number = ${session_number}
      GROUP BY sg.id ORDER BY sg.group_number`;
    if (!groups.length) continue;

    const openGroups = [];
    for (const g of groups) {
      if (!(await isGroupFrozen(catId, session_number, g.group_number))) openGroups.push(g);
    }
    if (!openGroups.length) continue; // every group this session already played

    const target = openGroups.reduce((min, g) => (g.player_count < min.player_count ? g : min), openGroups[0]);
    await sql`INSERT INTO player_group_assignments (athlete_id, session_group_id, display_order) VALUES (${athleteId}, ${target.id}, 99) ON CONFLICT DO NOTHING`;
    await applySnakeDraftColors(catId, session_number, [target]);
    placed.push({ session_number, group_number: target.group_number });
  }

  return { placed };
}
