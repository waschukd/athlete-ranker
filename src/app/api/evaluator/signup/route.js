import { NextResponse } from "next/server";
import { emailStrike1, emailStrike2Suspended, emailLateCancel48hr } from "@/lib/email";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

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
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "noreply@athleteranker.com", to, subject, html }),
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

    const icalData = generateICal(info);
    return NextResponse.json({ success: true, message: "Signed up successfully", ical: icalData });

  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function generateICal(session) {
  const date = session.scheduled_date?.toString().split("T")[0].replace(/-/g, "");
  const startTime = session.start_time?.toString().replace(/:/g, "").substring(0, 4) + "00";
  const endTime = session.end_time?.toString().replace(/:/g, "").substring(0, 4) + "00";
  return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//AthleteRanker//EN\nBEGIN:VEVENT\nDTSTART:${date}T${startTime}\nDTEND:${date}T${endTime}\nSUMMARY:Evaluation Session ${session.session_number} - Group ${session.group_number || ""}\nLOCATION:${session.location || "TBD"}\nDESCRIPTION:Hockey evaluation session. Session #${session.session_number}, Group ${session.group_number || "TBD"}.\nEND:VEVENT\nEND:VCALENDAR`.trim();
}
