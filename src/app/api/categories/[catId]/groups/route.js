import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

async function getAppUserId(session) {
  if (!session?.email) return null;
  const user = await sql`SELECT id FROM users WHERE email = ${session.email}`;
  return user[0]?.id || null;
}

export async function GET(request, { params }) {
  try {
    const { catId } = params;
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
          SELECT pga.id as assignment_id, pga.athlete_id, pga.session_group_id, pga.display_order,
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
          SELECT pga.id as assignment_id, pga.athlete_id, pga.session_group_id, pga.display_order,
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

    return NextResponse.json({ groups, assignments, goalies });
  } catch (error) {
    console.error("Groups GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { catId } = params;
    const session = await getSession();
    const userId = await getAppUserId(session);
    const body = await request.json();
    const { action } = body;

    if (action === "auto_assign") {
      const { session_number, method, position_balanced } = body;

      const groups = await sql`
        SELECT * FROM session_groups
        WHERE age_category_id = ${catId} AND session_number = ${session_number}
        ORDER BY group_number`;

      if (!groups.length) return NextResponse.json({ error: "No groups found. Upload a schedule first." }, { status: 400 });

      const numGroups = groups.length;

      // Get live rankings
      let rankedAthletes = [];
      try {
        const rankRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/categories/${catId}/rankings`);
        const rankData = await rankRes.json();
        if (rankData.has_scores && rankData.athletes?.length) {
          rankedAthletes = rankData.athletes.sort((a, b) => (a.rank || 999) - (b.rank || 999));
        }
      } catch {}

      // Clear existing assignments
      await sql`
        DELETE FROM player_group_assignments
        WHERE session_group_id IN (
          SELECT id FROM session_groups WHERE age_category_id = ${catId} AND session_number = ${session_number}
        )`;

      let assignments = []; // [{ athlete_id, group_index }]

      if (method === "alphabetical") {
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

        // Distribute forwards sequentially
        const fAssign = distributeSequential(fIds, numGroups, fPerGroup);
        // Distribute defense sequentially
        const dAssign = distributeSequential(dIds, numGroups, dPerGroup);
        // Distribute remaining/unpositioned sequentially
        const otherAssign = distributeSequential(otherIds, numGroups);

        assignments = [...fAssign, ...dAssign, ...otherAssign];
      }

      // Insert assignments
      for (const { athlete_id, group_index } of assignments) {
        const group = groups[group_index];
        if (!group) continue;
        const existingAssign = await sql`SELECT id FROM player_group_assignments WHERE athlete_id = ${athlete_id} AND session_group_id = ${group.id}`;
        if (!existingAssign.length) {
          await sql`INSERT INTO player_group_assignments (athlete_id, session_group_id, display_order) VALUES (${athlete_id}, ${group.id}, 0)`;
        }
      }

      // Apply snake draft colors
      await applySnakeDraftColors(catId, session_number, groups);

      await sql`
        INSERT INTO audit_log (age_category_id, user_id, action, entity_type, new_value)
        VALUES (${catId}, ${userId}, 'auto_assign_groups', 'session', 
          ${JSON.stringify({ session_number, method, position_balanced, count: assignments.length })})`;

      return NextResponse.json({ success: true, assigned: assignments.length, groups: numGroups });
    }

    if (action === "move_player") {
      const { athlete_id, from_group_id, to_group_id, display_order } = body;
      const oldGroup = await sql`SELECT group_number FROM session_groups WHERE id = ${from_group_id}`;
      const newGroup = await sql`SELECT group_number FROM session_groups WHERE id = ${to_group_id}`;

      await sql`
        UPDATE player_group_assignments
        SET session_group_id = ${to_group_id}, display_order = ${display_order || 0}
        WHERE athlete_id = ${athlete_id} AND session_group_id = ${from_group_id}`;

      await sql`
        INSERT INTO audit_log (age_category_id, user_id, action, entity_type, entity_id, old_value, new_value)
        VALUES (${catId}, ${userId}, 'move_player_group', 'athlete', ${athlete_id},
          ${'Group ' + oldGroup[0]?.group_number}, ${'Group ' + newGroup[0]?.group_number})`;

      return NextResponse.json({ success: true });
    }

    if (action === "assign_goalie") {
      const { athlete_id, group_id } = body;
      const group = await sql`SELECT * FROM session_groups WHERE id = ${group_id}`;
      const existingGoalie = await sql`SELECT id FROM player_group_assignments WHERE athlete_id = ${athlete_id} AND session_group_id = ${group_id}`;
      if (!existingGoalie.length) {
        await sql`INSERT INTO player_group_assignments (athlete_id, session_group_id, display_order) VALUES (${athlete_id}, ${group_id}, 99)`;
      }

      await applySnakeDraftColors(catId, group[0]?.session_number, [group[0]]);
      return NextResponse.json({ success: true });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
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

async function applySnakeDraftColors(catId, sessionNumber, groups) {
  const COLORS = ["White", "Dark"];
  for (const group of groups) {
    if (!group) continue;
    const scheduleEntry = await sql`
      SELECT id FROM evaluation_schedule
      WHERE age_category_id = ${catId}
        AND session_number = ${sessionNumber || group.session_number}
        AND group_number = ${group.group_number}
      LIMIT 1`;
    if (!scheduleEntry.length) continue;
    const scheduleId = scheduleEntry[0].id;

    const existingCs = await sql`SELECT id FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
    if (!existingCs.length) {
      await sql`INSERT INTO checkin_sessions (schedule_id, age_category_id, team_colors, is_open) VALUES (${scheduleId}, ${catId}, '["White","Dark"]', false)`;
    }

    const cs = await sql`SELECT id FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
    const csId = cs[0]?.id;

    const players = await sql`
      SELECT pga.athlete_id FROM player_group_assignments pga
      WHERE pga.session_group_id = ${group.id}
      ORDER BY pga.display_order, pga.athlete_id`;

    for (let i = 0; i < players.length; i++) {
      const color = COLORS[i % COLORS.length];
      const existingCheckin = await sql`SELECT id FROM player_checkins WHERE athlete_id = ${players[i].athlete_id} AND schedule_id = ${scheduleId}`;
      if (existingCheckin.length) {
        await sql`UPDATE player_checkins SET team_color = ${color} WHERE athlete_id = ${players[i].athlete_id} AND schedule_id = ${scheduleId}`;
      } else {
        await sql`INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, team_color, checked_in) VALUES (${players[i].athlete_id}, ${scheduleId}, ${csId}, ${color}, false)`;
      }
    }
  }
}
