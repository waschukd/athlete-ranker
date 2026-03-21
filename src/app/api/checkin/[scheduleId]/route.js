import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(request, { params }) {
  try {
    const { scheduleId } = params;

    const scheduleInfo = await sql`
      SELECT sch.*, ac.id as category_id, ac.name as category_name,
        ac.position_tagging, o.name as org_name
      FROM evaluation_schedule sch
      JOIN age_categories ac ON ac.id = sch.age_category_id
      JOIN organizations o ON o.id = ac.organization_id
      WHERE sch.id = ${scheduleId}
    `;

    if (!scheduleInfo.length) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const sched = scheduleInfo[0];

    // Get or create checkin session
    let checkinSession = await sql`SELECT * FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;

    if (!checkinSession.length) {
      checkinSession = await sql`
        INSERT INTO checkin_sessions (schedule_id, age_category_id, team_colors, is_open)
        VALUES (${scheduleId}, ${sched.category_id}, '["White","Dark"]', true)
        RETURNING *
      `;
    } else {
      await sql`UPDATE checkin_sessions SET is_open = true WHERE schedule_id = ${scheduleId}`;
    }

    const csId = checkinSession[0].id;

    // Find the session group for this schedule entry
    const sessionGroup = await sql`
      SELECT sg.id FROM session_groups sg
      WHERE sg.age_category_id = ${sched.category_id}
        AND sg.session_number = ${sched.session_number}
        AND sg.group_number = ${sched.group_number}
      LIMIT 1
    `;

    let athletes = [];

    if (sessionGroup.length) {
      // Only show athletes assigned to this group
      athletes = await sql`
        SELECT
          a.id, a.first_name, a.last_name, a.external_id, a.position, a.birth_year,
          pc.id as checkin_id, pc.jersey_number, pc.team_color,
          pc.checked_in, pc.checked_in_at,
          pga.display_order
        FROM player_group_assignments pga
        JOIN athletes a ON a.id = pga.athlete_id
        LEFT JOIN player_checkins pc ON pc.athlete_id = a.id AND pc.schedule_id = ${scheduleId}
        WHERE pga.session_group_id = ${sessionGroup[0].id}
        ORDER BY pga.display_order, a.last_name, a.first_name
      `;

      // Ensure every player has a player_checkins record with snake draft color
      const COLORS = ["White", "Dark"];
      for (let i = 0; i < athletes.length; i++) {
        const a = athletes[i];
        if (!a.checkin_id) {
          const color = COLORS[i % COLORS.length];
          await sql`
            INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, team_color, checked_in)
            VALUES (${a.id}, ${scheduleId}, ${csId}, ${color}, false)
            ON CONFLICT (athlete_id, schedule_id) DO NOTHING
          `;
        }
      }

      // Re-fetch with updated records
      athletes = await sql`
        SELECT
          a.id, a.first_name, a.last_name, a.external_id, a.position, a.birth_year,
          pc.id as checkin_id, pc.jersey_number, pc.team_color,
          pc.checked_in, pc.checked_in_at,
          pga.display_order
        FROM player_group_assignments pga
        JOIN athletes a ON a.id = pga.athlete_id
        LEFT JOIN player_checkins pc ON pc.athlete_id = a.id AND pc.schedule_id = ${scheduleId}
        WHERE pga.session_group_id = ${sessionGroup[0].id}
        ORDER BY pga.display_order, a.last_name, a.first_name
      `;
    } else {
      // Fallback — no groups set up yet
      athletes = await sql`
        SELECT
          a.id, a.first_name, a.last_name, a.external_id, a.position, a.birth_year,
          pc.id as checkin_id, pc.jersey_number, pc.team_color,
          pc.checked_in, pc.checked_in_at, 0 as display_order
        FROM athletes a
        LEFT JOIN player_checkins pc ON pc.athlete_id = a.id AND pc.schedule_id = ${scheduleId}
        WHERE a.age_category_id = ${sched.category_id} AND a.is_active = true
        ORDER BY a.last_name, a.first_name
      `;
    }

    const teamColors = typeof checkinSession[0]?.team_colors === "string"
      ? JSON.parse(checkinSession[0].team_colors)
      : (checkinSession[0]?.team_colors || ["White", "Dark"]);

    return NextResponse.json({
      schedule: sched,
      checkinSession: { ...checkinSession[0], team_colors: teamColors },
      athletes,
      group: sessionGroup[0] || null,
      summary: {
        total: athletes.length,
        checked_in: athletes.filter(a => a.checked_in).length,
        not_checked_in: athletes.filter(a => !a.checked_in).length,
        white_count: athletes.filter(a => a.team_color === "White").length,
        dark_count: athletes.filter(a => a.team_color === "Dark").length,
      },
    });
  } catch (error) {
    console.error("Checkin GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { scheduleId } = params;
    const body = await request.json();
    const { action, athlete_id, jersey_number, team_color } = body;

    if (action === "checkin") {
      const cs = await sql`SELECT id FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
      await sql`
        INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, jersey_number, team_color, checked_in, checked_in_at)
        VALUES (${athlete_id}, ${scheduleId}, ${cs[0]?.id}, ${jersey_number || null}, ${team_color || null}, true, NOW())
        ON CONFLICT (athlete_id, schedule_id) DO UPDATE SET
          jersey_number = ${jersey_number || null},
          team_color = COALESCE(${team_color || null}, player_checkins.team_color),
          checked_in = true,
          checked_in_at = NOW()
      `;
      return NextResponse.json({ success: true });
    }

    if (action === "undo_checkin") {
      await sql`
        UPDATE player_checkins SET checked_in = false, checked_in_at = NULL
        WHERE athlete_id = ${athlete_id} AND schedule_id = ${scheduleId}
      `;
      return NextResponse.json({ success: true });
    }

    if (action === "update_jersey") {
      await sql`
        UPDATE player_checkins SET jersey_number = ${jersey_number}
        WHERE athlete_id = ${athlete_id} AND schedule_id = ${scheduleId}
      `;
      return NextResponse.json({ success: true });
    }

    if (action === "move_team") {
      await sql`
        UPDATE player_checkins SET team_color = ${team_color}
        WHERE athlete_id = ${athlete_id} AND schedule_id = ${scheduleId}
      `;
      return NextResponse.json({ success: true });
    }

    if (action === "flag_present") {
      const cs = await sql`SELECT id FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
      const schedInfo = await sql`
        SELECT es.*, ac.id as cat_id FROM evaluation_schedule es
        JOIN age_categories ac ON ac.id = es.age_category_id WHERE es.id = ${scheduleId}
      `;
      await sql`
        INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, checked_in, team_color)
        VALUES (${athlete_id}, ${scheduleId}, ${cs[0]?.id}, false, 'PENDING')
        ON CONFLICT (athlete_id, schedule_id) DO UPDATE SET team_color = 'PENDING'
      `;
      await sql`
        INSERT INTO audit_log (age_category_id, action, entity_type, entity_id, notes)
        VALUES (${schedInfo[0]?.cat_id}, 'flag_present', 'athlete', ${athlete_id}, 'Flagged by volunteer - needs verification')
      `;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Checkin POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
