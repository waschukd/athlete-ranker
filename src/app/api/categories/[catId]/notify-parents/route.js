import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { sendEmail, emailWrapper, parentOnboardingHtml, parentScheduleHtml, parentSessionUpdateHtml, parentEmails, esc, FROM } from "@/lib/email";

const cap = (s) => (s || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
function fmtDayDate(date) {
  if (!date) return "";
  const s = date.toString().split("T")[0];
  const [y, m, d] = s.split("-").map(Number);
  if (!y) return s;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function fmt12(t) {
  if (!t) return "";
  const [h, m] = t.toString().split(":");
  const hr = parseInt(h);
  return `${hr % 12 === 0 ? 12 : hr % 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}
const fmtRange = (a, b) => { const A = fmt12(a), B = fmt12(b); return A && B ? `${A} – ${B}` : (A || ""); };
import { generateICS } from "@/lib/calendar";
import { getEmailTemplate, renderTemplate } from "@/lib/emailTemplates";

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
      SELECT ac.name as category_name, ac.organization_id, o.name as org_name
      FROM age_categories ac
      JOIN organizations o ON o.id = ac.organization_id
      WHERE ac.id = ${catId}
    `;
    if (!catInfo.length) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    const { category_name, org_name, organization_id } = catInfo[0];

    // Get all athletes with parent emails
    const athletes = await sql`
      SELECT id, first_name, last_name, parent_email, parent_email_2
      FROM athletes
      WHERE age_category_id = ${catId} AND is_active = true
        AND ((parent_email IS NOT NULL AND parent_email != '') OR (parent_email_2 IS NOT NULL AND parent_email_2 != ''))
    `;

    if (!athletes.length) {
      return NextResponse.json({ success: true, sent: 0, skipped: 0, message: "No athletes with parent emails found" });
    }

    // ── Onboarding Email ──────────────────────────────────
    if (action === "onboarding") {
      // Association may override the welcome copy (subject + body with merge fields).
      const override = await getEmailTemplate(organization_id, "welcome");
      let sent = 0;
      for (const a of athletes) {
        try {
          const playerName = `${a.first_name} ${a.last_name}`;
          let subject = `Welcome to ${category_name} Evaluations — ${org_name}`;
          let html;
          if (override && (override.body_html || override.subject)) {
            const vars = { player_name: a.first_name, org_name, category_name, sp_name: org_name };
            if (override.subject) subject = renderTemplate(override.subject, vars);
            // Escape the rendered (admin-authored + merged) text so it can't inject
            // markup/links, then re-apply our own paragraph + line-break formatting.
            const bodyHtml = esc(renderTemplate(override.body_html || "", vars))
              .split(/\n\s*\n/).map(p => `<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">${p.replace(/\n/g, "<br/>")}</p>`).join("");
            html = emailWrapper(`<h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111827;">Welcome</h2>${bodyHtml}`);
          } else {
            html = parentOnboardingHtml({ playerName, categoryName: category_name, orgName: org_name });
          }
          for (const to of parentEmails(a)) await sendEmail(to, subject, html);
          sent++;
        } catch (e) {
          console.error("Failed to send onboarding to athlete " + a.id + ":", e?.message || e);
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

          // Send with .ics attachment — one per household (both parent emails).
          if (process.env.RESEND_API_KEY) {
            for (const to of parentEmails(athlete)) {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                },
                body: JSON.stringify({
                  from: FROM,
                  to,
                  subject: `Evaluation Schedule — ${athlete.first_name} ${athlete.last_name} · ${category_name}`,
                  html,
                  attachments: [{
                    filename: "evaluation-schedule.ics",
                    content: Buffer.from(icsContent).toString("base64"),
                  }],
                }),
              });
            }
            sent++;
          }
        } catch (e) {
          console.error("Failed to send schedule to athlete " + athlete.id + ":", e?.message || e);
          skipped++;
        }
      }

      return NextResponse.json({ success: true, sent, skipped, total: athletes.length });
    }

    // ── "Next session" update — manually triggered by a director/association
    // AFTER groups are formed for a session. Each athlete in that session's groups
    // gets their group's date/time/location. Never auto-sends.
    if (action === "session_update") {
      const sNum = parseInt(session_number);
      if (!sNum) return NextResponse.json({ error: "session_number required" }, { status: 400 });

      const rows = await sql`
        SELECT a.id, a.first_name, a.last_name, a.parent_email, a.parent_email_2,
          sg.session_number, sg.group_number,
          es.scheduled_date, es.start_time, es.end_time, es.location,
          cs.name AS session_name, cs.session_type
        FROM player_group_assignments pga
        JOIN session_groups sg ON sg.id = pga.session_group_id
        JOIN athletes a ON a.id = pga.athlete_id AND a.is_active = true
        LEFT JOIN evaluation_schedule es ON es.age_category_id = ${catId} AND es.session_number = sg.session_number AND es.group_number = sg.group_number
        LEFT JOIN category_sessions cs ON cs.age_category_id = ${catId} AND cs.session_number = sg.session_number
        WHERE sg.age_category_id = ${catId} AND sg.session_number = ${sNum}
      `;
      if (!rows.length) return NextResponse.json({ error: "No athletes are in groups for this session yet. Form groups first." }, { status: 400 });

      // Label for the just-completed session (the one before this one).
      let completedLabel = "Registration";
      if (sNum > 1) {
        const prev = await sql`SELECT name FROM category_sessions WHERE age_category_id = ${catId} AND session_number = ${sNum - 1} LIMIT 1`;
        completedLabel = prev[0]?.name || `Session ${sNum - 1}`;
      }

      let sent = 0, skipped = 0;
      for (const r of rows) {
        const recipients = parentEmails(r);
        if (!recipients.length) { skipped++; continue; }
        const sessName = r.session_name || `Session ${sNum}`;
        const next = {
          label: `${sessName}${r.session_type ? ` · ${cap(r.session_type)}` : ""}`,
          dateText: fmtDayDate(r.scheduled_date),
          time: fmtRange(r.start_time, r.end_time),
          location: r.location || "",
        };
        const html = parentSessionUpdateHtml({ playerName: `${r.first_name} ${r.last_name}`, orgName: org_name, completedLabel, next });
        const subject = `${org_name}: ${completedLabel} complete — your ${sessName} details`;
        try { for (const to of recipients) await sendEmail(to, subject, html); sent++; }
        catch (e) { console.error("session_update send failed for athlete " + r.id, e?.message || e); skipped++; }
      }
      return NextResponse.json({ success: true, sent, skipped, total: rows.length });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Notify parents error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
