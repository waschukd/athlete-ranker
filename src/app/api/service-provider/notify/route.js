import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { action, schedule_id, message } = body;

    // Handle evaluator email invite
    if (action === "invite_evaluator") {
      const { email, signup_url, sp_name } = body;
      if (!email || !signup_url) return NextResponse.json({ error: "Email and signup URL required" }, { status: 400 });

      if (process.env.RESEND_API_KEY) {
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
              <a href="${signup_url}" style="display: inline-block; padding: 14px 28px; background: #1A6BFF; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; margin: 20px 0;">
                Accept Invitation →
              </a>
              <p style="color: #aaa; font-size: 12px; margin-top: 32px;">Sideline Star · Athlete Evaluation Platform</p>
            </div>`,
          }),
        });
      }

      return NextResponse.json({ success: true, message: process.env.RESEND_API_KEY ? `Invite sent to ${email}` : `No email sent — configure RESEND_API_KEY. Share this link manually: ${signup_url}` });
    }

    // Get SP id
    const spMembership = await sql`
      SELECT em.organization_id as sp_id, u.id as admin_id, u.name as admin_name
      FROM evaluator_memberships em
      JOIN organizations o ON o.id = em.organization_id
      JOIN users u ON u.email = ${session.email}
      WHERE u.email = ${session.email} AND em.status = 'active' AND o.type = 'service_provider'
      LIMIT 1
    `;
    if (!spMembership.length) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const { sp_id, admin_name } = spMembership[0];

    // Get session details
    const schedInfo = await sql`
      SELECT es.*, ac.name as category_name, o.name as org_name
      FROM evaluation_schedule es
      JOIN age_categories ac ON ac.id = es.age_category_id
      JOIN organizations o ON o.id = ac.organization_id
      WHERE es.id = ${schedule_id}
    `;
    if (!schedule_id) return NextResponse.json({ error: "Session not found" }, { status: 400 });

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
                <a href="${signupUrl}" style="display: inline-block; padding: 14px 28px; background: #1A6BFF; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px;">
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
