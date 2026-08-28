import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { parseTeamColors, colorNames } from "@/lib/teamColors";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { partitionByContact, splitIsActive } from "@/lib/contactGroups";
import { computeCategoryRankings } from "@/lib/rankings";
import { applySnakeDraftColors } from "@/lib/sessionGroups";

// Group-building (auto-assign, moves, lock/unlock, colors, jersey pre-assign)
// is the association's "Groups" tab -- middleware's DIRECTOR_ASSOC_ALLOW only
// admits directors there (alongside admins), never a plain evaluator.
const MANAGE_ROLES = new Set(["super_admin", "association_admin", "director", "service_provider_admin", "goalie_service_provider_admin"]);

async function getAppUserId(session) {
  if (!session?.email) return null;
  const user = await sql`SELECT id FROM users WHERE email = ${session.email}`;
  return user[0]?.id || null;
}

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const sessionNum = searchParams.get("session");

    const groups = sessionNum
      ? await sql`
          SELECT sg.*, COUNT(DISTINCT pga.athlete_id) as player_count
          FROM session_groups sg
          LEFT JOIN player_group_assignments pga ON pga.session_group_id = sg.id
          WHERE sg.age_category_id = ${catId} AND sg.session_number = ${sessionNum}
          GROUP BY sg.id ORDER BY sg.group_number`
      : await sql`
          SELECT sg.*, COUNT(DISTINCT pga.athlete_id) as player_count
          FROM session_groups sg
          LEFT JOIN player_group_assignments pga ON pga.session_group_id = sg.id
          WHERE sg.age_category_id = ${catId}
          GROUP BY sg.id ORDER BY sg.session_number, sg.group_number`;

    const assignments = sessionNum
      ? await sql`
          SELECT pga.id as assignment_id, pga.athlete_id, pga.session_group_id, pga.display_order, pga.auto_group_number,
            a.first_name, a.last_name, a.external_id, a.position,
            sg.session_number, sg.group_number,
            pc.jersey_number, pc.team_color, pc.checked_in,
            es.checkin_code, es.id as schedule_id,
            es.scheduled_date, es.start_time, es.end_time, es.location
          FROM player_group_assignments pga
          JOIN athletes a ON a.id = pga.athlete_id
          JOIN session_groups sg ON sg.id = pga.session_group_id
          LEFT JOIN evaluation_schedule es ON es.age_category_id = ${catId}
            AND es.session_number = sg.session_number AND es.group_number = sg.group_number
          LEFT JOIN player_checkins pc ON pc.athlete_id = a.id AND pc.schedule_id = es.id
          WHERE sg.age_category_id = ${catId} AND sg.session_number = ${sessionNum}
          ORDER BY sg.group_number, pga.display_order, a.last_name`
      : await sql`
          SELECT pga.id as assignment_id, pga.athlete_id, pga.session_group_id, pga.display_order, pga.auto_group_number,
            a.first_name, a.last_name, a.external_id, a.position,
            sg.session_number, sg.group_number,
            pc.jersey_number, pc.team_color, pc.checked_in,
            es.checkin_code, es.id as schedule_id
          FROM player_group_assignments pga
          JOIN athletes a ON a.id = pga.athlete_id
          JOIN session_groups sg ON sg.id = pga.session_group_id
          LEFT JOIN evaluation_schedule es ON es.age_category_id = ${catId}
            AND es.session_number = sg.session_number AND es.group_number = sg.group_number
          LEFT JOIN player_checkins pc ON pc.athlete_id = a.id AND pc.schedule_id = es.id
          WHERE sg.age_category_id = ${catId}
          ORDER BY sg.session_number, sg.group_number, pga.display_order, a.last_name`;

    // Get unassigned goalies for this session
    const goalies = sessionNum ? await sql`
      SELECT a.id, a.first_name, a.last_name, a.external_id
      FROM athletes a
      WHERE a.age_category_id = ${catId} AND a.position = 'goalie' AND a.is_active = true
        AND a.id NOT IN (
          SELECT pga.athlete_id FROM player_group_assignments pga
          JOIN session_groups sg ON sg.id = pga.session_group_id
          WHERE sg.age_category_id = ${catId} AND sg.session_number = ${sessionNum}
        )
      ORDER BY a.last_name` : [];

    // Skaters (everyone else, incl. no position set) with no row in this session's
    // groups at all -- e.g. added via the Athletes tab AFTER groups were already
    // built, which never touches player_group_assignments. Without this they're
    // simply invisible on this page: `assignments` above is built by INNER JOIN
    // from player_group_assignments, so a never-assigned player appears nowhere,
    // not even in an "unassigned" bucket, unlike goalies above.
    const unassigned_skaters = sessionNum ? await sql`
      SELECT a.id, a.first_name, a.last_name, a.external_id, a.position
      FROM athletes a
      WHERE a.age_category_id = ${catId} AND a.is_active = true AND COALESCE(a.position, '') <> 'goalie'
        AND a.id NOT IN (
          SELECT pga.athlete_id FROM player_group_assignments pga
          JOIN session_groups sg ON sg.id = pga.session_group_id
          WHERE sg.age_category_id = ${catId} AND sg.session_number = ${sessionNum}
        )
      ORDER BY a.last_name` : [];

    let locked_at = null;
    if (sessionNum) {
      try {
        const [row] = await sql`SELECT groups_locked_at FROM category_sessions WHERE age_category_id = ${catId} AND session_number = ${sessionNum}`;
        locked_at = row?.groups_locked_at || null;
      } catch { /* column not migrated */ }
    }

    // Jersey palette per schedule, so the groups UI paints each circle in the
    // colour that session actually uses instead of assuming White/Dark.
    const scheduleIds = [...new Set(assignments.map(a => a.schedule_id).filter(Boolean))];
    let team_colors_by_schedule = {};
    if (scheduleIds.length) {
      const rows = await sql`SELECT schedule_id, team_colors FROM checkin_sessions WHERE schedule_id = ANY(${scheduleIds})`;
      for (const r of rows) team_colors_by_schedule[r.schedule_id] = parseTeamColors(r.team_colors);
    }

    return NextResponse.json({ groups, assignments, goalies, unassigned_skaters, locked_at, team_colors_by_schedule });
  } catch (error) {
    console.error("Groups GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { catId } = params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!MANAGE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const userId = await getAppUserId(session);
    const body = await request.json();
    const { action } = body;

    if (action === "auto_assign") {
      const { session_number, method, position_balanced } = body;

      const groups = await sql`
        SELECT sg.*, COALESCE(es.goalie_evaluators_required, 0) AS goalie_eval_req
        FROM session_groups sg
        LEFT JOIN evaluation_schedule es ON es.age_category_id = ${catId}
          AND es.session_number = sg.session_number AND es.group_number = sg.group_number
        WHERE sg.age_category_id = ${catId} AND sg.session_number = ${session_number}
        ORDER BY sg.group_number`;

      if (!groups.length) return NextResponse.json({ error: "No groups found. Upload a schedule first." }, { status: 400 });

      // Session 1 keeps goalies in their own goalie-skills group, separate from the
      // skater testing groups; scrimmage/skills sessions mix goalies INTO the groups.
      const sessTypeRow = await sql`SELECT session_type FROM category_sessions WHERE age_category_id = ${catId} AND session_number = ${session_number} LIMIT 1`;
      const sType = sessTypeRow[0]?.session_type;
      const mixGoalies = sType !== "testing" && sType !== "goalie_skills";
      // Skaters fill all groups in a scrimmage; in a testing session they fill only
      // the non-goalie (testing) groups, never the goalie-skills group.
      const skaterGroups = mixGoalies ? groups : groups.filter(g => Number(g.goalie_eval_req) === 0);
      const numGroups = skaterGroups.length || groups.length;

      // Get live rankings via the shared computeCategoryRankings() -- the same
      // source of truth the Rankings tab, Teams generation, and Reports already
      // use. This used to be a separate inline recompute that hardcoded scale=10
      // (wrong for any category on a different scale), never prorated a missed
      // session's weight (so an excused absence unfairly dragged the total down),
      // and used the wrong N (skaters-only, not the full roster) for the testing
      // percentile -- all of which could silently disagree with what the
      // Rankings tab already showed for the same athletes.
      let rankedAthletes = [];
      try {
        const rankData = await computeCategoryRankings(catId);
        rankedAthletes = rankData.athletes || [];
      } catch (e) { console.error('Ranking error in groups:', e); }

      // Clear skater assignments for this session (always). Clear goalies only when
      // we're going to redistribute them (scrimmage) — a testing session keeps its
      // goalie-skills group intact.
      await sql`
        DELETE FROM player_group_assignments
        WHERE session_group_id IN (SELECT id FROM session_groups WHERE age_category_id = ${catId} AND session_number = ${session_number})
          AND athlete_id IN (SELECT id FROM athletes WHERE age_category_id = ${catId} AND (position <> 'goalie' OR position IS NULL))`;
      if (mixGoalies) {
        await sql`
          DELETE FROM player_group_assignments
          WHERE session_group_id IN (SELECT id FROM session_groups WHERE age_category_id = ${catId} AND session_number = ${session_number})
            AND athlete_id IN (SELECT id FROM athletes WHERE age_category_id = ${catId} AND position = 'goalie')`;
      }

      // Contact / non-contact split (U15+). contact_groups = the count of the
      // lowest-numbered groups that are contact; the rest are non-contact. NULL/0
      // = feature off. Non-contact players are partitioned into the non-contact
      // groups by rank and never auto-placed into a contact group, regardless of
      // score — only a manual move does that.
      const catRow = (await sql`SELECT contact_groups FROM age_categories WHERE id = ${catId}`)[0];
      const contactBoundary = Number(catRow?.contact_groups) || 0;
      const splitActive = splitIsActive(skaterGroups, contactBoundary);

      let assignments = []; // [{ athlete_id, group_index }] — index into skaterGroups

      if (splitActive && method === "ranking") {
        // Rank-partitioned: contact players fill contact groups by rank, non-contact
        // fill non-contact groups by rank. (Position-balancing is skipped when the
        // split is on — the contact boundary takes precedence.)
        const ranked = rankedAthletes.length
          ? rankedAthletes.filter(a => a.position !== 'goalie')
          : (await sql`SELECT id, non_contact FROM athletes WHERE age_category_id = ${catId} AND is_active = true AND (position != 'goalie' OR position IS NULL) ORDER BY last_name`);
        assignments = partitionByContact(ranked, skaterGroups, contactBoundary);

      } else if (method === "alphabetical") {
        const athletes = await sql`
          SELECT id FROM athletes
          WHERE age_category_id = ${catId} AND is_active = true
          AND (position != 'goalie' OR position IS NULL)
          ORDER BY last_name, first_name`;

        assignments = distributeSequential(athletes.map(a => a.id), numGroups);

      } else if (method === "ranking" && !position_balanced) {
        // Sequential by rank, exclude goalies
        const ids = rankedAthletes.length
          ? rankedAthletes.filter(a => a.position !== 'goalie').map(a => a.id)
          : (await sql`SELECT id FROM athletes WHERE age_category_id = ${catId} AND is_active = true AND (position != 'goalie' OR position IS NULL) ORDER BY last_name`).map(a => a.id);

        assignments = distributeSequential(ids, numGroups);

      } else if (method === "ranking" && position_balanced) {
        // Position-balanced: 3:2 F:D ratio, goalies excluded
        const totalSkaters = rankedAthletes.filter(a => a.position !== 'goalie').length ||
          (await sql`SELECT COUNT(*) as c FROM athletes WHERE age_category_id = ${catId} AND is_active = true AND position != 'goalie'`)[0]?.c || 0;

        const groupSize = Math.ceil(totalSkaters / numGroups);
        // 3:2 ratio → 3/5 forwards, 2/5 defense per group
        const fPerGroup = Math.round(groupSize * (3/5));
        const dPerGroup = groupSize - fPerGroup;

        const forwards = rankedAthletes.length
          ? rankedAthletes.filter(a => a.position === 'forward')
          : (await sql`
              SELECT a.id FROM athletes a
              WHERE a.age_category_id = ${catId} AND a.is_active = true AND a.position = 'forward'
              ORDER BY a.last_name`);

        const defense = rankedAthletes.length
          ? rankedAthletes.filter(a => a.position === 'defense')
          : (await sql`
              SELECT a.id FROM athletes a
              WHERE a.age_category_id = ${catId} AND a.is_active = true AND a.position = 'defense'
              ORDER BY a.last_name`);

        const others = rankedAthletes.length
          ? rankedAthletes.filter(a => !a.position || (a.position !== 'forward' && a.position !== 'defense' && a.position !== 'goalie'))
          : (await sql`
              SELECT a.id FROM athletes a
              WHERE a.age_category_id = ${catId} AND a.is_active = true
              AND (a.position IS NULL OR a.position NOT IN ('forward','defense','goalie'))
              ORDER BY a.last_name`);

        const fIds = forwards.map(a => a.id || a.athlete_id);
        const dIds = defense.map(a => a.id || a.athlete_id);
        const otherIds = others.map(a => a.id || a.athlete_id);

        const fAssign = distributeSequential(fIds, numGroups, fPerGroup);
        const dAssign = distributeSequential(dIds, numGroups, dPerGroup);
        const otherAssign = distributeSequential(otherIds, numGroups);

        assignments = [...fAssign, ...dAssign, ...otherAssign];

        // The per-group F/D quotas can leave surplus skaters unassigned (e.g. more
        // forwards than fPerGroup×numGroups). Never strand a skater — backfill any
        // leftovers into the least-full groups so everyone is evaluated.
        const assignedIds = new Set(assignments.map(a => a.athlete_id));
        const leftover = [...fIds, ...dIds, ...otherIds].filter(id => !assignedIds.has(id));
        if (leftover.length) {
          const load = new Array(numGroups).fill(0);
          for (const a of assignments) load[a.group_index]++;
          for (const id of leftover) {
            let g = 0; for (let i = 1; i < numGroups; i++) if (load[i] < load[g]) g = i;
            assignments.push({ athlete_id: id, group_index: g });
            load[g]++;
          }
        }
      }

      // Insert skater assignments into the skater groups
      const validAssignments = assignments
        .filter(({ group_index }) => skaterGroups[group_index])
        .map(({ athlete_id, group_index }) => ({
          athlete_id,
          session_group_id: skaterGroups[group_index].id,
          auto_group_number: skaterGroups[group_index].group_number,
        }));

      // display_order = the athlete's overall rank, so within each group the list
      // reads top-to-bottom by ranking (not alphabetical). Because it's the global
      // rank, a player dragged into another group also slots into the right spot.
      const rankMap = {};
      rankedAthletes.forEach(a => { if (a.id != null) rankMap[a.id] = a.rank; });
      let ordFallback = 1000;
      for (const va of validAssignments) {
        const ord = rankMap[va.athlete_id] != null ? rankMap[va.athlete_id] : ordFallback++;
        // auto_group_number = the system's original group for this player, so the
        // groups page can diff it against any manual drags ("changes you made").
        await sql`
          INSERT INTO player_group_assignments (athlete_id, session_group_id, display_order, auto_group_number)
          VALUES (${va.athlete_id}, ${va.session_group_id}, ${ord}, ${va.auto_group_number})
          ON CONFLICT (athlete_id, session_group_id) DO UPDATE SET display_order = ${ord}, auto_group_number = ${va.auto_group_number}`;
      }
      // A fresh auto-assignment un-locks the session (new baseline to review).
      try { await sql`UPDATE category_sessions SET groups_locked_at = NULL WHERE age_category_id = ${catId} AND session_number = ${session_number}`; } catch { /* column not migrated */ }

      // Goalies are NEVER auto-assigned. On a scrimmage/skills session the delete
      // above cleared them out of the groups; they stay in the unassigned pool for
      // a director to drag into a group manually. (Session 1 keeps goalies in their
      // own goalie-skills group — mixGoalies is false there, so nothing is cleared.)
      const goaliesAssigned = 0;

      // Apply snake draft colors
      try {
        await applySnakeDraftColors(catId, session_number, groups);
      } catch (colorErr) {
        console.error("Color assignment error (non-fatal):", colorErr);
      }

      await sql`
        INSERT INTO audit_log (age_category_id, user_id, action, entity_type, new_value)
        VALUES (${catId}, ${userId}, 'auto_assign_groups', 'session',
          ${JSON.stringify({ session_number, method, position_balanced, count: assignments.length, goalies_assigned: goaliesAssigned })})`;

      return NextResponse.json({ success: true, assigned: assignments.length, goalies_assigned: goaliesAssigned, groups: numGroups });
    }

    if (action === "move_player") {
      const { athlete_id, from_group_id, to_group_id } = body;
      // Both groups must belong to this category -- without this, a caller
      // authorized for their own category could redirect a player into another
      // organization's group by guessing a sequential id.
      const oldGroup = await sql`SELECT group_number FROM session_groups WHERE id = ${from_group_id} AND age_category_id = ${catId}`;
      const newGroup = await sql`SELECT group_number FROM session_groups WHERE id = ${to_group_id} AND age_category_id = ${catId}`;
      if (!oldGroup.length || !newGroup.length) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      // Keep the player's display_order (their rank) so they slot into the correct
      // ranked position within the destination group — not the bottom.
      await sql`
        UPDATE player_group_assignments
        SET session_group_id = ${to_group_id}
        WHERE athlete_id = ${athlete_id} AND session_group_id = ${from_group_id}`;

      await sql`
        INSERT INTO audit_log (age_category_id, user_id, action, entity_type, entity_id, old_value, new_value)
        VALUES (${catId}, ${userId}, 'move_player_group', 'athlete', ${athlete_id},
          ${'Group ' + oldGroup[0]?.group_number}, ${'Group ' + newGroup[0]?.group_number})`;

      return NextResponse.json({ success: true });
    }

    // Confirm & lock a session's groups (finalized, ready to send to parents).
    if (action === "lock_groups") {
      const sn = parseInt(body.session_number);
      await sql`UPDATE category_sessions SET groups_locked_at = NOW() WHERE age_category_id = ${catId} AND session_number = ${sn}`;
      return NextResponse.json({ success: true, locked: true });
    }
    if (action === "unlock_groups") {
      const sn = parseInt(body.session_number);
      await sql`UPDATE category_sessions SET groups_locked_at = NULL WHERE age_category_id = ${catId} AND session_number = ${sn}`;
      return NextResponse.json({ success: true, locked: false });
    }

    // Set a player's jersey colour (White/Dark) for a group — lets directors
    // pre-assign / rebalance colours from the groups page before check-in.
    if (action === "set_color") {
      const athleteId = parseInt(body.athlete_id);
      const scheduleId = parseInt(body.schedule_id);
      // Any colour this session defines is valid -- the old White/Dark-only
      // check silently nulled a Red/Blue session's colours.
      const [csRow] = await sql`SELECT team_colors FROM checkin_sessions WHERE schedule_id = ${parseInt(body.schedule_id)}`;
      const allowed = colorNames(csRow?.team_colors).map(n => n.toLowerCase());
      const color = allowed.includes(String(body.color ?? "").toLowerCase()) ? String(body.color) : null;
      if (!athleteId || !scheduleId) return NextResponse.json({ error: "athlete_id and schedule_id required" }, { status: 400 });
      const schedOwned = await sql`SELECT id FROM evaluation_schedule WHERE id = ${scheduleId} AND age_category_id = ${catId}`;
      if (!schedOwned.length) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      let csRows = await sql`SELECT id FROM checkin_sessions WHERE schedule_id = ${scheduleId} LIMIT 1`;
      if (!csRows.length) csRows = await sql`INSERT INTO checkin_sessions (schedule_id, age_category_id, team_colors, is_open) VALUES (${scheduleId}, ${catId}, '["Red","Blue"]', false) RETURNING id`;
      await sql`
        INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, team_color, checked_in)
        VALUES (${athleteId}, ${scheduleId}, ${csRows[0].id}, ${color}, false)
        ON CONFLICT (athlete_id, schedule_id) DO UPDATE SET team_color = ${color}`;
      return NextResponse.json({ success: true, color });
    }

    // Pre-assign a jersey NUMBER for a player — carries through to check-in.
    if (action === "set_jersey_number") {
      const athleteId = parseInt(body.athlete_id);
      const scheduleId = parseInt(body.schedule_id);
      const raw = String(body.jersey_number ?? "").trim();
      const num = /^\d{1,3}$/.test(raw) ? parseInt(raw) : null;
      if (!athleteId || !scheduleId) return NextResponse.json({ error: "athlete_id and schedule_id required" }, { status: 400 });
      const schedOwned = await sql`SELECT id FROM evaluation_schedule WHERE id = ${scheduleId} AND age_category_id = ${catId}`;
      if (!schedOwned.length) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      let csRows = await sql`SELECT id FROM checkin_sessions WHERE schedule_id = ${scheduleId} LIMIT 1`;
      if (!csRows.length) csRows = await sql`INSERT INTO checkin_sessions (schedule_id, age_category_id, team_colors, is_open) VALUES (${scheduleId}, ${catId}, '["Red","Blue"]', false) RETURNING id`;
      await sql`
        INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, jersey_number, checked_in)
        VALUES (${athleteId}, ${scheduleId}, ${csRows[0].id}, ${num}, false)
        ON CONFLICT (athlete_id, schedule_id) DO UPDATE SET jersey_number = ${num}`;
      return NextResponse.json({ success: true, jersey_number: num });
    }

    // Shared by assign_goalie and assign_player below -- both just place a
    // not-yet-assigned athlete into a group; the position split is only about
    // which pool the UI surfaces them from, not how the placement itself works.
    async function assignToGroup(athleteId, groupId) {
      const group = await sql`SELECT * FROM session_groups WHERE id = ${groupId} AND age_category_id = ${catId}`;
      if (!group.length) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const athleteOwned = await sql`SELECT id FROM athletes WHERE id = ${athleteId} AND age_category_id = ${catId}`;
      if (!athleteOwned.length) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const existing = await sql`SELECT id FROM player_group_assignments WHERE athlete_id = ${athleteId} AND session_group_id = ${groupId}`;
      if (!existing.length) {
        await sql`INSERT INTO player_group_assignments (athlete_id, session_group_id, display_order) VALUES (${athleteId}, ${groupId}, 99)`;
      }
      await applySnakeDraftColors(catId, group[0]?.session_number, [group[0]]);
      return NextResponse.json({ success: true });
    }

    if (action === "assign_goalie") {
      return await assignToGroup(body.athlete_id, body.group_id);
    }

    // Places a skater who has no row at all in this session's groups -- most
    // commonly a player added via the Athletes tab after groups were already
    // built, which never touches player_group_assignments (unlike bulk import,
    // which does via ensureSessionGroup). move_player can't help here since it
    // requires an existing from_group_id.
    if (action === "assign_player") {
      return await assignToGroup(body.athlete_id, body.group_id);
    }

    if (action === "apply_colors") {
      const { session_number } = body;
      const groups = await sql`SELECT * FROM session_groups WHERE age_category_id = ${catId} AND session_number = ${session_number} ORDER BY group_number`;
      await applySnakeDraftColors(catId, session_number, groups);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Groups POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Sequential block distribution: first N in group 1, next N in group 2, etc.
function distributeSequential(ids, numGroups, maxPerGroup = null) {
  const assignments = [];
  const baseSize = maxPerGroup || Math.floor(ids.length / numGroups);
  const remainder = maxPerGroup ? 0 : ids.length % numGroups;

  let idx = 0;
  for (let g = 0; g < numGroups && idx < ids.length; g++) {
    const groupSize = maxPerGroup
      ? Math.min(maxPerGroup, ids.length - idx)
      : baseSize + (g < remainder ? 1 : 0);

    for (let p = 0; p < groupSize && idx < ids.length; p++) {
      assignments.push({ athlete_id: ids[idx++], group_index: g });
    }
  }
  return assignments;
}
