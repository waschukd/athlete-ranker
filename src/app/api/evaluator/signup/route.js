import { NextResponse } from "next/server";
import { emailStrike1, emailStrike2Suspended, emailLateCancel48hr } from "@/lib/email";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateICS } from "@/lib/calendar";

async function getAppUserId(session) {
  if (!session?.email) return null;
  const user = await sql`SELECT id FROM users WHERE email = ${session.email}`;
  return user[0]?.id || null;
}

async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "noreply@sidelinestar.com", to, subject, html }),
  });
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const appUserId = await getAppUserId(session);
    if (!appUserId) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { schedule_id, action } = await request.json();

    if (action === "cancel") {
      // Get session info
      const schedInfo = await sql`
        SELECT es.*, es.scheduled_date, es.start_time, es.session_number, es.group_number,
          ac.name as category_name, ac.organization_id,
          o.name as org_name
        FROM evaluation_schedule es
        JOIN age_categories ac ON ac.id = es.age_category_id
        JOIN organizations o ON o.id = ac.organization_id
        WHERE es.id = ${schedule_id}
      `;

      if (!schedInfo.length) return NextResponse.json({ error: "Session not found" }, { status: 404 });
      const sched = schedInfo[0];

      // Check if < 24 hours before session
      const sessionDateTime = new Date(`${sched.scheduled_date?.toString().split("T")[0]}T${sched.start_time || "00:00"}`);
      const hoursUntil = (sessionDateTime - new Date()) / (1000 * 60 * 60);
      const isLateCancel = hoursUntil < 24 && hoursUntil > 0;
      const alreadyPast = hoursUntil <= 0;

      // Cancel the signup
      await sql`
        UPDATE evaluator_session_signups SET status = 'cancelled'
        WHERE user_id = ${appUserId} AND schedule_id = ${schedule_id}
      `;

      // Get evaluator info
      const evalUser = await sql`SELECT name, email FROM users WHERE id = ${appUserId}`;
      const evalName = evalUser[0]?.name;
      const evalEmail = evalUser[0]?.email;

      // Get SP admin for this org (via sp_association_links or direct membership)
      const spAdmins = await sql`
        SELECT DISTINCT u.email, u.name
        FROM evaluator_memberships em
        JOIN users u ON u.id = em.user_id
        JOIN organizations o ON o.id = em.organization_id
        WHERE em.organization_id IN (
          SELECT service_provider_id FROM sp_association_links WHERE association_id = ${sched.organization_id}
          UNION
          SELECT organization_id FROM evaluator_memberships WHERE user_id = ${appUserId}
        )
        AND u.role IN ('service_provider_admin', 'association_admin')
        AND em.status = 'active'
      `;

      if (isLateCancel) {
        // Check existing strikes
        const strikes = await sql`
          SELECT COUNT(*) as count FROM evaluator_flags
          WHERE evaluator_id = ${appUserId} AND flag_type = 'late_cancel'
        `;
        const strikeCount = parseInt(strikes[0].count);
        const newStrikeCount = strikeCount + 1;

        // Log the strike
        await sql`
          INSERT INTO evaluator_flags (evaluator_id, organization_id, schedule_id, flag_type, severity, details)
          VALUES (
            ${appUserId},
            ${sched.organization_id},
            ${schedule_id},
            'late_cancel',
            ${newStrikeCount >= 2 ? 'critical' : 'warning'},
            ${JSON.stringify({ hours_until: hoursUntil.toFixed(1), session: `S${sched.session_number} G${sched.group_number}`, org: sched.org_name, strike_number: newStrikeCount })}
          )
        `;

        // Strike 2 — suspend from future sessions
        if (newStrikeCount >= 2) {
          // Remove from all future unsigned sessions
          await sql`
            UPDATE evaluator_session_signups SET status = 'suspended'
            WHERE user_id = ${appUserId}
              AND status = 'signed_up'
              AND schedule_id IN (
                SELECT id FROM evaluation_schedule WHERE scheduled_date > CURRENT_DATE
              )
          `;

          // Notify evaluator — suspended
          await sendEmail(evalEmail, "⚠ Your evaluator account has been suspended",
            `<p>Hi ${evalName},</p>
            <p>You have cancelled a session with less than 24 hours notice for the second time. Your account has been suspended and you have been removed from all future sessions.</p>
            <p>Please contact your service provider if you believe this is an error.</p>`
          );

          // Notify SP admins
          for (const admin of spAdmins) {
            await sendEmail(admin.email, `🚨 Evaluator Suspended: ${evalName}`,
              `<p>${evalName} has received their second late cancellation strike and has been automatically suspended from all future sessions.</p>
              <p>Session cancelled: ${sched.org_name} · S${sched.session_number} G${sched.group_number}</p>
              <p>Log in to reinstate them if needed.</p>`
            );
          }
        } else {
          // Strike 1 warning
          await sendEmail(evalEmail, "⚠ Late Cancellation Warning — Strike 1",
            `<p>Hi ${evalName},</p>
            <p>You have cancelled your session at <strong>${sched.org_name}</strong> (Session ${sched.session_number}, Group ${sched.group_number}) with less than 24 hours notice.</p>
            <p><strong>This is Strike 1.</strong> A second late cancellation will result in automatic suspension from all future sessions.</p>`
          );

          // Notify SP admins
          for (const admin of spAdmins) {
            await sendEmail(admin.email, `⚠ Late Cancellation: ${evalName} (Strike 1)`,
              `<p>${evalName} cancelled with ${parseFloat(hoursUntil).toFixed(1)} hours notice for ${sched.org_name} S${sched.session_number} G${sched.group_number}.</p>
              <p>This is their first strike. One open spot now needs to be filled.</p>`
            );
          }
        }
      } else {
        // Normal cancellation — just notify SP
        for (const admin of spAdmins) {
          await sendEmail(admin.email, `Evaluator Cancelled: ${evalName}`,
            `<p>${evalName} has cancelled their signup for ${sched.org_name} · ${sched.category_name} S${sched.session_number} G${sched.group_number}.</p>
            <p>Session date: ${sched.scheduled_date?.toString().split("T")[0]}</p>`
          );
        }
      }

      // Audit log
      await sql`
        INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value)
        VALUES (${appUserId}, ${isLateCancel ? 'late_cancel' : 'cancel'}, 'evaluation_schedule', ${schedule_id}, 
          ${JSON.stringify({ hours_until: hoursUntil?.toFixed(1), late: isLateCancel })})
      `;

      return NextResponse.json({
        success: true,
        warning: isLateCancel ? `Late cancellation recorded. ${parseInt((await sql`SELECT COUNT(*) as c FROM evaluator_flags WHERE evaluator_id = ${appUserId} AND flag_type = 'late_cancel'`)[0].c) >= 2 ? 'You have been suspended.' : 'This is Strike 1.'}` : null
      });
    }

    // SIGN UP
    const scheduleInfo = await sql`
      SELECT sch.*,
        COALESCE(cs.evaluators_required, ac.evaluators_required, 4) as evaluators_required,
        COUNT(DISTINCT ess.id) as signed_up_count
      FROM evaluation_schedule sch
      JOIN age_categories ac ON ac.id = sch.age_category_id
      LEFT JOIN category_sessions cs ON cs.age_category_id = ac.id AND cs.session_number = sch.session_number
      LEFT JOIN evaluator_session_signups ess ON ess.schedule_id = sch.id AND ess.status != 'cancelled'
      WHERE sch.id = ${schedule_id}
      GROUP BY sch.id, cs.evaluators_required, ac.evaluators_required
    `;

    if (!scheduleInfo.length) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const info = scheduleInfo[0];

    if (parseInt(info.signed_up_count) >= parseInt(info.evaluators_required)) {
      return NextResponse.json({ error: "No spots available" }, { status: 400 });
    }

    await sql`
      INSERT INTO evaluator_session_signups (user_id, schedule_id, status, notified_at)
      VALUES (${appUserId}, ${schedule_id}, 'signed_up', NOW())
      ON CONFLICT (user_id, schedule_id) DO UPDATE SET status = 'signed_up', notified_at = NOW()
    `;

    await sql`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value)
      VALUES (${appUserId}, 'evaluator_signup', 'evaluation_schedule', ${schedule_id}, 'signed_up')
    `;

    // Get category + org info for the calendar event
    const catInfo = await sql`
      SELECT ac.name as category_name, o.name as org_name
      FROM age_categories ac
      JOIN organizations o ON o.id = ac.organization_id
      WHERE ac.id = ${info.age_category_id}
    `;

    const icalData = generateICS({
      ...info,
      category_name: catInfo[0]?.category_name || "Evaluation",
      org_name: catInfo[0]?.org_name || "",
    });

    // Send confirmation email with .ics attachment
    const evalUser = await sql`SELECT name, email FROM users WHERE id = ${appUserId}`;
    if (evalUser.length && process.env.RESEND_API_KEY) {
      const sessionDate = info.scheduled_date?.toString().split("T")[0];
      const timeStr = info.start_time ? `${info.start_time}${info.end_time ? ` - ${info.end_time}` : ""}` : "TBD";
      const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "updates@sidelinestar.com",
          to: evalUser[0].email,
          subject: `Session Confirmed — ${catInfo[0]?.category_name || "Evaluation"} S${info.session_number}`,
          html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;">
            <div style="background:linear-gradient(135deg,#1A6BFF,#4D8FFF);padding:28px 40px;text-align:center;border-radius:16px 16px 0 0;">
              <div style="font-size:22px;font-weight:800;color:#ffffff;">Sideline Star</div>
            </div>
            <div style="background:#ffffff;padding:36px 40px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;">
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">You're signed up!</h2>
              <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">Hi <strong style="color:#111827;">${evalUser[0].name}</strong>, you're confirmed for the following session.</p>
              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin:20px 0;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;width:100px;">Category</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${catInfo[0]?.category_name || "Evaluation"}</td></tr>
                  <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Date</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${sessionDate}</td></tr>
                  <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Time</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${timeStr}</td></tr>
                  <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Location</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${info.location || "TBD"}</td></tr>
                  <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Session</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">S${info.session_number} G${info.group_number || "1"}</td></tr>
                </table>
              </div>
              <p style="font-size:12px;color:#9ca3af;margin:16px 0 0;">A calendar invite (.ics) is attached. Open it to add this session to your calendar.</p>
              <div style="margin-top:20px;"><a href="${BASE_URL}/evaluator/dashboard" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#1A6BFF,#4D8FFF);color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">View Dashboard</a></div>
            </div>
          </div>`,
          attachments: [{
            filename: "session.ics",
            content: Buffer.from(icalData).toString("base64"),
          }],
        }),
      });
    }

    return NextResponse.json({ success: true, message: "Signed up successfully", ical: icalData });

  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
