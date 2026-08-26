// Session roster: who's evaluating/testing a given session, and (for those
// authorized) placing or removing people.
//
//   GET    → session details + evaluators + testers on it + who can be added +
//            whether the caller may manage it
//   POST   → add a user as an evaluator or tester ({ user_id, kind })
//   DELETE → remove a user's signup ({ user_id, kind })
//
// Manage authority is canManageSessionAssignments on the session's association:
// God, a lead of the association, the SP admin that serves it, or an in-house
// association admin (locked out once an SP serves them).
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";
import { canManageSessionAssignments } from "@/lib/authorize";
import { eligiblePeople, eligibilityOf } from "@/lib/sessionRoster";
import { sendEmail, emailWrapper, esc } from "@/lib/email";
import { ensureEmailLogTable, logEmailSend } from "@/lib/emailLog";

function fmtDate(d) {
  if (!d) return "TBD";
  const iso = d.toString().split("T")[0];
  const [y, m, dd] = iso.split("-").map(Number);
  return y ? new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : iso;
}
function fmtTime(t) {
  if (!t) return "";
  const [h, m] = String(t).split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

// Resolve the schedule row to its association org (+ session context). SP-owned
// testing events carry a NULL category and hang off the SP instead — organization_id
// comes back null for those; governingOrgId() below falls back to service_provider_id
// so they're still manageable, just by the owning SP rather than an association.
async function loadSession(scheduleId) {
  const [row] = await sql`
    SELECT es.id, es.age_category_id, es.session_number, es.group_number,
           es.scheduled_date, es.start_time, es.end_time, es.location, es.status,
           es.service_provider_id,
           ac.name AS category_name, ac.organization_id,
           o.name AS org_name,
           cs.session_type, cs.name AS session_name,
           COALESCE(es.evaluators_required, cs.evaluators_required, 4) AS evaluators_required,
           COALESCE(es.testers_required, 0) AS testers_required
    FROM evaluation_schedule es
    LEFT JOIN age_categories ac ON ac.id = es.age_category_id
    LEFT JOIN organizations o ON o.id = ac.organization_id
    LEFT JOIN category_sessions cs ON cs.age_category_id = es.age_category_id AND cs.session_number = es.session_number
    WHERE es.id = ${scheduleId}
  `;
  return row || null;
}

// SP-owned testing events (age_category_id NULL) resolve to no association org
// via the joins above — govern those by the owning SP itself instead, since
// the SP is who actually runs and staffs them. Falling through to null here
// (both ids absent) shouldn't happen for a real row, but is handled by callers.
function governingOrgId(s) {
  return s.organization_id || s.service_provider_id || null;
}

async function rosterFor(scheduleId) {
  const evaluators = await sql`
    SELECT ess.user_id, u.name, u.email, ess.status, (ess.assigned_by IS NOT NULL) AS assigned,
      (ess.closed_at IS NOT NULL) AS closed
    FROM evaluator_session_signups ess
    JOIN users u ON u.id = ess.user_id
    WHERE ess.schedule_id = ${scheduleId} AND ess.status != 'cancelled'
    ORDER BY u.name`;
  const testers = await sql`
    SELECT tss.user_id, u.name, u.email, tss.status, (tss.assigned_by IS NOT NULL) AS assigned
    FROM tester_session_signups tss
    JOIN users u ON u.id = tss.user_id
    WHERE tss.schedule_id = ${scheduleId} AND tss.status != 'cancelled'
    ORDER BY u.name`;
  return { evaluators, testers };
}

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const scheduleId = parseInt(params.scheduleId);
    if (!scheduleId) return NextResponse.json({ error: "Invalid session" }, { status: 400 });

    const s = await loadSession(scheduleId);
    if (!s) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    // Anyone who can view the org's schedule can see the roster; management is a
    // stricter check surfaced as canManage.
    const orgId = governingOrgId(s);
    const manage = orgId ? await canManageSessionAssignments(session, orgId) : { authorized: false };

    // Gate the read to people with some access to this org (managers, or org
    // members). getAppUserId + a membership check keeps a random logged-in user
    // from enumerating rosters.
    // A viewer is a manager, or someone eligible to work this association (their
    // membership is on the SP for SP-served associations, not the association).
    const uid = await getAppUserId(session);
    let canView = manage.authorized;
    if (!canView && uid && orgId) {
      const e = await eligibilityOf(orgId, uid);
      canView = e.evaluator || e.tester;
    }
    if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const roster = await rosterFor(scheduleId);

    // Eligible to add: everyone who can work this association, not already on this
    // session — drawn from the SP's people (or direct members, in-house).
    let addable = { evaluators: [], testers: [] };
    if (manage.authorized && orgId) {
      const onEval = new Set(roster.evaluators.map(e => e.user_id));
      const onTest = new Set(roster.testers.map(t => t.user_id));
      const people = await eligiblePeople(orgId);
      addable = {
        evaluators: people.filter(m => m.is_evaluator && !onEval.has(m.user_id)),
        testers: people.filter(m => m.is_tester && !onTest.has(m.user_id)),
      };
    }

    return NextResponse.json({
      session: {
        id: s.id, category_id: s.age_category_id, category_name: s.category_name,
        org_id: orgId, org_name: s.org_name,
        session_number: s.session_number, session_name: s.session_name,
        session_type: s.session_type, group_number: s.group_number,
        scheduled_date: s.scheduled_date, start_time: s.start_time, end_time: s.end_time,
        location: s.location,
        evaluators_required: s.evaluators_required, testers_required: s.testers_required,
      },
      evaluators: roster.evaluators,
      testers: roster.testers,
      canManage: manage.authorized,
      manageReason: manage.reason || null,
      addable,
    });
  } catch (error) {
    console.error("roster GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function authorizeManage(session, scheduleId) {
  const s = await loadSession(scheduleId);
  if (!s) return { ok: false, status: 404, error: "Session not found" };
  const orgId = governingOrgId(s);
  if (!orgId) return { ok: false, status: 400, error: "This session isn't a manageable session" };
  const manage = await canManageSessionAssignments(session, orgId);
  if (!manage.authorized) return { ok: false, status: 403, error: "Forbidden", reason: manage.reason };
  return { ok: true, s, orgId };
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const scheduleId = parseInt(params.scheduleId);
    const body = await request.json();
    const { user_id, kind } = body;

    // Reopen a closed evaluator session (SP or association manager) — clears the
    // lock so that evaluator can edit again. Their session reappears on their
    // dashboard as active.
    if (body.action === "reopen") {
      if (!scheduleId || !user_id) return NextResponse.json({ error: "scheduleId and user_id required" }, { status: 400 });
      const auth = await authorizeManage(session, scheduleId);
      if (!auth.ok) return NextResponse.json({ error: auth.error, reason: auth.reason }, { status: auth.status });
      const actorId = await getAppUserId(session);
      await sql`UPDATE evaluator_session_signups SET closed_at = NULL, closed_by = NULL WHERE schedule_id = ${scheduleId} AND user_id = ${user_id}`;
      try {
        await sql`INSERT INTO audit_log (age_category_id, user_id, action, entity_type, entity_id, new_value)
          VALUES (${auth.s.age_category_id}, ${actorId}, 'reopen_evaluator_session', 'schedule', ${scheduleId}, ${JSON.stringify({ evaluator_id: user_id })})`;
      } catch { /* best-effort */ }
      return NextResponse.json({ ok: true, reopened: true });
    }

    if (!scheduleId || !user_id || !["evaluator", "tester"].includes(kind)) {
      return NextResponse.json({ error: "scheduleId, user_id and kind (evaluator|tester) required" }, { status: 400 });
    }

    const auth = await authorizeManage(session, scheduleId);
    if (!auth.ok) return NextResponse.json({ error: auth.error, reason: auth.reason }, { status: auth.status });

    // The person being placed must be eligible to work this association (member
    // of it, or of an SP serving it) with the right capability.
    const elig = await eligibilityOf(auth.orgId, user_id);
    if (kind === "evaluator" && !elig.evaluator) return NextResponse.json({ error: "That person isn't an evaluator for this association." }, { status: 400 });
    if (kind === "tester" && !elig.tester) return NextResponse.json({ error: "That person isn't a tester for this association." }, { status: 400 });

    const actorId = await getAppUserId(session);
    const table = kind === "evaluator" ? "evaluator_session_signups" : "tester_session_signups";

    // Reactivate a cancelled row if present, else insert. Keeps one row per
    // (user, session) rather than accumulating duplicates.
    if (kind === "evaluator") {
      const [ex] = await sql`SELECT id, status FROM evaluator_session_signups WHERE schedule_id = ${scheduleId} AND user_id = ${user_id}`;
      if (ex && ex.status !== "cancelled") return NextResponse.json({ ok: true, alreadyOn: true });
      if (ex) await sql`UPDATE evaluator_session_signups SET status = 'signed_up', assigned_by = ${actorId}, cancel_reason = NULL WHERE id = ${ex.id}`;
      else await sql`INSERT INTO evaluator_session_signups (schedule_id, user_id, status, assigned_by) VALUES (${scheduleId}, ${user_id}, 'signed_up', ${actorId})`;
    } else {
      const [ex] = await sql`SELECT id, status FROM tester_session_signups WHERE schedule_id = ${scheduleId} AND user_id = ${user_id}`;
      if (ex && ex.status !== "cancelled") return NextResponse.json({ ok: true, alreadyOn: true });
      if (ex) await sql`UPDATE tester_session_signups SET status = 'signed_up', assigned_by = ${actorId} WHERE id = ${ex.id}`;
      else await sql`INSERT INTO tester_session_signups (schedule_id, user_id, status, assigned_by) VALUES (${scheduleId}, ${user_id}, 'signed_up', ${actorId})`;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("roster POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const scheduleId = parseInt(params.scheduleId);
    const { user_id, kind } = await request.json();
    if (!scheduleId || !user_id || !["evaluator", "tester"].includes(kind)) {
      return NextResponse.json({ error: "scheduleId, user_id and kind required" }, { status: 400 });
    }

    const auth = await authorizeManage(session, scheduleId);
    if (!auth.ok) return NextResponse.json({ error: auth.error, reason: auth.reason }, { status: auth.status });

    // Soft-cancel (mirrors self-cancel), so history and any scoring provenance
    // survive rather than being hard-deleted.
    if (kind === "evaluator") {
      await sql`UPDATE evaluator_session_signups SET status = 'cancelled', cancel_reason = 'removed_by_admin' WHERE schedule_id = ${scheduleId} AND user_id = ${user_id}`;
    } else {
      await sql`UPDATE tester_session_signups SET status = 'cancelled' WHERE schedule_id = ${scheduleId} AND user_id = ${user_id}`;
    }

    // Removing someone here previously told no one -- they'd just discover it
    // was gone (or worse, never notice and show up anyway).
    try {
      const [removed] = await sql`SELECT email, name FROM users WHERE id = ${user_id}`;
      if (removed?.email) {
        const s = auth.s;
        const when = [fmtDate(s.scheduled_date), fmtTime(s.start_time), s.location].filter(Boolean).join(" · ");
        const html = emailWrapper(`
          <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">You've been removed from a session</h2>
          <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
            Hi ${esc(removed.name || "there")}, you were signed up as a ${kind} for <strong style="color:#111827;">${esc(s.category_name || "")}${s.org_name ? ` at ${esc(s.org_name)}` : ""}</strong> — Session ${s.session_number}${s.group_number ? ` · Group ${s.group_number}` : ""} (${esc(when)}) — but have been removed and no longer need to attend.
          </p>
        `);
        const res = await sendEmail(removed.email, `Removed from a session — ${s.category_name || "Sideline Star"}`, html);
        await ensureEmailLogTable();
        await logEmailSend({
          catId: s.age_category_id || null, orgId: auth.orgId, emailType: "removed_from_session", recipientUserId: user_id, athleteName: removed.name, to: removed.email,
          resendId: res?.id || null, status: res?.ok ? "sent" : "failed",
          error: res?.ok ? null : (res?.error || "send failed").toString().slice(0, 500),
        });
      }
    } catch (e) { console.error("roster DELETE notify:", e?.message); }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("roster DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
