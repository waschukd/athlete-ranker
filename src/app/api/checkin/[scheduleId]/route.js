// Player check-in API. Accessible to two distinct caller types:
//
//   1. Authenticated staff (super_admin, association_admin,
//      service_provider_admin, director, evaluator, volunteer with a
//      membership in the schedule's org) — gated by
//      authorizeCategoryAccess() against the schedule's age category.
//
//   2. Unauthenticated walk-up volunteers who came in via
//      /api/checkin/entry with a director-issued short code. That
//      endpoint mints a signed httpOnly checkin-token cookie bound to
//      a specific scheduleId; we re-verify it here.
//
// Either path must succeed before any data is read or written. Prior
// versions had no auth at all on this route, so any anon user could
// enumerate schedules by id and check players in/out.

import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { resolveEvaluatorKind } from "@/lib/categoryEvaluators";

if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET environment variable is required");
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);

async function authorizeCheckin(scheduleId) {
  const sched = await sql`SELECT age_category_id FROM evaluation_schedule WHERE id = ${scheduleId}`;
  if (!sched.length) return { ok: false, status: 404, error: "Session not found" };
  const ageCategoryId = sched[0].age_category_id;

  // Path 1: authenticated staff session
  const session = await getSession();
  if (session) {
    const auth = await authorizeCategoryAccess(session, ageCategoryId);
    if (auth.authorized) return { ok: true, ageCategoryId };
  }

  // Path 2: walk-up volunteer with a checkin-token cookie
  const token = cookies().get("checkin-token")?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, SECRET);
      if (payload.scope === "checkin" && payload.schedule_id === scheduleId) {
        return { ok: true, ageCategoryId };
      }
    } catch {
      // fall through to 403
    }
  }

  return { ok: false, status: 403, error: "Forbidden" };
}

export async function GET(request, { params }) {
  try {
    const { scheduleId } = params;
    const auth = await authorizeCheckin(scheduleId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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

    // Only scope check-in to the group if this SESSION actually uses group
    // assignments. A brand-new category has an (empty) group auto-created with the
    // schedule but no players assigned yet — in that case show the full roster so
    // everyone can be checked in (otherwise the screen shows 0/0).
    let useGroup = false;
    if (sessionGroup.length) {
      const assignedInSession = await sql`
        SELECT COUNT(*)::int AS n FROM player_group_assignments pga
        JOIN session_groups sg ON sg.id = pga.session_group_id
        WHERE sg.age_category_id = ${sched.category_id} AND sg.session_number = ${sched.session_number}
      `;
      useGroup = assignedInSession[0].n > 0;
    }

    if (useGroup) {
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
        WHERE a.age_category_id = ${sched.category_id} AND a.is_active = true AND a.cut_at IS NULL
        ORDER BY a.last_name, a.first_name
      `;
    }

    // Goalie-only evaluators: hard server-side isolation — they only ever receive
    // goalies for their session, never skater data.
    const sess = await getSession();
    if (sess?.email) {
      const u = await sql`SELECT id FROM users WHERE email = ${sess.email}`;
      if (u[0]?.id) {
        const kind = await resolveEvaluatorKind(sched.category_id, u[0].id, sess.email);
        if (kind === "goalie") athletes = athletes.filter(a => (a.position || "").toLowerCase() === "goalie");
      }
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { scheduleId } = params;
    const auth = await authorizeCheckin(scheduleId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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

    // Upsert so jersey/color can be set even before a check-in record exists
    // (e.g. a fresh category with no group assignments yet).
    if (action === "update_jersey") {
      const cs = await sql`SELECT id FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
      await sql`
        INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, jersey_number)
        VALUES (${athlete_id}, ${scheduleId}, ${cs[0]?.id}, ${jersey_number})
        ON CONFLICT (athlete_id, schedule_id) DO UPDATE SET jersey_number = ${jersey_number}
      `;
      return NextResponse.json({ success: true });
    }

    if (action === "move_team") {
      const cs = await sql`SELECT id FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
      await sql`
        INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, team_color)
        VALUES (${athlete_id}, ${scheduleId}, ${cs[0]?.id}, ${team_color})
        ON CONFLICT (athlete_id, schedule_id) DO UPDATE SET team_color = ${team_color}
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

    if (action === "add_player") {
      const { first_name, last_name, position } = body;
      if (!first_name || !last_name) return NextResponse.json({ error: "First and last name required" }, { status: 400 });

      // Get schedule + category info
      const schedInfo = await sql`
        SELECT es.*, ac.id as cat_id, ac.organization_id
        FROM evaluation_schedule es
        JOIN age_categories ac ON ac.id = es.age_category_id
        WHERE es.id = ${scheduleId}
      `;
      if (!schedInfo.length) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
      const sched = schedInfo[0];

      // Create athlete
      const [newAthlete] = await sql`
        INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, position, is_active)
        VALUES (${sched.organization_id}, ${sched.cat_id}, ${first_name}, ${last_name}, ${position || null}, true)
        RETURNING *
      `;

      // Add to session group if one exists
      const sessionGroup = await sql`
        SELECT id FROM session_groups
        WHERE age_category_id = ${sched.cat_id}
          AND session_number = ${sched.session_number}
          AND group_number = ${sched.group_number || 1}
        LIMIT 1
      `;
      if (sessionGroup.length) {
        await sql`
          INSERT INTO player_group_assignments (athlete_id, session_group_id, display_order)
          VALUES (${newAthlete.id}, ${sessionGroup[0].id}, 99)
          ON CONFLICT DO NOTHING
        `;
      }

      // Create checkin record and check them in
      const cs = await sql`SELECT id FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
      await sql`
        INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, jersey_number, team_color, checked_in, checked_in_at)
        VALUES (${newAthlete.id}, ${scheduleId}, ${cs[0]?.id}, ${jersey_number || null}, ${team_color || 'White'}, true, NOW())
        ON CONFLICT (athlete_id, schedule_id) DO UPDATE SET checked_in = true, checked_in_at = NOW()
      `;

      return NextResponse.json({ success: true, athlete: newAthlete });
    }

    if (action === "find_existing") {
      const q = (body.query || "").trim();
      if (q.length < 2) return NextResponse.json({ matches: [] });

      const schedInfo = await sql`
        SELECT session_number, group_number FROM evaluation_schedule WHERE id = ${scheduleId}
      `;
      if (!schedInfo.length) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
      const sched = schedInfo[0];
      const like = `%${q.replace(/[\\%_]/g, c => "\\" + c)}%`;

      // Athletes in this category whose name matches, excluding any already
      // assigned to THIS session's group (they're already in the main list).
      const matches = await sql`
        SELECT a.id, a.first_name, a.last_name, a.position,
               sg.session_number, sg.group_number
        FROM athletes a
        LEFT JOIN player_group_assignments pga ON pga.athlete_id = a.id
        LEFT JOIN session_groups sg ON sg.id = pga.session_group_id
        WHERE a.age_category_id = ${auth.ageCategoryId}
          AND a.is_active = true AND a.cut_at IS NULL
          AND (a.first_name ILIKE ${like} ESCAPE '\'
               OR a.last_name ILIKE ${like} ESCAPE '\'
               OR (a.first_name || ' ' || a.last_name) ILIKE ${like} ESCAPE '\')
          AND NOT EXISTS (
            SELECT 1 FROM player_group_assignments pga2
            JOIN session_groups sg2 ON sg2.id = pga2.session_group_id
            WHERE pga2.athlete_id = a.id
              AND sg2.age_category_id = ${auth.ageCategoryId}
              AND sg2.session_number = ${sched.session_number}
              AND sg2.group_number = ${sched.group_number || 1}
          )
        ORDER BY a.last_name, a.first_name
        LIMIT 8
      `;

      return NextResponse.json({ matches });
    }

    if (action === "add_existing") {
      if (!athlete_id) return NextResponse.json({ error: "athlete_id required" }, { status: 400 });

      // Guard: the athlete must belong to this schedule's category. Prevents
      // pulling an arbitrary athlete from another org/category via a guessed id.
      const ath = await sql`SELECT id, age_category_id FROM athletes WHERE id = ${athlete_id}`;
      if (!ath.length) return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
      if (ath[0].age_category_id !== auth.ageCategoryId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const schedInfo = await sql`
        SELECT session_number, group_number FROM evaluation_schedule WHERE id = ${scheduleId}
      `;
      if (!schedInfo.length) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
      const sched = schedInfo[0] || {};

      // Attach to this session's group if one exists (mirrors add_player).
      const sessionGroup = await sql`
        SELECT id FROM session_groups
        WHERE age_category_id = ${auth.ageCategoryId}
          AND session_number = ${sched.session_number}
          AND group_number = ${sched.group_number || 1}
        LIMIT 1
      `;
      if (sessionGroup.length) {
        await sql`
          INSERT INTO player_group_assignments (athlete_id, session_group_id, display_order)
          VALUES (${athlete_id}, ${sessionGroup[0].id}, 99)
          ON CONFLICT DO NOTHING
        `;
      }

      // Check them into THIS session, reusing the existing athlete_id.
      const cs = await sql`SELECT id FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
      await sql`
        INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, jersey_number, team_color, checked_in, checked_in_at)
        VALUES (${athlete_id}, ${scheduleId}, ${cs[0]?.id}, ${jersey_number || null}, ${team_color || 'White'}, true, NOW())
        ON CONFLICT (athlete_id, schedule_id) DO UPDATE SET
          checked_in = true,
          checked_in_at = NOW(),
          jersey_number = COALESCE(${jersey_number || null}, player_checkins.jersey_number),
          team_color = COALESCE(${team_color || null}, player_checkins.team_color)
      `;

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Checkin POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
