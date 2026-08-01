import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getSpCapabilities } from "@/lib/testers";

// Tester-facing testing sessions. Returns the caller's capabilities (so the
// dashboard can render tabs) plus, for testers, the testing sessions they can
// sign up for and the ones they're on. Testing sessions belong to associations
// their SP serves. A non-tester gets empty lists (no leakage).
export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const cap = await getSpCapabilities(session);
    const meta = { isTester: cap.isTester, isEvaluator: cap.isEvaluator };
    if (!cap.isTester) return NextResponse.json({ ...meta, available: [], mine: [] });

    const userId = cap.userId;
    const spIds = cap.testerOrgIds;

    // "Mine" covers both association testing sessions and SP-owned events (the
    // signup references the schedule row either way). LEFT JOINs + COALESCE fall
    // back to the SP-owned event's client_label when there's no association.
    const mine = await sql`
      SELECT tss.id as signup_id, tss.status as signup_status, tss.created_at as signed_up_at,
        es.id as schedule_id, es.scheduled_date, es.day_of_week, es.start_time, es.end_time,
        es.location, es.session_number, es.group_number, COALESCE(es.testers_required, 0) as testers_required,
        COALESCE(ac.name, es.age_label, 'Testing') as category_name, COALESCE(o.name, es.client_label) as org_name,
        COUNT(DISTINCT t2.id) as testers_signed_up
      FROM tester_session_signups tss
      JOIN evaluation_schedule es ON es.id = tss.schedule_id
      LEFT JOIN age_categories ac ON ac.id = es.age_category_id
      LEFT JOIN organizations o ON o.id = ac.organization_id
      LEFT JOIN tester_session_signups t2 ON t2.schedule_id = es.id AND t2.status = 'signed_up'
      WHERE tss.user_id = ${userId} AND tss.status != 'cancelled'
      GROUP BY tss.id, es.id, ac.id, o.id
      ORDER BY es.scheduled_date, es.start_time`;

    // Available = association testing sessions + SP-owned testing events, both
    // scoped to the tester's SP(s), under-staffed, and not already signed up.
    const assocAvailable = await sql`
      SELECT es.id as schedule_id, es.scheduled_date, es.day_of_week, es.start_time, es.end_time,
        es.location, es.session_number, es.group_number, COALESCE(es.testers_required, 0) as testers_required,
        ac.name as category_name, o.name as org_name,
        COUNT(DISTINCT tss.id) as testers_signed_up
      FROM evaluation_schedule es
      JOIN age_categories ac ON ac.id = es.age_category_id
      JOIN organizations o ON o.id = ac.organization_id
      JOIN sp_association_links sal ON sal.association_id = o.id AND sal.status = 'active'
      LEFT JOIN category_sessions cs ON cs.age_category_id = ac.id AND cs.session_number = es.session_number
      LEFT JOIN tester_session_signups tss ON tss.schedule_id = es.id AND tss.status = 'signed_up'
      WHERE sal.service_provider_id = ANY(${spIds})
        AND COALESCE(cs.session_type, '') = 'testing'
        AND es.scheduled_date >= CURRENT_DATE
        AND es.status = 'scheduled'
        AND es.id NOT IN (SELECT schedule_id FROM tester_session_signups WHERE user_id = ${userId} AND status != 'cancelled')
      GROUP BY es.id, ac.id, o.id
      HAVING COUNT(DISTINCT tss.id) < COALESCE(es.testers_required, 0)`;

    const spOwnedAvailable = await sql`
      SELECT es.id as schedule_id, es.scheduled_date, es.day_of_week, es.start_time, es.end_time,
        es.location, es.session_number, es.group_number, COALESCE(es.testers_required, 0) as testers_required,
        COALESCE(es.age_label, 'Testing') as category_name, es.client_label as org_name,
        COUNT(DISTINCT tss.id) as testers_signed_up
      FROM evaluation_schedule es
      LEFT JOIN tester_session_signups tss ON tss.schedule_id = es.id AND tss.status = 'signed_up'
      WHERE es.service_provider_id = ANY(${spIds})
        AND es.scheduled_date >= CURRENT_DATE
        AND es.status = 'scheduled'
        AND es.id NOT IN (SELECT schedule_id FROM tester_session_signups WHERE user_id = ${userId} AND status != 'cancelled')
      GROUP BY es.id
      HAVING COUNT(DISTINCT tss.id) < COALESCE(es.testers_required, 0)`;

    const available = [...assocAvailable, ...spOwnedAvailable].sort((a, b) =>
      String(a.scheduled_date).localeCompare(String(b.scheduled_date)) || String(a.start_time || "").localeCompare(String(b.start_time || "")));

    return NextResponse.json({ ...meta, available, mine });
  } catch (error) {
    console.error("Tester sessions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const cap = await getSpCapabilities(session);
    if (!cap.isTester) return NextResponse.json({ error: "Not a tester" }, { status: 403 });
    const body = await request.json();
    const scheduleId = parseInt(body.schedule_id);
    if (!scheduleId) return NextResponse.json({ error: "schedule_id required" }, { status: 400 });

    // The slot must be a testing session for one of this tester's SP associations,
    // OR an SP-owned testing event for one of their SPs.
    const ok = await sql`
      SELECT es.id FROM evaluation_schedule es
      LEFT JOIN age_categories ac ON ac.id = es.age_category_id
      LEFT JOIN sp_association_links sal ON sal.association_id = ac.organization_id AND sal.status = 'active'
      LEFT JOIN category_sessions cs ON cs.age_category_id = ac.id AND cs.session_number = es.session_number
      WHERE es.id = ${scheduleId}
        AND (
          (sal.service_provider_id = ANY(${cap.testerOrgIds}) AND COALESCE(cs.session_type, '') = 'testing')
          OR es.service_provider_id = ANY(${cap.testerOrgIds})
        )`;
    if (!ok.length) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (body.action === "signup") {
      // A tester can't be in two places at once — block signup if it overlaps in
      // time with a session they're already on that day (any location). Two slots
      // overlap when newStart < existingEnd AND existingStart < newEnd.
      const [clash] = await sql`
        SELECT es2.id, es2.start_time, es2.end_time, es2.location,
          COALESCE(ac.name, es2.age_label, 'a testing session') AS label
        FROM tester_session_signups t
        JOIN evaluation_schedule es2 ON es2.id = t.schedule_id
        JOIN evaluation_schedule newes ON newes.id = ${scheduleId}
        LEFT JOIN age_categories ac ON ac.id = es2.age_category_id
        WHERE t.user_id = ${cap.userId} AND t.status = 'signed_up'
          AND es2.id <> newes.id
          AND es2.scheduled_date = newes.scheduled_date
          AND es2.start_time IS NOT NULL AND es2.end_time IS NOT NULL
          AND newes.start_time IS NOT NULL AND newes.end_time IS NOT NULL
          AND newes.start_time < es2.end_time AND es2.start_time < newes.end_time
        LIMIT 1`;
      if (clash) {
        const t = (v) => String(v || "").slice(0, 5);
        return NextResponse.json({
          error: `That overlaps a session you're already signed up for — ${clash.label} at ${clash.location || "another location"}, ${t(clash.start_time)}–${t(clash.end_time)}. Cancel that one first if you meant to switch.`,
        }, { status: 409 });
      }
      // Cross-type double-book: a tester who also evaluates can't take a testing slot
      // that overlaps an EVALUATION they're already signed up for.
      const [evalClash] = await sql`
        SELECT es2.start_time, es2.end_time, es2.location, ac.name AS label
        FROM evaluator_session_signups e
        JOIN evaluation_schedule es2 ON es2.id = e.schedule_id
        JOIN evaluation_schedule newes ON newes.id = ${scheduleId}
        LEFT JOIN age_categories ac ON ac.id = es2.age_category_id
        WHERE e.user_id = ${cap.userId} AND e.status = 'signed_up'
          AND es2.scheduled_date = newes.scheduled_date
          AND es2.start_time IS NOT NULL AND es2.end_time IS NOT NULL
          AND newes.start_time IS NOT NULL AND newes.end_time IS NOT NULL
          AND newes.start_time < es2.end_time AND es2.start_time < newes.end_time
        LIMIT 1`;
      if (evalClash) {
        const t = (v) => String(v || "").slice(0, 5);
        return NextResponse.json({
          error: `That overlaps an evaluation you're signed up for — ${evalClash.label || "an evaluation"} at ${evalClash.location || "another location"}, ${t(evalClash.start_time)}–${t(evalClash.end_time)}. Cancel that one first if you meant to switch.`,
        }, { status: 409 });
      }
      await sql`INSERT INTO tester_session_signups (schedule_id, user_id, status) VALUES (${scheduleId}, ${cap.userId}, 'signed_up')
        ON CONFLICT (schedule_id, user_id) DO UPDATE SET status = 'signed_up'`;
      return NextResponse.json({ success: true });
    }
    if (body.action === "cancel") {
      await sql`UPDATE tester_session_signups SET status = 'cancelled' WHERE schedule_id = ${scheduleId} AND user_id = ${cap.userId}`;
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Tester signup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
