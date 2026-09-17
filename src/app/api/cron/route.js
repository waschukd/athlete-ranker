import { NextResponse } from "next/server";
import crypto from "node:crypto";
import sql from "@/lib/db";
import { arenaLabel } from "@/lib/arenas";
import { emailWeeklyStaffingReport, emailDailyStaffingAlert, emailReportSalesDigest, sendEmail, emailWrapper, esc, sleep } from "@/lib/email";
import { ensureEmailLogTable, logEmailSend } from "@/lib/emailLog";
import { getCategoryDirectors } from "@/lib/categoryRecipients";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";
const CRON_SECRET = process.env.CRON_SECRET;

// Scoped to ONE organization. orgId was accepted and then never referenced, so
// every staffing email carried every organization's sessions: nine admins each
// received all 121 sessions across seven associations every morning at 07:00,
// with category names, dates and the evaluators signed up to them. A
// Confederation admin asking why she was being told to fill Competitive
// Thread's sessions is what surfaced it.
//
// The service-provider reports route has always had this filter; only this copy
// was missing it.
async function getSessionStaffing(orgId, daysAhead) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);

  // Real incident: this never actually filtered by orgId at all, so every
  // admin's staffing report/alert silently included every OTHER organization's
  // open sessions too -- Confederation's admin got a "42 sessions need
  // evaluators" email that was mostly other associations' gaps mislabeled
  // under their own org name. It also never excluded testing sessions, which
  // are staffed by testers (tester_session_signups), not evaluators -- a
  // testing session can never have an evaluator signed up, so every one of
  // them permanently read as understaffed and inflated the count.
  const sessions = await sql`
    SELECT
      es.id, es.session_number, es.group_number, es.scheduled_date,
      es.start_time, es.end_time,
      ac.name as category_name,
      COALESCE(es.evaluators_required, cs.evaluators_required, 4) as evaluators_required,
      o.name as org_name, o.id as org_id,
      COUNT(DISTINCT ess.user_id) FILTER (WHERE ess.status = 'signed_up') as signed_up,
      JSON_AGG(DISTINCT jsonb_build_object('name', u.name))
        FILTER (WHERE ess.user_id IS NOT NULL AND ess.status = 'signed_up') as evaluators
    FROM evaluation_schedule es
    JOIN age_categories ac ON ac.id = es.age_category_id
    JOIN organizations o ON o.id = ac.organization_id
    LEFT JOIN category_sessions cs ON cs.age_category_id = es.age_category_id AND cs.session_number = es.session_number
    LEFT JOIN evaluator_session_signups ess ON ess.schedule_id = es.id
    LEFT JOIN users u ON u.id = ess.user_id
    -- A service provider staffs the associations it is linked to, so its report
    -- must cover them. Competitive Thread owns one category and staffs eight
    -- associations; scoping to ac.organization_id alone sent it an empty alert
    -- while the sessions it is responsible for went unmentioned.
    LEFT JOIN sp_association_links sal
      ON sal.association_id = ac.organization_id AND sal.service_provider_id = ${orgId}
    WHERE (sal.service_provider_id = ${orgId} OR ac.organization_id = ${orgId})
      AND COALESCE(cs.session_type, 'evaluation') != 'testing'
      AND es.scheduled_date >= CURRENT_DATE
      AND es.scheduled_date <= ${cutoff.toISOString().split("T")[0]}
    GROUP BY es.id, ac.name, es.evaluators_required, cs.evaluators_required, o.name, o.id
    ORDER BY o.id, es.scheduled_date, es.start_time
  `;

  return sessions.map(s => ({
    ...s,
    date: s.scheduled_date?.toString().split("T")[0],
    time: s.start_time || "",
    group: `${s.category_name} - Group ${s.group_number}`,
    required: parseInt(s.evaluators_required) || 4,
    signed_up: parseInt(s.signed_up) || 0,
    evaluators: s.evaluators?.filter(Boolean) || [],
  }));
}

export async function GET(request) {
  // Fail closed: an unconfigured secret must never authorize a request
  // (otherwise a header of "Bearer undefined" would match).
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  // Verify cron secret via Authorization header (Vercel sends this automatically).
  // Constant-time compare: this route is reachable unauthenticated.
  const authHeader = request.headers.get("authorization") || "";
  const expected = `Bearer ${CRON_SECRET}`;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const job = searchParams.get("job"); // weekly_report | daily_alert | session_reminder | auto_close | report_sales_digest

  // ── auto_close ────────────────────────────────────────────────────────────
  //
  // Confederation uses Sideline Star for scheduling only: CT staffs the skates
  // but no scores are ever entered. Their evaluators could not close a session
  // at all, because "Save & Close" requires every checked-in athlete to be
  // scored or excused and there is nothing to satisfy that with no data. The
  // sessions sat open forever, dragging the evaluator's dashboard and the
  // staffing reports with them.
  //
  // Strictly opt-in per organization. An association that actually scores must
  // never have a session closed out from under an evaluator still working, so
  // the flag is off everywhere else.
  //
  // Runs before the admin lookup below -- it needs none of it.
  if (job === "auto_close") {
    // The session's own local wall-clock end, converted to a real instant.
    // AT TIME ZONE reads scheduled_date + end_time as Mountain local and yields
    // a timestamptz, so this is correct through the MST/MDT switch -- comparing
    // a naive timestamp to NOW() would be an hour out for half the season.
    const closed = await sql`
      UPDATE evaluator_session_signups ess
      SET closed_at = NOW()
      FROM evaluation_schedule es
      JOIN age_categories ac ON ac.id = es.age_category_id
      JOIN organizations o ON o.id = ac.organization_id
      WHERE ess.schedule_id = es.id
        AND ess.closed_at IS NULL
        AND ess.status = 'signed_up'
        AND es.status = 'scheduled'
        AND COALESCE(o.auto_close_sessions, false) = true
        AND (es.scheduled_date + COALESCE(es.end_time, es.start_time))
              AT TIME ZONE 'America/Edmonton' <= NOW()
      RETURNING ess.id, ess.user_id, ess.schedule_id, es.scheduled_date, es.start_time, es.end_time, ac.organization_id`;

    // closed_by stays NULL on purpose: nobody closed these, the clock did, and
    // a real user id here would misattribute it in the audit trail.

    // These evaluators never submit a score (pen and paper, per the org this
    // exists for), so the only other place hours get logged -- isFirstScore in
    // evaluator/scores/route.js -- never fires for them. The clock closing the
    // session is the only signal this org ever produces that a skate happened,
    // so it has to be the thing that logs the hours too, or they never get paid.
    // Same hours math as that path: session length in hours, floored at 1.
    let hoursLogged = 0;
    for (const c of closed) {
      if (!c.start_time || !c.end_time) continue;
      const [sh, sm] = c.start_time.toString().split(":").map(Number);
      const [eh, em] = c.end_time.toString().split(":").map(Number);
      const hours = Math.max(1, ((eh * 60 + em) - (sh * 60 + sm)) / 60);
      const inserted = await sql`
        INSERT INTO evaluator_hours (evaluator_id, organization_id, schedule_id, session_date, hours_worked, status)
        VALUES (${c.user_id}, ${c.organization_id}, ${c.schedule_id}, ${c.scheduled_date}, ${hours}, 'pending')
        ON CONFLICT (evaluator_id, schedule_id) DO NOTHING
        RETURNING id`;
      if (inserted.length) hoursLogged++;
    }

    return NextResponse.json({ job, closed: closed.length, hoursLogged });
  }

  // ── spot_fill_digest ────────────────────────────────────────────────────
  //
  // Real complaint: evaluators were getting an individual "urgent opening"
  // email every single time ANY session they were eligible for went short a
  // body -- offerOpenSession (src/lib/scheduleNotify.js) fired immediately,
  // synchronously, on every schedule add/edit, blasting the whole pool per
  // event. On a day with a dozen schedule corrections that's a dozen separate
  // emails to the same person. This replaces that with one consolidated
  // digest per pool, per day: "here's everything still open today," not
  // one-by-one-by-one. The immediate per-event call sites in
  // src/app/api/categories/[catId]/schedule/route.js were removed alongside
  // this landing.
  if (job === "spot_fill_digest") {
    const pools = await sql`
      SELECT id, name, type FROM organizations WHERE type IN ('service_provider', 'goalie_service_provider')
    `;

    let evaluatorsSent = 0, testersSent = 0;

    for (const pool of pools) {
      const linked = await sql`SELECT association_id FROM sp_association_links WHERE service_provider_id = ${pool.id} AND status = 'active'`;
      const orgIds = [pool.id, ...linked.map(l => l.association_id)];

      // Open sessions today, across every org this pool staffs. Evaluator
      // sessions exclude testing (staffed by testers, never evaluators --
      // same exclusion the staffing report already relies on).
      const openEval = await sql`
        SELECT es.id, es.session_number, es.group_number, es.scheduled_date, es.start_time, es.end_time, es.location,
          es.evaluators_required, ac.name as category_name, o.name as org_name,
          COUNT(*) FILTER (WHERE ess.status = 'signed_up') as signed_up
        FROM evaluation_schedule es
        JOIN age_categories ac ON ac.id = es.age_category_id
        JOIN organizations o ON o.id = ac.organization_id
        LEFT JOIN category_sessions cs ON cs.age_category_id = es.age_category_id AND cs.session_number = es.session_number
        LEFT JOIN evaluator_session_signups ess ON ess.schedule_id = es.id
        WHERE ac.organization_id = ANY(${orgIds})
          AND es.status = 'scheduled'
          AND es.scheduled_date = CURRENT_DATE
          AND COALESCE(cs.session_type, 'evaluation') != 'testing'
          AND COALESCE(es.evaluators_required, cs.evaluators_required, 4) > 0
        GROUP BY es.id, ac.name, o.name
        HAVING COUNT(*) FILTER (WHERE ess.status = 'signed_up') < COALESCE(MAX(es.evaluators_required), 4)
        ORDER BY es.scheduled_date, es.start_time
      `;

      const openTesting = await sql`
        SELECT es.id, es.session_number, es.group_number, es.scheduled_date, es.start_time, es.end_time, es.location,
          COALESCE(es.testers_required, cs.testers_required, 1) as testers_required, ac.name as category_name, o.name as org_name,
          COUNT(*) FILTER (WHERE tss.status = 'signed_up') as signed_up
        FROM evaluation_schedule es
        JOIN age_categories ac ON ac.id = es.age_category_id
        JOIN organizations o ON o.id = ac.organization_id
        LEFT JOIN category_sessions cs ON cs.age_category_id = es.age_category_id AND cs.session_number = es.session_number
        LEFT JOIN tester_session_signups tss ON tss.schedule_id = es.id
        WHERE ac.organization_id = ANY(${orgIds})
          AND es.status = 'scheduled'
          AND es.scheduled_date = CURRENT_DATE
          AND COALESCE(cs.session_type, 'evaluation') = 'testing'
        GROUP BY es.id, ac.name, o.name, cs.testers_required
        HAVING COUNT(*) FILTER (WHERE tss.status = 'signed_up') < COALESCE(MAX(es.testers_required), cs.testers_required, 1)
        ORDER BY es.scheduled_date, es.start_time
      `;

      if (openEval.length) {
        // Coaches (category_evaluators.kind = 'coach') are a comparison-only
        // scoring track, not evaluators, and must not be recruited to fill an
        // evaluator spot -- but only for the org where they coach. A real
        // evaluator who also coaches elsewhere is still an evaluator there.
        const evaluatorPool = await sql`
          SELECT DISTINCT u.id, u.email, u.name FROM evaluator_memberships em
          JOIN users u ON u.id = em.user_id
          WHERE em.organization_id = ${pool.id} AND em.status = 'active' AND em.is_evaluator = true
            AND NOT EXISTS (
              SELECT 1 FROM category_evaluators ce
              JOIN age_categories cac ON cac.id = ce.age_category_id
              WHERE ce.user_id = em.user_id AND ce.kind = 'coach' AND cac.organization_id = em.organization_id
            )
            AND u.id NOT IN (
              SELECT evaluator_id FROM evaluator_flags
              WHERE flag_type = 'late_cancel'
              GROUP BY evaluator_id HAVING COUNT(*) >= 2
            )
        `;
        const unavailable = await sql`
          SELECT DISTINCT user_id FROM evaluator_unavailability
          WHERE start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE
        `.catch(() => []);
        const unavailableSet = new Set(unavailable.map(u => u.user_id));

        for (const ev of evaluatorPool) {
          if (unavailableSet.has(ev.id)) continue;
          const alreadyOn = await sql`
            SELECT schedule_id FROM evaluator_session_signups WHERE user_id = ${ev.id} AND status = 'signed_up' AND schedule_id = ANY(${openEval.map(s => s.id)})
          `;
          const alreadyOnSet = new Set(alreadyOn.map(a => a.schedule_id));
          const relevant = openEval.filter(s => !alreadyOnSet.has(s.id));
          if (!relevant.length) continue;

          const rowsHtml = relevant.map(s => {
            const open = Math.max(0, parseInt(s.evaluators_required || 4) - parseInt(s.signed_up || 0));
            return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin-bottom:10px;">
              <div style="font-size:14px;font-weight:700;color:#111;">${esc(s.org_name)} · ${esc(s.category_name)}</div>
              <div style="font-size:13px;color:#555;margin-top:3px;">Session ${esc(s.session_number)}${s.group_number ? ` · Group ${esc(s.group_number)}` : ""} — ${s.start_time ? esc(s.start_time.toString().slice(0, 5)) : "TBD"}</div>
              <div style="font-size:13px;color:#555;">${esc(s.location) || ""}</div>
              <div style="font-size:13px;color:#b45309;font-weight:600;margin-top:4px;">${open} spot${open === 1 ? "" : "s"} still open</div>
            </div>`;
          }).join("");
          const html = emailWrapper(`
            <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">Evaluators needed today</h2>
            <p style="margin:0 0 18px;font-size:14px;color:#6b7280;">Hey ${esc(ev.name || "there")} — looking for people for these sessions today:</p>
            ${rowsHtml}
            <div style="margin-top:20px;"><a href="${BASE_URL}/evaluator/dashboard" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#0b5cd6,#3b82f6);color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">Sign Up →</a></div>
          `);
          const res = await sendEmail(ev.email, `Evaluators needed today — ${relevant.length} open session${relevant.length === 1 ? "" : "s"}`, html);
          await ensureEmailLogTable();
          await logEmailSend({
            orgId: pool.id, emailType: "evaluator_spot_fill_digest", athleteName: ev.name, to: ev.email,
            resendId: res?.id || null, status: res?.ok ? "sent" : "failed",
            error: res?.ok ? null : (res?.error || "send failed").toString().slice(0, 500),
          });
          if (res?.ok) evaluatorsSent++;
          await sleep(110);
        }
      }

      if (openTesting.length) {
        const testerPool = await sql`
          SELECT DISTINCT u.id, u.email, u.name FROM evaluator_memberships em
          JOIN users u ON u.id = em.user_id
          WHERE em.organization_id = ${pool.id} AND em.status = 'active' AND em.is_tester = true
        `;
        for (const t of testerPool) {
          const alreadyOn = await sql`
            SELECT schedule_id FROM tester_session_signups WHERE user_id = ${t.id} AND status = 'signed_up' AND schedule_id = ANY(${openTesting.map(s => s.id)})
          `;
          const alreadyOnSet = new Set(alreadyOn.map(a => a.schedule_id));
          const relevant = openTesting.filter(s => !alreadyOnSet.has(s.id));
          if (!relevant.length) continue;

          const rowsHtml = relevant.map(s => {
            const open = Math.max(0, parseInt(s.testers_required || 1) - parseInt(s.signed_up || 0));
            return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin-bottom:10px;">
              <div style="font-size:14px;font-weight:700;color:#111;">${esc(s.org_name)} · ${esc(s.category_name)}</div>
              <div style="font-size:13px;color:#555;margin-top:3px;">Testing · Session ${esc(s.session_number)}${s.group_number ? ` · Group ${esc(s.group_number)}` : ""} — ${s.start_time ? esc(s.start_time.toString().slice(0, 5)) : "TBD"}</div>
              <div style="font-size:13px;color:#555;">${esc(s.location) || ""}</div>
              <div style="font-size:13px;color:#b45309;font-weight:600;margin-top:4px;">${open} spot${open === 1 ? "" : "s"} still open</div>
            </div>`;
          }).join("");
          const html = emailWrapper(`
            <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">Testers needed today</h2>
            <p style="margin:0 0 18px;font-size:14px;color:#6b7280;">Hey ${esc(t.name || "there")} — looking for people for these testing sessions today:</p>
            ${rowsHtml}
            <div style="margin-top:20px;"><a href="${BASE_URL}/evaluator/dashboard" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#0b5cd6,#3b82f6);color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">Sign Up →</a></div>
          `);
          const res = await sendEmail(t.email, `Testers needed today — ${relevant.length} open session${relevant.length === 1 ? "" : "s"}`, html);
          await ensureEmailLogTable();
          await logEmailSend({
            orgId: pool.id, emailType: "tester_spot_fill_digest", athleteName: t.name, to: t.email,
            resendId: res?.id || null, status: res?.ok ? "sent" : "failed",
            error: res?.ok ? null : (res?.error || "send failed").toString().slice(0, 500),
          });
          if (res?.ok) testersSent++;
          await sleep(110);
        }
      }
    }

    return NextResponse.json({ job, evaluatorsSent, testersSent });
  }

  try {
    // SERVICE PROVIDERS ONLY. Staffing is the provider's job -- they hold the
    // evaluator pool and they are the only ones who can fill a gap.
    //
    // This used to include association admins, so Confederation's registrar was
    // emailed "these sessions need evaluators" about sessions she has no
    // evaluators for and no way to staff. She cannot act on it; it is noise at
    // best and reads as a demand at worst.
    //
    // Recruiting is a separate email (evaluator_spot_fill) and already goes to
    // the evaluator pool, which is where a request to fill a session belongs.
    //
    // Goalie providers are excluded too: they are booked per goalie session and
    // do not staff an evaluator roster, so an evaluator-shortfall digest is not
    // theirs to act on either.
    const admins = await sql`
      SELECT DISTINCT u.email, u.name, o.id as organization_id, o.name as org_name, o.type
      FROM users u
      JOIN organizations o ON o.contact_email = u.email
      WHERE u.email IS NOT NULL
        AND o.type = 'service_provider'
    `;

    let sent = 0;
    await ensureEmailLogTable();

    for (const admin of admins) {
      const sessions = await getSessionStaffing(admin.organization_id, job === "weekly_report" ? 7 : 2);

    if (job === "weekly_report") {
        try {
          const res = await emailWeeklyStaffingReport({
            adminEmail: admin.email,
            adminName: admin.name,
            orgName: admin.org_name,
            sessions,
          });
          await logEmailSend({
            orgId: admin.organization_id, emailType: "weekly_staffing_report", athleteName: admin.name, to: admin.email,
            resendId: res?.id || null, status: res?.ok ? "sent" : "failed",
            error: res?.ok ? null : (res?.error || "send failed").toString().slice(0, 500),
          });
          if (res?.ok) sent++;
        } catch (emailErr) { console.error("Email failed:", emailErr); }
        // Pace under Resend's 10 req/sec cap -- this loop runs across every org.
        await sleep(110);
      }

      if (job === "daily_alert") {
        const openSessions = sessions.filter(s => s.signed_up < s.required);
        if (openSessions.length) {
          try {
            const res = await emailDailyStaffingAlert({
              adminEmail: admin.email,
              adminName: admin.name,
              orgName: admin.org_name,
              openSessions,
            });
            await logEmailSend({
              orgId: admin.organization_id, emailType: "daily_staffing_alert", athleteName: admin.name, to: admin.email,
              resendId: res?.id || null, status: res?.ok ? "sent" : "failed",
              error: res?.ok ? null : (res?.error || "send failed").toString().slice(0, 500),
            });
            if (res?.ok) sent++;
          } catch (emailErr) { console.error("Email failed:", emailErr); }
        }
      }
    }

    // Weekly schedule to evaluators signed up for sessions this week. Real
    // incident: this used to live INSIDE the `for (const admin of admins)`
    // loop above without ever referencing `admin` -- it re-ran the same
    // system-wide query and re-sent to every evaluator once per admin, so
    // with 9 admins every evaluator got the same email 9 times every Sunday.
    // Runs exactly once here instead.
    if (job === "weekly_report") {
      const evalSignups = await sql`
        SELECT DISTINCT u.id AS user_id, u.email, u.name,
          es.scheduled_date, es.start_time, es.end_time, es.location,
          es.session_number, es.group_number,
          ac.name as category_name, o.name as org_name, o.id AS org_id
        FROM evaluator_session_signups ess
        JOIN users u ON u.id = ess.user_id
        JOIN evaluation_schedule es ON es.id = ess.schedule_id
        JOIN age_categories ac ON ac.id = es.age_category_id
        JOIN organizations o ON o.id = ac.organization_id
        WHERE ess.status = 'signed_up'
          AND es.scheduled_date >= CURRENT_DATE
          AND es.scheduled_date <= CURRENT_DATE + INTERVAL '7 days'
        ORDER BY u.email, es.scheduled_date, es.start_time
      `;

      // Group by evaluator
      const byEval = {};
      for (const row of evalSignups) {
        if (!byEval[row.email]) byEval[row.email] = { name: row.name, userId: row.user_id, orgId: row.org_id, sessions: [] };
        byEval[row.email].sessions.push(row);
      }

      for (const [email, data] of Object.entries(byEval)) {
        const sessionRows = data.sessions.map(s => {
          const date = s.scheduled_date?.toString().split("T")[0];
          const time = s.start_time ? `${s.start_time}${s.end_time ? ` – ${s.end_time}` : ""}` : "TBD";
          return `<tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:10px 0;font-size:13px;color:#111827;font-weight:600;">${esc(date)}</td>
            <td style="padding:10px 0;font-size:13px;color:#6b7280;">${esc(time)}</td>
            <td style="padding:10px 0;font-size:13px;color:#6b7280;">${esc(s.org_name)} · ${esc(s.category_name)}</td>
            <td style="padding:10px 0;font-size:13px;color:#6b7280;">S${esc(s.session_number)} G${esc(s.group_number)}</td>
            <td style="padding:10px 0;font-size:13px;color:#6b7280;">${esc(arenaLabel(s.location)) || "TBD"}</td>
          </tr>`;
        }).join("");

        const html = emailWrapper(`
          <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Your Sessions This Week</h2>
          <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">Hi <strong style="color:#111827;">${esc(data.name)}</strong>, here are your upcoming evaluation sessions for the week.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f3f4f6;">
            <tr style="background:#f9fafb;">
              <th style="padding:8px 0;font-size:11px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;">Date</th>
              <th style="padding:8px 0;font-size:11px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;">Time</th>
              <th style="padding:8px 0;font-size:11px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;">Organization</th>
              <th style="padding:8px 0;font-size:11px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;">Session</th>
              <th style="padding:8px 0;font-size:11px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;">Location</th>
            </tr>
            ${sessionRows}
          </table>
          <div style="margin-top:24px;">
            <a href="${BASE_URL}/evaluator/dashboard" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#0b5cd6,#3b82f6);color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">View My Dashboard →</a>
          </div>
          <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">If you can no longer attend a session, cancel at least 24 hours in advance to avoid a strike.</p>
        `);
        try {
          const res = await sendEmail(email, `📅 Your Evaluation Schedule — Week of ${data.sessions[0]?.scheduled_date?.toString().split("T")[0]}`, html);
          await logEmailSend({
            orgId: data.orgId, emailType: "weekly_evaluator_schedule", recipientUserId: data.userId, athleteName: data.name, to: email,
            resendId: res?.id || null, status: res?.ok ? "sent" : "failed",
            error: res?.ok ? null : (res?.error || "send failed").toString().slice(0, 500),
          });
          if (res?.ok) sent++;
        } catch (emailErr) { console.error("Email failed:", emailErr); }
        await sleep(110); // pace under Resend's 10 req/sec cap
      }
    }

    // ── Session Reminders (24hr before) ──
    if (job === "session_reminder") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      // Get all sessions happening tomorrow
      const upcomingSessions = await sql`
        SELECT es.id, es.age_category_id, es.session_number, es.group_number, es.scheduled_date,
          es.start_time, es.end_time, es.location,
          ac.name as category_name, o.name as org_name
        FROM evaluation_schedule es
        JOIN age_categories ac ON ac.id = es.age_category_id
        JOIN organizations o ON o.id = ac.organization_id
        WHERE es.scheduled_date = ${tomorrowStr}
      `;

      for (const session of upcomingSessions) {
        const dateStr = session.scheduled_date?.toString().split("T")[0];
        const timeStr = session.start_time ? `${session.start_time}${session.end_time ? ` – ${session.end_time}` : ""}` : "TBD";

        // Notify signed-up evaluators
        const evaluators = await sql`
          SELECT u.email, u.name FROM evaluator_session_signups ess
          JOIN users u ON u.id = ess.user_id
          WHERE ess.schedule_id = ${session.id} AND ess.status = 'signed_up'
        `;

        const reminderHtml = emailWrapper(`
          <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Session Tomorrow</h2>
          <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">You have an evaluation session tomorrow. Here are the details:</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin:20px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;width:120px;">Category</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${esc(session.category_name)}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Date</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${esc(dateStr)}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Time</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${esc(timeStr)}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Location</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${esc(arenaLabel(session.location)) || "TBD"}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Session</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">S${esc(session.session_number)} G${esc(session.group_number) || "1"}</td></tr>
            </table>
          </div>
          <a href="${BASE_URL}/evaluator/dashboard" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#0b5cd6,#3b82f6);color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">View Dashboard</a>
          <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">If you can no longer attend, cancel at least 24 hours in advance to avoid a strike.</p>
        `);

        for (const ev of evaluators) {
          try { await sendEmail(ev.email, `Reminder: ${session.category_name} Session Tomorrow — ${dateStr}`, reminderHtml); sent++; } catch (emailErr) { console.error("Email failed:", emailErr); }
          await sleep(110); // pace under Resend's 10 req/sec cap
        }

        // Notify directors assigned to this category
        const directors = await getCategoryDirectors(session.age_category_id);

        for (const dir of directors) {
          try { await sendEmail(dir.email, `Reminder: ${session.category_name} Session Tomorrow — ${dateStr}`, reminderHtml); sent++; } catch (emailErr) { console.error("Email failed:", emailErr); }
          await sleep(110); // pace under Resend's 10 req/sec cap
        }
      }
    }

    // ── Daily Development Report Sales Digest ──
    //
    // Real ask: an SP could only ever see report purchases in Stripe's own
    // raw transaction list -- no per-association breakdown, no daily
    // summary, nothing inside the app. One email per SP admin, covering the
    // last full calendar day, across every association they're linked to
    // (plus their own org, in case the SP sells reports for a category it
    // owns directly). Same admins query as weekly_report/daily_alert above.
    if (job === "report_sales_digest") {
      const spAdmins = await sql`
        SELECT DISTINCT u.email, u.name, o.id as organization_id, o.name as org_name
        FROM users u
        JOIN organizations o ON o.contact_email = u.email
        WHERE u.email IS NOT NULL AND o.type = 'service_provider'
      `;

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateLabel = yesterday.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

      await ensureEmailLogTable();
      for (const admin of spAdmins) {
        const rows = await sql`
          WITH linked_orgs AS (
            SELECT association_id AS org_id FROM sp_association_links
            WHERE service_provider_id = ${admin.organization_id} AND status = 'active'
            UNION
            SELECT ${admin.organization_id}::int
          )
          SELECT o.name AS org_name,
            COUNT(*)::int AS count,
            COALESCE(SUM(rp.amount_cents), 0)::int AS association_net_cents,
            COALESCE(SUM(rp.platform_fee_cents), 0)::int AS sp_fee_cents
          FROM report_purchases rp
          JOIN age_categories ac ON ac.id = rp.age_category_id
          JOIN organizations o ON o.id = ac.organization_id
          JOIN linked_orgs lo ON lo.org_id = o.id
          WHERE rp.status = 'completed'
            AND rp.completed_at >= CURRENT_DATE - INTERVAL '1 day'
            AND rp.completed_at < CURRENT_DATE
          GROUP BY o.name
          ORDER BY count DESC
        `;
        if (!rows.length) continue; // nothing sold yesterday -- no empty "$0" email
        try {
          const res = await emailReportSalesDigest({ adminEmail: admin.email, adminName: admin.name, orgName: admin.org_name, dateLabel, rows });
          await logEmailSend({
            orgId: admin.organization_id, emailType: "report_sales_digest", athleteName: admin.name, to: admin.email,
            resendId: res?.id || null, status: res?.ok ? "sent" : "failed",
            error: res?.ok ? null : (res?.error || "send failed").toString().slice(0, 500),
          });
          if (res?.ok) sent++;
        } catch (emailErr) { console.error("Email failed:", emailErr); }
        await sleep(110);
      }
    }

    return NextResponse.json({ success: true, job, emails_sent: sent });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
