import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sql from "@/lib/db";
import { getSession, resolveSpContext } from "@/lib/auth";
import { sendEmail, esc, sleep, fmtBlastDate, fmtBlastTime } from "@/lib/email";
import { ensureEmailLogTable, logEmailSend } from "@/lib/emailLog";

const ADMIN_ROLES = new Set(["super_admin", "service_provider_admin", "association_admin"]);

// Send one tester invite email. Returns true if actually sent (RESEND configured).
async function sendTesterInvite(email, signup_url, sp_name, orgId) {
  const res = await sendEmail(email, `You've been invited to join the testing crew for ${sp_name || "a hockey organization"}`,
    `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <h1 style="font-size: 22px; font-weight: 700; color: #111;">You're invited to be a tester!</h1>
      <p style="color: #555; font-size: 15px;">${esc(sp_name) || "A hockey organization"} has invited you to join their testing crew — you'll run the on-ice testing sessions.</p>
      <p style="color: #555; font-size: 15px;">Click below to create your account and start signing up for testing dates.</p>
      <a href="${signup_url}" style="display: inline-block; padding: 14px 28px; background: #0b5cd6; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; margin: 20px 0;">Accept Invitation →</a>
      <p style="color: #aaa; font-size: 12px; margin-top: 32px;">Sideline Star · Athlete Evaluation Platform</p>
    </div>`);
  await logEmailSend({
    orgId, emailType: "tester_invite", to: email,
    resendId: res?.id || null, status: res?.ok ? "sent" : "failed",
    error: res?.ok ? null : (res?.error || "send failed").toString().slice(0, 500),
  });
  return res.ok;
}

// Send one evaluator invite email. Returns true if actually sent (RESEND configured).
async function sendEvaluatorInvite(email, signup_url, sp_name, orgId) {
  const res = await sendEmail(email, `You've been invited to evaluate for ${sp_name || "a hockey organization"}`,
    `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <h1 style="font-size: 22px; font-weight: 700; color: #111;">You're invited to evaluate!</h1>
      <p style="color: #555; font-size: 15px;">${esc(sp_name) || "A hockey organization"} has invited you to join their evaluator pool.</p>
      <p style="color: #555; font-size: 15px;">Click below to create your account and start signing up for sessions.</p>
      <a href="${signup_url}" style="display: inline-block; padding: 14px 28px; background: #0b5cd6; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; margin: 20px 0;">Accept Invitation →</a>
      <p style="color: #aaa; font-size: 12px; margin-top: 32px;">Sideline Star · Athlete Evaluation Platform</p>
    </div>`);
  await logEmailSend({
    orgId, emailType: "evaluator_invite", to: email,
    resendId: res?.id || null, status: res?.ok ? "sent" : "failed",
    error: res?.ok ? null : (res?.error || "send failed").toString().slice(0, 500),
  });
  return res.ok;
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ADMIN_ROLES.has(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { action, schedule_id, schedule_ids, message } = body;
    // A director blasting evaluators about one open session almost always has
    // several back-to-back ones at the same rink too (that's exactly the
    // "want these additional sessions as well?" prompt evaluators already get
    // when signing up) -- schedule_ids lets the caller bundle them into ONE
    // email per evaluator instead of one blast per session. schedule_id
    // (singular) still works for a single session and for notify_testers,
    // which isn't part of this bundling.
    const ids = Array.isArray(schedule_ids) && schedule_ids.length
      ? [...new Set(schedule_ids.map(Number).filter(Number.isFinite))]
      : (schedule_id ? [schedule_id] : []);

    // Direct email invite(s) — evaluator or tester, single or batch. Each invitee is
    // PRE-AUTHORIZED: we mint a per-invite token and email a personal link; accepting
    // it makes them ACTIVE with no approval (the SP already chose them). Shared join
    // codes remain the self-serve, needs-approval path.
    if (["invite_evaluator", "invite_evaluators", "invite_tester", "invite_testers"].includes(action)) {
      const isTesterInvite = action.includes("tester");
      const role = isTesterInvite ? "service_provider_tester" : "service_provider_evaluator";
      const { sp_name } = body;
      const { orgId: sp_id } = await resolveSpContext(session, new URL(request.url).searchParams.get("org"));
      if (!sp_id) return NextResponse.json({ error: "Not a service provider" }, { status: 403 });
      const raw = Array.isArray(body.emails) ? body.emails : (body.email ? [body.email] : []);
      const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
      const valid = [...new Set(raw.map(e => String(e).trim().toLowerCase()).filter(e => emailRe.test(e)))];
      const invalid = raw.length - valid.length;
      if (!valid.length) return NextResponse.json({ error: "No valid email addresses" }, { status: 400 });
      const inviterId = (await sql`SELECT id FROM users WHERE email = ${session.email}`)[0]?.id || null;
      const origin = process.env.NEXT_PUBLIC_BASE_URL || (body.signup_url ? new URL(body.signup_url).origin : "");
      await ensureEmailLogTable();
      let sent = 0; const links = [];
      for (const email of valid) {
        const token = randomUUID();
        await sql`INSERT INTO evaluator_invitations (organization_id, email, invited_by_user_id, invite_token, status, role, expires_at)
          VALUES (${sp_id}, ${email}, ${inviterId}, ${token}, 'pending', ${role}, NOW() + INTERVAL '30 days')`;
        const link = `${origin}/evaluator/signup?invite=${token}`;
        links.push({ email, link });
        if (isTesterInvite ? await sendTesterInvite(email, link, sp_name, sp_id) : await sendEvaluatorInvite(email, link, sp_name, sp_id)) sent++;
        // Pace under Resend's 10 req/sec cap for a large batch invite.
        await sleep(110);
      }
      return NextResponse.json({
        success: true, sent, valid: valid.length, invalid,
        links: process.env.RESEND_API_KEY ? undefined : links,
        message: process.env.RESEND_API_KEY
          ? `Sent ${sent} invite${sent === 1 ? "" : "s"}${invalid ? `, skipped ${invalid} invalid` : ""} — they join active, no approval needed.`
          : `Email isn't configured — copy the invite link${valid.length === 1 ? "" : "s"} below to share manually.`,
      });
    }

    // Resolve SP org (contact_email, additional-admin role, or membership)
    const { orgId: sp_id } = await resolveSpContext(session, new URL(request.url).searchParams.get("org"));
    if (!sp_id) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const admin_name = session.name || session.email;

    if (!ids.length) return NextResponse.json({ error: "schedule_id or schedule_ids required" }, { status: 400 });

    // Get session details + the org each schedule row belongs to so we can
    // confirm every one of them is a linked association (or the SP itself)
    // before blasting their details out to the SP's evaluator pool.
    const schedInfo = await sql`
      SELECT es.*, ac.organization_id, COALESCE(ac.name, 'Testing') as category_name, COALESCE(o.name, es.client_label) as org_name
      FROM evaluation_schedule es
      LEFT JOIN age_categories ac ON ac.id = es.age_category_id
      LEFT JOIN organizations o ON o.id = ac.organization_id
      WHERE es.id = ANY(${ids})
    `;
    if (!schedInfo.length) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (action === "notify_testers" && ids.length !== 1) {
      return NextResponse.json({ error: "notify_testers takes a single schedule_id" }, { status: 400 });
    }
    const sched = schedInfo[0]; // notify_testers only ever deals with one row

    // Authorize every row: an SP-owned event, the SP's own org, or a linked association.
    const orgIdsNeedingLink = [...new Set(
      schedInfo.filter(s => s.service_provider_id !== sp_id && s.organization_id !== sp_id).map(s => s.organization_id)
    )];
    if (orgIdsNeedingLink.length) {
      const linked = await sql`
        SELECT association_id FROM sp_association_links
        WHERE service_provider_id = ${sp_id} AND association_id = ANY(${orgIdsNeedingLink})
      `;
      const linkedIds = new Set(linked.map(l => l.association_id));
      if (orgIdsNeedingLink.some(id => !linkedIds.has(id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Tester spot-fill: notify ONLY this SP's testers (never evaluators or the
    // association) who aren't already signed up for this testing session.
    if (action === "notify_testers") {
      const testers = await sql`
        SELECT DISTINCT u.email, u.name
        FROM evaluator_memberships em
        JOIN users u ON u.id = em.user_id
        WHERE em.organization_id = ${sp_id} AND em.status = 'active' AND em.is_tester = true
          AND u.id NOT IN (SELECT user_id FROM tester_session_signups WHERE schedule_id = ${schedule_id} AND status = 'signed_up')
      `;
      const sessionDate = fmtBlastDate(sched.scheduled_date);
      const signupUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com"}/evaluator/dashboard`;
      let sent = 0;
      if (process.env.RESEND_API_KEY) {
        await ensureEmailLogTable();
        for (const t of testers) {
          const res = await sendEmail(t.email, `Tester needed — ${sched.org_name} ${sessionDate}`,
            `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <h2 style="color:#111;">A testing spot needs filling</h2>
              ${message ? `<p style="color:#555;">${esc(message)}</p>` : ""}
              <div style="background:#f9f9f9;border-radius:12px;padding:20px;margin:20px 0;">
                <p style="margin:0 0 8px;font-weight:600;font-size:16px;">${esc(sched.org_name)} · ${esc(sched.category_name)}</p>
                <p style="margin:0 0 4px;color:#555;">Testing · Session ${esc(sched.session_number)}${sched.group_number ? ` · Group ${esc(sched.group_number)}` : ""}</p>
                <p style="margin:0 0 4px;color:#555;">${sessionDate}</p>
                <p style="margin:0;color:#555;">${esc(sched.location) || ""}</p>
              </div>
              <a href="${signupUrl}" style="display:inline-block;padding:14px 28px;background:#0b5cd6;color:white;text-decoration:none;border-radius:10px;font-weight:600;">Sign Up to Test →</a>
              <p style="color:#aaa;font-size:12px;margin-top:32px;">Sideline Star · ${esc(admin_name)}</p>
            </div>`);
          await logEmailSend({
            catId: sched.age_category_id || null, orgId: sp_id, emailType: "tester_spot_fill", sessionNumber: sched.session_number, groupNumber: sched.group_number, athleteName: t.name, to: t.email,
            resendId: res?.id || null, status: res?.ok ? "sent" : "failed",
            error: res?.ok ? null : (res?.error || "send failed").toString().slice(0, 500),
          });
          if (res?.ok) sent++;
          // Pace under Resend's 10 req/sec cap for a large tester pool.
          await sleep(110);
        }
      }
      await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value)
        SELECT id, 'blast_testers', 'evaluation_schedule', ${schedule_id}, ${JSON.stringify({ sent, total_pool: testers.length })}
        FROM users WHERE email = ${session.email}`;
      return NextResponse.json({ success: true, sent, total_pool: testers.length,
        message: process.env.RESEND_API_KEY ? `Notified ${sent} tester${sent === 1 ? "" : "s"}` : `Would notify ${testers.length} testers (configure RESEND_API_KEY to send)` });
    }

    // Per-row signup counts, so each listed session shows its own real "how
    // many more" -- and so an evaluator already committed to every session in
    // the block (nothing left for them to grab here) isn't re-pestered, while
    // one who's only picked up some of them still hears about the rest.
    const signups = await sql`
      SELECT schedule_id, user_id FROM evaluator_session_signups
      WHERE schedule_id = ANY(${ids}) AND status = 'signed_up'
    `;
    const signedUpCountByRow = {};
    const signupCountByUser = {};
    for (const s of signups) {
      signedUpCountByRow[s.schedule_id] = (signedUpCountByRow[s.schedule_id] || 0) + 1;
      signupCountByUser[s.user_id] = (signupCountByUser[s.user_id] || 0) + 1;
    }
    const fullyCommittedUserIds = Object.entries(signupCountByUser)
      .filter(([, count]) => count >= ids.length)
      .map(([userId]) => parseInt(userId));

    // Get all evaluators in SP pool who aren't already signed up to every
    // session in the block. Filtered on the membership's own is_evaluator
    // flag, not u.role -- an SP admin who also actively evaluates
    // (is_evaluator=true on their membership) was silently excluded from
    // urgent spot-fill blasts under the old u.role check, same anti-pattern
    // already fixed in the evaluator-pool broadcast.
    const availableEvaluators = await sql`
      SELECT DISTINCT u.email, u.name
      FROM evaluator_memberships em
      JOIN users u ON u.id = em.user_id
      WHERE em.organization_id = ${sp_id}
        AND em.status = 'active'
        AND em.is_evaluator = true
        AND u.id <> ALL(${fullyCommittedUserIds})
        AND u.id NOT IN (
          SELECT evaluator_id FROM evaluator_flags
          WHERE flag_type = 'late_cancel'
          AND (SELECT COUNT(*) FROM evaluator_flags ef2 WHERE ef2.evaluator_id = u.id AND ef2.flag_type = 'late_cancel') >= 2
        )
    `;

    const signupUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com"}/evaluator/dashboard`;
    const isMulti = schedInfo.length > 1;
    const subject = isMulti
      ? `🚨 Urgent: ${schedInfo.length} Evaluator Spots Open — ${sched.org_name}`
      : `🚨 Urgent: Evaluator needed — ${sched.org_name} ${fmtBlastDate(sched.scheduled_date)}`;
    // Sorted by start time so a back-to-back block reads top-to-bottom the way
    // it runs on the ice, not in whatever order the ids happened to come in.
    const sortedRows = [...schedInfo].sort((a, b) =>
      String(a.scheduled_date).localeCompare(String(b.scheduled_date)) || String(a.start_time || "").localeCompare(String(b.start_time || "")));
    const rowsHtml = sortedRows.map(s => {
      const open = Math.max(0, parseInt(s.evaluators_required || 0) - (signedUpCountByRow[s.id] || 0));
      return `
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin-bottom:10px;">
          <div style="font-size:14px;font-weight:700;color:#111;">${esc(fmtBlastDate(s.scheduled_date))} · ${esc(fmtBlastTime(s.start_time))}</div>
          <div style="font-size:13px;color:#555;margin-top:3px;">${esc(s.org_name)} · ${esc(s.category_name)} · Session ${esc(s.session_number)}${s.group_number ? ` · Group ${esc(s.group_number)}` : ""}</div>
          <div style="font-size:13px;color:#555;">${esc(s.location) || ""}</div>
          <div style="font-size:13px;color:#b45309;font-weight:600;margin-top:4px;">${open} spot${open === 1 ? "" : "s"} still needed</div>
        </div>`;
    }).join("");

    let sent = 0;
    if (process.env.RESEND_API_KEY) {
      await ensureEmailLogTable();
      for (const evaluator of availableEvaluators) {
        const res = await sendEmail(evaluator.email, subject,
          `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <div style="background: #FFF3CD; border: 1px solid #FFD700; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                <strong style="color: #856404;">⚡ Urgent Opening${isMulti ? "s" : ""}</strong>
              </div>
              <h2 style="color: #111;">${isMulti ? `${schedInfo.length} evaluator spots available, back to back` : "Evaluator spot available"}</h2>
              ${message ? `<p style="color: #555;">${esc(message)}</p>` : ""}
              ${rowsHtml}
              <a href="${signupUrl}" style="display: inline-block; padding: 14px 28px; background: #0b5cd6; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px;">
                Sign Up Now →
              </a>
              <p style="color: #aaa; font-size: 12px; margin-top: 32px;">Sideline Star · ${esc(admin_name)}</p>
            </div>
          `);
        await logEmailSend({
          catId: sched.age_category_id || null, orgId: sp_id, emailType: "evaluator_spot_fill",
          sessionNumber: isMulti ? null : sched.session_number, groupNumber: isMulti ? null : sched.group_number,
          athleteName: evaluator.name, to: evaluator.email,
          resendId: res?.id || null, status: res?.ok ? "sent" : "failed",
          error: res?.ok ? null : (res?.error || "send failed").toString().slice(0, 500),
        });
        if (res?.ok) sent++;
        // Pace under Resend's 10 req/sec cap for a large evaluator pool.
        await sleep(110);
      }
    }

    // Audit log
    await sql`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value)
      SELECT id, 'blast_notification', 'evaluation_schedule', ${ids[0]},
        ${JSON.stringify({ schedule_ids: ids, sent, total_pool: availableEvaluators.length, message })}
      FROM users WHERE email = ${session.email}
    `;

    return NextResponse.json({
      success: true,
      sent,
      total_pool: availableEvaluators.length,
      message: process.env.RESEND_API_KEY
        ? `Blast sent to ${sent} evaluators`
        : `Would notify ${availableEvaluators.length} evaluators (configure RESEND_API_KEY to send emails)`,
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
