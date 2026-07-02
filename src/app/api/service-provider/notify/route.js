import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, resolveSpContext } from "@/lib/auth";

const ADMIN_ROLES = new Set(["super_admin", "service_provider_admin", "association_admin"]);

// Send one tester invite email. Returns true if actually sent (RESEND configured).
async function sendTesterInvite(email, signup_url, sp_name) {
  if (!process.env.RESEND_API_KEY) return false;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "noreply@sidelinestar.com",
      to: email,
      subject: `You've been invited to join the testing crew for ${sp_name || "a hockey organization"}`,
      html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 22px; font-weight: 700; color: #111;">You're invited to be a tester!</h1>
        <p style="color: #555; font-size: 15px;">${sp_name || "A hockey organization"} has invited you to join their testing crew — you'll run the on-ice testing sessions.</p>
        <p style="color: #555; font-size: 15px;">Click below to create your account and start signing up for testing dates.</p>
        <a href="${signup_url}" style="display: inline-block; padding: 14px 28px; background: #0b5cd6; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; margin: 20px 0;">Accept Invitation →</a>
        <p style="color: #aaa; font-size: 12px; margin-top: 32px;">Sideline Star · Athlete Evaluation Platform</p>
      </div>`,
    }),
  });
  return true;
}

// Send one evaluator invite email. Returns true if actually sent (RESEND configured).
async function sendEvaluatorInvite(email, signup_url, sp_name) {
  if (!process.env.RESEND_API_KEY) return false;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "noreply@sidelinestar.com",
      to: email,
      subject: `You've been invited to evaluate for ${sp_name || "a hockey organization"}`,
      html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 22px; font-weight: 700; color: #111;">You're invited to evaluate!</h1>
        <p style="color: #555; font-size: 15px;">${sp_name || "A hockey organization"} has invited you to join their evaluator pool.</p>
        <p style="color: #555; font-size: 15px;">Click below to create your account and start signing up for sessions.</p>
        <a href="${signup_url}" style="display: inline-block; padding: 14px 28px; background: #0b5cd6; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; margin: 20px 0;">Accept Invitation →</a>
        <p style="color: #aaa; font-size: 12px; margin-top: 32px;">Sideline Star · Athlete Evaluation Platform</p>
      </div>`,
    }),
  });
  return true;
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ADMIN_ROLES.has(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { action, schedule_id, message } = body;

    // Evaluator email invite(s) — single (email) or batch (emails[]). Each recipient
    // gets their own email; invalid addresses are skipped and reported.
    if (action === "invite_evaluator" || action === "invite_evaluators") {
      const { signup_url, sp_name } = body;
      if (!signup_url) return NextResponse.json({ error: "Signup URL required" }, { status: 400 });
      const raw = Array.isArray(body.emails) ? body.emails : (body.email ? [body.email] : []);
      const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
      const valid = [...new Set(raw.map(e => String(e).trim().toLowerCase()).filter(e => emailRe.test(e)))];
      const invalid = raw.length - valid.length;
      if (!valid.length) return NextResponse.json({ error: "No valid email addresses" }, { status: 400 });
      let sent = 0;
      for (const email of valid) { if (await sendEvaluatorInvite(email, signup_url, sp_name)) sent++; }
      return NextResponse.json({
        success: true, sent, valid: valid.length, invalid,
        message: process.env.RESEND_API_KEY
          ? `Sent ${sent} invite${sent === 1 ? "" : "s"}${invalid ? `, skipped ${invalid} invalid` : ""}`
          : `No emails sent — configure RESEND_API_KEY. Share this link manually: ${signup_url}`,
      });
    }

    // Tester email invite(s) — single (email) or batch (emails[]). Each recipient
    // gets their own email; invalid addresses are skipped and reported.
    if (action === "invite_tester" || action === "invite_testers") {
      const { signup_url, sp_name } = body;
      if (!signup_url) return NextResponse.json({ error: "Signup URL required" }, { status: 400 });
      const raw = Array.isArray(body.emails) ? body.emails : (body.email ? [body.email] : []);
      const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
      const valid = [...new Set(raw.map(e => String(e).trim().toLowerCase()).filter(e => emailRe.test(e)))];
      const invalid = raw.length - valid.length;
      if (!valid.length) return NextResponse.json({ error: "No valid email addresses" }, { status: 400 });
      let sent = 0;
      for (const email of valid) { if (await sendTesterInvite(email, signup_url, sp_name)) sent++; }
      return NextResponse.json({
        success: true, sent, valid: valid.length, invalid,
        message: process.env.RESEND_API_KEY
          ? `Sent ${sent} invite${sent === 1 ? "" : "s"}${invalid ? `, skipped ${invalid} invalid` : ""}`
          : `No emails sent — configure RESEND_API_KEY. Share this link manually: ${signup_url}`,
      });
    }

    // Resolve SP org (contact_email, additional-admin role, or membership)
    const { orgId: sp_id } = await resolveSpContext(session, new URL(request.url).searchParams.get("org"));
    if (!sp_id) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const admin_name = session.name || session.email;

    if (!schedule_id) return NextResponse.json({ error: "schedule_id required" }, { status: 400 });

    // Get session details + the org the schedule belongs to so we can
    // confirm it's one of this SP's linked associations (or the SP
    // itself) before blasting its details out to the SP's evaluator
    // pool.
    const schedInfo = await sql`
      SELECT es.*, ac.organization_id, ac.name as category_name, o.name as org_name
      FROM evaluation_schedule es
      JOIN age_categories ac ON ac.id = es.age_category_id
      JOIN organizations o ON o.id = ac.organization_id
      WHERE es.id = ${schedule_id}
    `;
    if (!schedInfo.length) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const sched = schedInfo[0];

    if (sched.organization_id !== sp_id) {
      const linked = await sql`
        SELECT 1 FROM sp_association_links
        WHERE service_provider_id = ${sp_id} AND association_id = ${sched.organization_id}
      `;
      if (!linked.length) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Tester spot-fill: notify ONLY this SP's testers (never evaluators or the
    // association) who aren't already signed up for this testing session.
    if (action === "notify_testers") {
      const testers = await sql`
        SELECT DISTINCT u.email, u.name
        FROM evaluator_memberships em
        JOIN users u ON u.id = em.user_id
        WHERE em.organization_id = ${sp_id} AND em.status = 'active' AND em.is_tester = true
          AND u.id NOT IN (SELECT user_id FROM tester_session_signups WHERE schedule_id = ${schedule_id} AND status != 'cancelled')
      `;
      const sessionDate = sched.scheduled_date?.toString().split("T")[0];
      const signupUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/evaluator/dashboard`;
      let sent = 0;
      if (process.env.RESEND_API_KEY) {
        for (const t of testers) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
            body: JSON.stringify({
              from: process.env.EMAIL_FROM || "noreply@sidelinestar.com",
              to: t.email,
              subject: `Tester needed — ${sched.org_name} ${sessionDate}`,
              html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <h2 style="color:#111;">A testing spot needs filling</h2>
                ${message ? `<p style="color:#555;">${message}</p>` : ""}
                <div style="background:#f9f9f9;border-radius:12px;padding:20px;margin:20px 0;">
                  <p style="margin:0 0 8px;font-weight:600;font-size:16px;">${sched.org_name} · ${sched.category_name}</p>
                  <p style="margin:0 0 4px;color:#555;">Testing · Session ${sched.session_number}${sched.group_number ? ` · Group ${sched.group_number}` : ""}</p>
                  <p style="margin:0 0 4px;color:#555;">${sessionDate}</p>
                  <p style="margin:0;color:#555;">${sched.location || ""}</p>
                </div>
                <a href="${signupUrl}" style="display:inline-block;padding:14px 28px;background:#0b5cd6;color:white;text-decoration:none;border-radius:10px;font-weight:600;">Sign Up to Test →</a>
                <p style="color:#aaa;font-size:12px;margin-top:32px;">Sideline Star · ${admin_name}</p>
              </div>`,
            }),
          });
          sent++;
        }
      }
      await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value)
        SELECT id, 'blast_testers', 'evaluation_schedule', ${schedule_id}, ${JSON.stringify({ sent, total_pool: testers.length })}
        FROM users WHERE email = ${session.email}`;
      return NextResponse.json({ success: true, sent, total_pool: testers.length,
        message: process.env.RESEND_API_KEY ? `Notified ${sent} tester${sent === 1 ? "" : "s"}` : `Would notify ${testers.length} testers (configure RESEND_API_KEY to send)` });
    }

    // Get all evaluators in SP pool who aren't already signed up
    const availableEvaluators = await sql`
      SELECT DISTINCT u.email, u.name
      FROM evaluator_memberships em
      JOIN users u ON u.id = em.user_id
      WHERE em.organization_id = ${sp_id}
        AND em.status = 'active'
        AND u.role = 'service_provider_evaluator'
        AND u.id NOT IN (
          SELECT user_id FROM evaluator_session_signups
          WHERE schedule_id = ${schedule_id} AND status != 'cancelled'
        )
        AND u.id NOT IN (
          SELECT evaluator_id FROM evaluator_flags
          WHERE flag_type = 'late_cancel'
          AND (SELECT COUNT(*) FROM evaluator_flags ef2 WHERE ef2.evaluator_id = u.id AND ef2.flag_type = 'late_cancel') >= 2
        )
    `;

    const sessionDate = sched.scheduled_date?.toString().split("T")[0];
    const signupUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/evaluator/dashboard`;

    let sent = 0;
    if (process.env.RESEND_API_KEY) {
      for (const evaluator of availableEvaluators) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || "noreply@sidelinestar.com",
            to: evaluator.email,
            subject: `🚨 Urgent: Evaluator needed — ${sched.org_name} ${sessionDate}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <div style="background: #FFF3CD; border: 1px solid #FFD700; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                  <strong style="color: #856404;">⚡ Urgent Opening</strong>
                </div>
                <h2 style="color: #111;">Evaluator spot available</h2>
                ${message ? `<p style="color: #555;">${message}</p>` : ""}
                <div style="background: #f9f9f9; border-radius: 12px; padding: 20px; margin: 20px 0;">
                  <p style="margin: 0 0 8px; font-weight: 600; font-size: 16px;">${sched.org_name} · ${sched.category_name}</p>
                  <p style="margin: 0 0 4px; color: #555;">Session ${sched.session_number}${sched.group_number ? ` · Group ${sched.group_number}` : ""}</p>
                  <p style="margin: 0 0 4px; color: #555;">${sessionDate}</p>
                  <p style="margin: 0; color: #555;">${sched.location || ""}</p>
                </div>
                <a href="${signupUrl}" style="display: inline-block; padding: 14px 28px; background: #0b5cd6; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px;">
                  Sign Up Now →
                </a>
                <p style="color: #aaa; font-size: 12px; margin-top: 32px;">Sideline Star · ${admin_name}</p>
              </div>
            `,
          }),
        });
        sent++;
      }
    }

    // Audit log
    await sql`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value)
      SELECT id, 'blast_notification', 'evaluation_schedule', ${schedule_id}, 
        ${JSON.stringify({ sent, total_pool: availableEvaluators.length, message })}
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
