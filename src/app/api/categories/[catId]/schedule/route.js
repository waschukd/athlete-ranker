import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { notifySessionChange, offerOpenSession, notifyParentsIfImminent } from "@/lib/scheduleNotify";

function generateCheckinCode(session, group) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const prefix = `S${session}G${group}`;
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${suffix}`;
}

async function uniqueCheckinCode(session_number, group_number) {
  let code = generateCheckinCode(session_number, group_number || 0);
  let existing = await sql`SELECT id FROM evaluation_schedule WHERE checkin_code = ${code}`;
  while (existing.length) {
    code = generateCheckinCode(session_number, group_number || 0);
    existing = await sql`SELECT id FROM evaluation_schedule WHERE checkin_code = ${code}`;
  }
  return code;
}

async function ensureSessionGroup(catId, session_number, group_number) {
  if (!group_number) return;
  const existingGroup = await sql`
    SELECT id FROM session_groups
    WHERE age_category_id = ${catId} AND session_number = ${session_number} AND group_number = ${group_number}
  `;
  if (!existingGroup.length) {
    await sql`
      INSERT INTO session_groups (age_category_id, session_number, group_number, name, display_order)
      VALUES (${catId}, ${session_number}, ${group_number}, ${'Group ' + group_number}, ${group_number})
    `;
  }
}

const initiatorOf = (session) => ({ name: session.name || session.email, role: session.role });

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const schedule = await sql`
      SELECT * FROM evaluation_schedule
      WHERE age_category_id = ${catId}
      ORDER BY scheduled_date, start_time, group_number
    `;
    // Association wall: never expose SP-private tester staffing on a category
    // (association-facing) endpoint.
    return NextResponse.json({ schedule: schedule.map(({ testers_required, ...r }) => r) });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();

    // ── Add a single session ────────────────────────────────────────────────
    if (body.add) {
      const a = body.add;
      const session_number = parseInt(a.session_number);
      const group_number = parseInt(a.group_number) || 1;
      if (!session_number || !a.scheduled_date) {
        return NextResponse.json({ error: "session_number and scheduled_date required" }, { status: 400 });
      }
      const typeLookup = await sql`
        SELECT session_type FROM category_sessions
        WHERE age_category_id = ${catId} AND session_number = ${session_number} LIMIT 1
      `;
      const isTesting = typeLookup[0]?.session_type === "testing";
      // Player evaluators (0 for a testing session — players self-test). Goalie
      // evaluators are independent: goalies are scored even in a testing slot.
      const evaluators_required = isTesting ? 0 : (parseInt(a.evaluators_required ?? 4) || 4);
      const goalie_evaluators_required = parseInt(a.goalie_evaluators_required ?? 0) || 0;
      const code = await uniqueCheckinCode(session_number, group_number);
      const [row] = await sql`
        INSERT INTO evaluation_schedule (
          age_category_id, session_number, group_number, scheduled_date, day_of_week,
          start_time, end_time, location, checkin_code, evaluators_required, goalie_evaluators_required, status
        ) VALUES (
          ${catId}, ${session_number}, ${group_number}, ${a.scheduled_date}, ${a.day_of_week || null},
          ${a.start_time || null}, ${a.end_time || null}, ${a.location || null}, ${code}, ${evaluators_required}, ${goalie_evaluators_required}, 'scheduled'
        ) RETURNING *
      `;
      await ensureSessionGroup(catId, session_number, group_number);
      const { notified } = await notifySessionChange({
        catId, scheduleRow: row, scheduleId: row.id, changeType: "added",
        summary: "A new session was added to the schedule.", initiator: initiatorOf(session),
      });
      // Recruit evaluators for the new session automatically
      const offer = await offerOpenSession({ catId, scheduleRow: row });
      return NextResponse.json({ success: true, session: row, notified, offered: offer.offered });
    }

    // ── Bulk upload / replace (CSV) ───────────────────────────────────────────
    if (!body.schedule || !Array.isArray(body.schedule)) {
      return NextResponse.json({ error: "schedule array or add object required" }, { status: 400 });
    }

    let count = 0, inserted = 0, updated = 0;
    for (const entry of body.schedule) {
      const session_number = parseInt(entry.session_number);
      const group_number = parseInt(entry.group_number) || 1;
      const scheduled_date = entry.scheduled_date;
      if (!session_number || !scheduled_date) continue;
      const day_of_week = entry.day_of_week || null;
      const start_time = entry.start_time || null;
      const end_time = entry.end_time || null;
      const location = entry.location || null;
      const typeLookup = await sql`
        SELECT session_type FROM category_sessions
        WHERE age_category_id = ${catId} AND session_number = ${session_number} LIMIT 1
      `;
      const isTesting = typeLookup[0]?.session_type === "testing";
      // Respect an explicit 0 (don't coerce it to the default 4); only default when
      // the field is genuinely absent.
      const rawEval = [entry.evaluators_required, entry["Evaluators Required"], entry["Player Evaluators"]].find(v => v != null && v !== "");
      const evaluators_required = isTesting ? 0 : (rawEval != null ? (parseInt(rawEval) || 0) : 4);
      const goalie_evaluators_required = parseInt(entry.goalie_evaluators_required || entry["Goalie Evaluators"] || 0) || 0;

      const existingEntry = await sql`
        SELECT id FROM evaluation_schedule
        WHERE age_category_id = ${catId} AND session_number = ${session_number} AND group_number = ${group_number}
      `;
      if (existingEntry.length) {
        await sql`
          UPDATE evaluation_schedule SET
            scheduled_date = ${scheduled_date}, day_of_week = ${day_of_week},
            start_time = ${start_time}, end_time = ${end_time},
            location = ${location}, evaluators_required = ${evaluators_required},
            goalie_evaluators_required = ${goalie_evaluators_required}
          WHERE id = ${existingEntry[0].id}
        `;
        updated++;
      } else {
        const code = await uniqueCheckinCode(session_number, group_number);
        await sql`
          INSERT INTO evaluation_schedule (
            age_category_id, session_number, group_number, scheduled_date, day_of_week,
            start_time, end_time, location, checkin_code, evaluators_required, goalie_evaluators_required, status
          ) VALUES (
            ${catId}, ${session_number}, ${group_number}, ${scheduled_date}, ${day_of_week},
            ${start_time}, ${end_time}, ${location}, ${code}, ${evaluators_required}, ${goalie_evaluators_required}, 'scheduled'
          )
        `;
        inserted++;
      }
      count++;
      await ensureSessionGroup(catId, session_number, group_number);
    }

    await notifySessionChange({
      catId, changeType: "edited",
      summary: "The full schedule was updated — please review your session times and locations.",
      initiator: initiatorOf(session),
    });

    return NextResponse.json({ success: true, count, inserted, updated });
  } catch (error) {
    console.error("Schedule POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Edit one session's details, or reinstate a cancelled one (status: "scheduled").
export async function PATCH(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const id = body.id;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const before = await sql`SELECT * FROM evaluation_schedule WHERE id = ${id} AND age_category_id = ${catId}`;
    if (!before.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const prev = before[0];

    // Coalesce only provided fields
    const scheduled_date = body.scheduled_date ?? prev.scheduled_date;
    const day_of_week = body.day_of_week ?? prev.day_of_week;
    const start_time = body.start_time ?? prev.start_time;
    const end_time = body.end_time ?? prev.end_time;
    const location = body.location ?? prev.location;
    const evaluators_required = body.evaluators_required != null ? parseInt(body.evaluators_required) : prev.evaluators_required;
    const goalie_evaluators_required = body.goalie_evaluators_required != null ? parseInt(body.goalie_evaluators_required) : prev.goalie_evaluators_required;
    const reinstating = body.status === "scheduled" && prev.status === "cancelled";
    const status = body.status ?? prev.status;

    const [row] = await sql`
      UPDATE evaluation_schedule SET
        scheduled_date = ${scheduled_date}, day_of_week = ${day_of_week},
        start_time = ${start_time}, end_time = ${end_time},
        location = ${location}, evaluators_required = ${evaluators_required},
        goalie_evaluators_required = ${goalie_evaluators_required}, status = ${status}
      WHERE id = ${id} RETURNING *
    `;

    // Build a short human summary of what changed
    const changes = [];
    if (fmt(prev.scheduled_date) !== fmt(row.scheduled_date)) changes.push(`date → ${fmt(row.scheduled_date)}`);
    if ((prev.start_time || "") !== (row.start_time || "")) changes.push(`time → ${row.start_time || "TBD"}`);
    if ((prev.location || "") !== (row.location || "")) changes.push(`location → ${row.location || "TBD"}`);
    const summary = reinstating
      ? "This session is back on."
      : changes.length ? `Changed: ${changes.join(", ")}.` : undefined;

    const { notified } = await notifySessionChange({
      catId, scheduleRow: row, scheduleId: row.id,
      changeType: reinstating ? "reinstated" : "edited", summary, initiator: initiatorOf(session),
    });

    // If the session needs more evaluators (e.g. moved date freed people up), recruit.
    const offer = await offerOpenSession({ catId, scheduleRow: row });

    // Last-minute date/time change → tell the affected parents.
    const timeChanged = fmt(prev.scheduled_date) !== fmt(row.scheduled_date)
      || (prev.start_time || "") !== (row.start_time || "");
    if (timeChanged || reinstating) {
      await notifyParentsIfImminent({ catId, scheduleRow: row, changeType: "edited" });
    }

    return NextResponse.json({ success: true, session: row, notified, offered: offer.offered });
  } catch (error) {
    console.error("Schedule PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function fmt(d) { return d ? d.toString().split("T")[0] : ""; }

// Soft-cancel a session: mark it cancelled, release any evaluator sign-ups, and
// notify everyone tied to it. (No hard delete — keeps history and is reversible
// via PATCH status:"scheduled".)
export async function DELETE(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get("id");
    if (!scheduleId) return NextResponse.json({ error: "id required" }, { status: 400 });

    const entry = await sql`
      SELECT * FROM evaluation_schedule WHERE id = ${scheduleId} AND age_category_id = ${catId}
    `;
    if (!entry.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [row] = await sql`
      UPDATE evaluation_schedule SET status = 'cancelled' WHERE id = ${scheduleId} RETURNING *
    `;
    // Release sign-ups so the slot frees up and evaluators stop counting toward staffing
    await sql`
      UPDATE evaluator_session_signups SET status = 'released'
      WHERE schedule_id = ${scheduleId} AND status = 'signed_up'
    `;

    const { notified } = await notifySessionChange({
      catId, scheduleRow: row, scheduleId: row.id, changeType: "cancelled",
      summary: "This session has been cancelled.", initiator: initiatorOf(session),
    });

    // Parents only get pinged if the cancellation is last-minute (session within ~48h).
    const parents = await notifyParentsIfImminent({ catId, scheduleRow: row, changeType: "cancelled" });

    return NextResponse.json({ success: true, notified, parentsNotified: parents.notified });
  } catch (error) {
    console.error("Schedule DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
