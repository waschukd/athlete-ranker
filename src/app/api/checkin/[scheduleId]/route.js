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
import { resolveHelmetMode } from "@/lib/helmetMode";
import { parseTeamColors, colorNames } from "@/lib/teamColors";

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
      // payload.schedule_id was signed as a NUMBER (a raw DB integer column,
      // see /api/checkin/entry); scheduleId here is a route param, which
      // Next.js always hands over as a STRING. `===` between the two was
      // always false regardless of whether the id actually matched -- this
      // was the real reason a volunteer's code got accepted (entry succeeded)
      // but every follow-up request still came back 403, which the frontend
      // shows as "Session not found." String() both sides to compare values,
      // not types.
      if (payload.scope === "checkin" && String(payload.schedule_id) === String(scheduleId)) {
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
        ac.position_tagging, ac.eval_format, ac.sticky_jersey_numbers, o.name as org_name
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
        VALUES (${scheduleId}, ${sched.category_id}, '["Red","Blue"]', true)
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
          a.id, a.first_name, a.last_name, a.external_id, a.position, a.birth_year, a.helmet_number,
          pc.id as checkin_id, pc.jersey_number, pc.team_color,
          pc.checked_in, pc.checked_in_at,
          pga.display_order
        FROM player_group_assignments pga
        JOIN athletes a ON a.id = pga.athlete_id
        LEFT JOIN player_checkins pc ON pc.athlete_id = a.id AND pc.schedule_id = ${scheduleId}
        WHERE pga.session_group_id = ${sessionGroup[0].id}
        ORDER BY pga.display_order, a.last_name, a.first_name
      `;

      // Ensure every player has a player_checkins record with snake draft color,
      // drawn from THIS session's palette rather than a hardcoded White/Dark.
      const COLORS = colorNames(checkinSession[0]?.team_colors);
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
          a.id, a.first_name, a.last_name, a.external_id, a.position, a.birth_year, a.helmet_number,
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
          a.id, a.first_name, a.last_name, a.external_id, a.position, a.birth_year, a.helmet_number,
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

    // Tournament format: attach each player's scrimmage team name so whoever's
    // handing out jerseys at check-in can see it right next to the name,
    // rather than having to cross-reference the Teams tab.
    if (sched.eval_format === "round_robin" && athletes.length) {
      try {
        const teamRows = await sql`
          SELECT stm.athlete_id, st.name
          FROM scrimmage_team_members stm
          JOIN scrimmage_teams st ON st.id = stm.scrimmage_team_id
          WHERE st.age_category_id = ${sched.category_id}`;
        const teamByAthlete = {};
        for (const t of teamRows) teamByAthlete[t.athlete_id] = t.name;
        athletes = athletes.map(a => ({ ...a, team_name: teamByAthlete[a.id] || null }));
      } catch (e) { console.error("checkin: team_name lookup failed:", e?.message); }
    }

    // Tournament opt-in: carry a player's jersey number forward from their most
    // recent earlier session in this category, pre-filling it here (still fully
    // editable via the normal jersey field) rather than starting blank every
    // session. Never touches anyone already checked in, and never overwrites a
    // number already set for this session.
    if (sched.eval_format === "round_robin" && sched.sticky_jersey_numbers && athletes.length) {
      try {
        const needsFill = athletes.filter(a => !a.jersey_number && !a.checked_in).map(a => a.id);
        if (needsFill.length) {
          const prior = await sql`
            SELECT DISTINCT ON (pc.athlete_id) pc.athlete_id, pc.jersey_number
            FROM player_checkins pc
            JOIN evaluation_schedule es ON es.id = pc.schedule_id
            WHERE es.age_category_id = ${sched.category_id}
              AND es.session_number < ${sched.session_number}
              AND pc.athlete_id = ANY(${needsFill})
              AND pc.jersey_number IS NOT NULL
            ORDER BY pc.athlete_id, es.session_number DESC
          `;
          const priorByAthlete = {};
          for (const p of prior) priorByAthlete[p.athlete_id] = p.jersey_number;
          for (const athleteId of Object.keys(priorByAthlete).map(Number)) {
            await sql`
              UPDATE player_checkins SET jersey_number = ${priorByAthlete[athleteId]}
              WHERE athlete_id = ${athleteId} AND schedule_id = ${scheduleId}
                AND jersey_number IS NULL AND checked_in IS NOT TRUE
            `;
          }
          athletes = athletes.map(a => (!a.jersey_number && priorByAthlete[a.id] != null) ? { ...a, jersey_number: priorByAthlete[a.id] } : a);
        }
      } catch (e) { console.error("checkin: sticky jersey prefill failed:", e?.message); }
    }

    // Full {name,hex,text,border} entries -- the UIs render jersey circles from
    // these inline, which also dodges the [data-theme="premium"] utility-class
    // override that made White and Dark indistinguishable in grid view.
    const teamColors = parseTeamColors(checkinSession[0]?.team_colors);

    const helmet_mode = await resolveHelmetMode(sched.category_id);

    // Whether the requesting evaluator has closed (locked) their own session —
    // the scoring page uses this to go read-only. Only meaningful for a signed-in
    // evaluator; anon check-in volunteers don't score.
    let my_closed = false;
    try {
      const _s = await getSession();
      if (_s?.email) {
        const [u] = await sql`SELECT id FROM users WHERE email = ${_s.email}`;
        if (u) {
          const [sig] = await sql`SELECT closed_at FROM evaluator_session_signups WHERE schedule_id = ${scheduleId} AND user_id = ${u.id}`;
          my_closed = !!sig?.closed_at;
        }
      }
    } catch { /* non-fatal */ }
    sched.my_closed = my_closed;

    return NextResponse.json({
      schedule: sched,
      checkinSession: { ...checkinSession[0], team_colors: teamColors },
      athletes,
      helmet_mode,
      group: sessionGroup[0] || null,
      summary: {
        total: athletes.length,
        checked_in: athletes.filter(a => a.checked_in).length,
        not_checked_in: athletes.filter(a => !a.checked_in).length,
        // Per-colour tallies keyed by name, for any palette.
        by_color: Object.fromEntries(teamColors.map(c => [
          c.name, athletes.filter(a => String(a.team_color || "").toLowerCase() === c.name.toLowerCase()).length,
        ])),
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

    // Every action below except add_player/find_existing takes athlete_id from
    // the client and writes straight to player_checkins or the athletes row --
    // without this, a walk-up volunteer's session-scoped token (or any caller)
    // could point it at an athlete from a completely different organization and
    // edit their record. add_player always creates a fresh in-scope athlete;
    // find_existing has no athlete_id yet.
    if (athlete_id && !["add_player", "find_existing"].includes(action)) {
      const ath = await sql`SELECT id FROM athletes WHERE id = ${athlete_id} AND age_category_id = ${auth.ageCategoryId}`;
      if (!ath.length) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (action === "checkin") {
      const cs = await sql`SELECT id, team_colors FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
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
      // jersey_number is scoped to the active check-in -- the "checkin" action
      // above always overwrites it fresh (even to null) whenever someone checks
      // in, so undoing should clear it the same way. Otherwise a corrected/mis-
      // typed number lingers on the roster until the player is checked in again.
      // team_color is a longer-lived team assignment, not check-in state -- leave it.
      await sql`
        UPDATE player_checkins SET checked_in = false, checked_in_at = NULL, jersey_number = NULL
        WHERE athlete_id = ${athlete_id} AND schedule_id = ${scheduleId}
      `;
      return NextResponse.json({ success: true });
    }

    // Upsert so jersey/color can be set even before a check-in record exists
    // (e.g. a fresh category with no group assignments yet).
    if (action === "update_jersey") {
      const cs = await sql`SELECT id, team_colors FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
      await sql`
        INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, jersey_number)
        VALUES (${athlete_id}, ${scheduleId}, ${cs[0]?.id}, ${jersey_number})
        ON CONFLICT (athlete_id, schedule_id) DO UPDATE SET jersey_number = ${jersey_number}
      `;
      return NextResponse.json({ success: true });
    }

    // Set the jersey colours for THIS session. Decided at the door, because
    // nobody knows what is in the jersey bag until it is opened. Renaming a
    // colour also re-points every player already assigned to the old name, so
    // check-ins made before the change do not end up orphaned.
    if (action === "set_team_colors") {
      const incoming = parseTeamColors(body.team_colors);
      if (incoming.length < 2) return NextResponse.json({ error: "At least two colours required" }, { status: 400 });
      if (incoming.length > 6) return NextResponse.json({ error: "At most six colours" }, { status: 400 });

      const [cs] = await sql`SELECT id, team_colors FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
      if (!cs) return NextResponse.json({ error: "No check-in session" }, { status: 404 });

      const previous = parseTeamColors(cs.team_colors);
      await sql`UPDATE checkin_sessions SET team_colors = ${JSON.stringify(incoming)} WHERE schedule_id = ${scheduleId}`;

      // Positional remap: slot 0 stays slot 0. Only rename rows whose colour is
      // no longer in the palette, so swapping "White"->"Red" carries that team
      // over rather than stranding them on a colour the UI no longer offers.
      const stillValid = new Set(incoming.map(c => c.name.toLowerCase()));
      let remapped = 0;
      for (let i = 0; i < previous.length && i < incoming.length; i++) {
        const from = previous[i].name, to = incoming[i].name;
        if (from.toLowerCase() === to.toLowerCase()) continue;
        if (stillValid.has(from.toLowerCase())) continue; // still offered elsewhere; leave alone
        const rows = await sql`
          UPDATE player_checkins SET team_color = ${to}
          WHERE schedule_id = ${scheduleId} AND lower(team_color) = ${from.toLowerCase()}
          RETURNING athlete_id`;
        remapped += rows.length;
      }
      return NextResponse.json({ success: true, team_colors: incoming, remapped });
    }

    if (action === "move_team") {
      const cs = await sql`SELECT id, team_colors FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
      await sql`
        INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, team_color)
        VALUES (${athlete_id}, ${scheduleId}, ${cs[0]?.id}, ${team_color})
        ON CONFLICT (athlete_id, schedule_id) DO UPDATE SET team_color = ${team_color}
      `;
      return NextResponse.json({ success: true });
    }

    // Helmet sticker number lives ON THE ATHLETE (persists across every session),
    // not per-session like the jersey. Set once at check-in and it travels along.
    if (action === "update_helmet") {
      const helmet = body.helmet_number != null && String(body.helmet_number).trim() !== "" ? String(body.helmet_number).trim().slice(0, 4) : null;
      await sql`UPDATE athletes SET helmet_number = ${helmet} WHERE id = ${athlete_id}`;
      return NextResponse.json({ success: true });
    }

    if (action === "flag_present") {
      const cs = await sql`SELECT id, team_colors FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
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
      const cs = await sql`SELECT id, team_colors FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
      await sql`
        INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, jersey_number, team_color, checked_in, checked_in_at)
        VALUES (${newAthlete.id}, ${scheduleId}, ${cs[0]?.id}, ${jersey_number || null}, ${team_color || colorNames(cs[0]?.team_colors)[0]}, true, NOW())
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
      // Category-membership guard already ran above, shared with every other
      // athlete_id-bearing action.

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
      const cs = await sql`SELECT id, team_colors FROM checkin_sessions WHERE schedule_id = ${scheduleId}`;
      await sql`
        INSERT INTO player_checkins (athlete_id, schedule_id, checkin_session_id, jersey_number, team_color, checked_in, checked_in_at)
        VALUES (${athlete_id}, ${scheduleId}, ${cs[0]?.id}, ${jersey_number || null}, ${team_color || colorNames(cs[0]?.team_colors)[0]}, true, NOW())
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
