import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { sendEmail, parentOnboardingHtml, parentScheduleHtml } from "@/lib/email";
import { generateICS } from "@/lib/calendar";

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { action, session_number } = await request.json();

    // Get category + org info
    const catInfo = await sql`
      SELECT ac.name as category_name, o.name as org_name
      FROM age_categories ac
      JOIN organizations o ON o.id = ac.organization_id
      WHERE ac.id = ${catId}
    `;
    if (!catInfo.length) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    const { category_name, org_name } = catInfo[0];

    // Get all athletes with parent emails
    const athletes = await sql`
      SELECT id, first_name, last_name, parent_email
      FROM athletes
      WHERE age_category_id = ${catId} AND is_active = true AND parent_email IS NOT NULL AND parent_email != ''
    `;

    if (!athletes.length) {
      return NextResponse.json({ success: true, sent: 0, skipped: 0, message: "No athletes with parent emails found" });
    }

    // ── Onboarding Email ──────────────────────────────────
    if (action === "onboarding") {
      let sent = 0;
      for (const a of athletes) {
        try {
          const html = parentOnboardingHtml({
            playerName: `${a.first_name} ${a.last_name}`,
            categoryName: category_name,
            orgName: org_name,
          });
          await sendEmail(a.parent_email, `Welcome to ${category_name} Evaluations — ${org_name}`, html);
          sent++;
        } catch (e) {
          console.error(`Failed to send onboarding to ${a.parent_email}:`, e);
        }
      }
      return NextResponse.json({ success: true, sent, total: athletes.length });
    }

    // ── Schedule Push ─────────────────────────────────────
    if (action === "schedule") {
      // Get group assignments + schedule for each athlete
      const assignments = await sql`
        SELECT
          pga.athlete_id,
          sg.session_number, sg.group_number,
          es.scheduled_date, es.start_time, es.end_time, es.location
        FROM player_group_assignments pga
        JOIN session_groups sg ON sg.id = pga.session_group_id
        LEFT JOIN evaluation_schedule es ON es.age_category_id = ${catId}
          AND es.session_number = sg.session_number
          AND es.group_number = sg.group_number
        WHERE sg.age_category_id = ${catId}
        ${session_number ? sql`AND sg.session_number = ${session_number}` : sql``}
        ORDER BY sg.session_number, sg.group_number
      `;

      // Group assignments by athlete
      const byAthlete = {};
      for (const a of assignments) {
        if (!byAthlete[a.athlete_id]) byAthlete[a.athlete_id] = [];
        byAthlete[a.athlete_id].push({
          session_number: a.session_number,
          group_number: a.group_number,
          date: a.scheduled_date?.toString().split("T")[0] || null,
          time: a.start_time ? `${a.start_time}${a.end_time ? ` – ${a.end_time}` : ""}` : null,
          location: a.location,
          scheduled_date: a.scheduled_date,
          start_time: a.start_time,
          end_time: a.end_time,
        });
      }

      let sent = 0;
      let skipped = 0;

      for (const athlete of athletes) {
        const sessions = byAthlete[athlete.id];
        if (!sessions || !sessions.length) { skipped++; continue; }

        try {
          const html = parentScheduleHtml({
            playerName: `${athlete.first_name} ${athlete.last_name}`,
            categoryName: category_name,
            orgName: org_name,
            sessions,
          });

          // Generate .ics for their sessions
          const icsContent = generateICS(sessions.filter(s => s.scheduled_date).map(s => ({
            ...s,
            category_name,
            org_name,
          })));

          // Send with .ics attachment
          if (process.env.RESEND_API_KEY) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              },
              body: JSON.stringify({
                from: process.env.EMAIL_FROM || "updates@sidelinestar.com",
                to: athlete.parent_email,
                subject: `Evaluation Schedule — ${athlete.first_name} ${athlete.last_name} · ${category_name}`,
                html,
                attachments: [{
                  filename: "evaluation-schedule.ics",
                  content: Buffer.from(icsContent).toString("base64"),
                }],
              }),
            });
            sent++;
          }
        } catch (e) {
          console.error(`Failed to send schedule to ${athlete.parent_email}:`, e);
          skipped++;
        }
      }

      return NextResponse.json({ success: true, sent, skipped, total: athletes.length });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Notify parents error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
