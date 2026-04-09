import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { emailWeeklyStaffingReport, emailDailyStaffingAlert, sendEmail } from "@/lib/email";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET;

async function getSessionStaffing(orgId, daysAhead) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);

  const sessions = await sql`
    SELECT 
      es.id, es.session_number, es.group_number, es.scheduled_date,
      es.start_time, es.end_time,
      ac.name as category_name, ac.evaluators_required,
      o.name as org_name, o.id as org_id,
      COUNT(DISTINCT ess.user_id) FILTER (WHERE ess.status = 'signed_up') as signed_up,
      JSON_AGG(DISTINCT jsonb_build_object('name', u.name)) 
        FILTER (WHERE ess.user_id IS NOT NULL AND ess.status = 'signed_up') as evaluators
    FROM evaluation_schedule es
    JOIN age_categories ac ON ac.id = es.age_category_id
    JOIN organizations o ON o.id = ac.organization_id
    LEFT JOIN evaluator_session_signups ess ON ess.schedule_id = es.id
    LEFT JOIN users u ON u.id = ess.user_id
    WHERE es.scheduled_date >= CURRENT_DATE
      AND es.scheduled_date <= ${cutoff.toISOString().split("T")[0]}
    GROUP BY es.id, ac.name, ac.evaluators_required, o.name, o.id
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
  // Verify cron secret via Authorization header (Vercel sends this automatically)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const job = searchParams.get("job"); // weekly_report | daily_alert

  try {
    // Get all SP and association admins
    const admins = await sql`
      SELECT DISTINCT u.email, u.name, o.id as organization_id, o.name as org_name, o.type
      FROM users u
      JOIN organizations o ON o.contact_email = u.email
      WHERE u.email IS NOT NULL
    `;

    let sent = 0;

    for (const admin of admins) {
      const sessions = await getSessionStaffing(admin.organization_id, job === "weekly_report" ? 7 : 2);

    if (job === "weekly_report") {
        await emailWeeklyStaffingReport({
          adminEmail: admin.email,
          adminName: admin.name,
          orgName: admin.org_name,
          sessions,
        });
        sent++;
      }

      // Also send weekly schedule to evaluators signed up for sessions this week
      if (job === "weekly_report") {
        const evalSignups = await sql`
          SELECT DISTINCT u.email, u.name,
            es.scheduled_date, es.start_time, es.end_time, es.location,
            es.session_number, es.group_number,
            ac.name as category_name, o.name as org_name
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
          if (!byEval[row.email]) byEval[row.email] = { name: row.name, sessions: [] };
          byEval[row.email].sessions.push(row);
        }

        for (const [email, data] of Object.entries(byEval)) {
          const sessionRows = data.sessions.map(s => {
            const date = s.scheduled_date?.toString().split("T")[0];
            const time = s.start_time ? `${s.start_time}${s.end_time ? ` – ${s.end_time}` : ""}` : "TBD";
            return `<tr style="border-bottom:1px solid #f3f4f6;">
              <td style="padding:10px 0;font-size:13px;color:#111827;font-weight:600;">${date}</td>
              <td style="padding:10px 0;font-size:13px;color:#6b7280;">${time}</td>
              <td style="padding:10px 0;font-size:13px;color:#6b7280;">${s.org_name} · ${s.category_name}</td>
              <td style="padding:10px 0;font-size:13px;color:#6b7280;">S${s.session_number} G${s.group_number}</td>
              <td style="padding:10px 0;font-size:13px;color:#6b7280;">${s.location || "TBD"}</td>
            </tr>`;
          }).join("");

          const html = emailWrapper(`
            <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Your Sessions This Week</h2>
            <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">Hi <strong style="color:#111827;">${data.name}</strong>, here are your upcoming evaluation sessions for the week.</p>
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
              <a href="${BASE_URL}/evaluator/dashboard" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#1A6BFF,#4D8FFF);color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">View My Dashboard →</a>
            </div>
            <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">If you can no longer attend a session, cancel at least 24 hours in advance to avoid a strike.</p>
          `);
          await sendEmail(email, `📅 Your Evaluation Schedule — Week of ${data.sessions[0]?.scheduled_date?.toString().split("T")[0]}`, html);
          sent++;
        }
      }

      if (job === "daily_alert") {
        const openSessions = sessions.filter(s => s.signed_up < s.required);
        if (openSessions.length) {
          await emailDailyStaffingAlert({
            adminEmail: admin.email,
            adminName: admin.name,
            orgName: admin.org_name,
            openSessions,
          });
          sent++;
        }
      }
    }

    return NextResponse.json({ success: true, job, emails_sent: sent });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
