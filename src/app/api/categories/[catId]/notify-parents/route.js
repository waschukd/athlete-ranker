import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { sendEmail, emailWrapper, parentOnboardingHtml, parentScheduleHtml, parentEmails, esc, FROM } from "@/lib/email";

import { getEmailTemplate, renderTemplate } from "@/lib/emailTemplates";
import { ensureEmailLogTable, logEmailSend } from "@/lib/emailLog";

// Mass parent communications (onboarding, schedule blasts) are a
// director/admin-level action -- authorizeCategoryAccess alone also admits
// plain evaluators.
const MANAGE_ROLES = new Set(["super_admin", "association_admin", "director", "service_provider_admin", "goalie_service_provider_admin"]);

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!MANAGE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { action, session_number, preview, athlete_id } = await request.json();

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
        ${athlete_id ? sql`AND id = ${athlete_id}` : sql``}
    `;

    if (!athletes.length) {
      return NextResponse.json({ success: true, sent: 0, skipped: 0, message: "No athletes with parent emails found" });
    }

    // ── Onboarding Email ──────────────────────────────────
    if (action === "onboarding") {
      // Association may override the welcome copy (subject + body with merge fields).
      const override = await getEmailTemplate(organization_id, "welcome");

      // Build the exact subject/html one athlete's family would receive --
      // shared by the real send loop below and the preview branch, so
      // "what you're about to send" (before clicking send) and "what
      // actually got sent" can never drift apart.
      function buildOnboardingEmail(a) {
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
        return { subject, html };
      }

      // Preview mode: show exactly what would be sent, using a real athlete
      // if one exists (so merge fields aren't generic placeholders), without
      // sending anything or marking the category as welcomed.
      if (preview) {
        const sample = athletes[0] || { first_name: "Alex", last_name: "Athlete" };
        const { subject, html } = buildOnboardingEmail(sample);
        return NextResponse.json({ success: true, preview: true, subject, html, recipientCount: athletes.length, hasOverride: !!(override && (override.body_html || override.subject)) });
      }

      await ensureEmailLogTable();
      let sent = 0;
      for (const a of athletes) {
        const name = `${a.first_name} ${a.last_name}`;
        try {
          const { subject, html } = buildOnboardingEmail(a);
          for (const to of parentEmails(a)) {
            const res = await sendEmail(to, subject, html);
            if (res.ok) sent++;
            await logEmailSend({
              catId, emailType: "welcome", athleteId: a.id, athleteName: name, to,
              resendId: res.id || null, status: res.ok ? "sent" : "failed",
              error: res.ok ? null : (res.error || "send failed").slice(0, 500),
            });
          }
        } catch (e) {
          console.error("Failed to send onboarding to athlete " + a.id + ":", e?.message || e);
        }
      }
      // Mark the category as welcomed so the first-step flow can advance from
      // "welcome families" to "make groups/teams". Best-effort (pre-migration DBs
      // just no-op). Skipped on a single-family resend -- stamping "now" would
      // make every athlete already on the roster look welcomed, hiding anyone
      // who genuinely never got the batch send.
      if (sent > 0 && !athlete_id) { try { await sql`UPDATE age_categories SET welcome_sent_at = NOW() WHERE id = ${catId}`; } catch { /* column not migrated */ } }
      return NextResponse.json({ success: true, sent, total: athletes.length });
    }

    // ── Evaluation Dates Push ─────────────────────────────
    // Category-level DATES only — not a per-group schedule. Families don't know
    // their group yet, so we send every family the same list of session dates
    // (Groups & time TBD); the exact ice time follows in its own per-session
    // email once groups are set. No .ics here — there's no confirmed time to add.
    if (action === "schedule") {
      const dateRows = await sql`
        SELECT DISTINCT session_number, scheduled_date
        FROM evaluation_schedule
        WHERE age_category_id = ${catId} AND scheduled_date IS NOT NULL
        ${session_number ? sql`AND session_number = ${session_number}` : sql``}
        ORDER BY session_number, scheduled_date
      `;
      const sessions = dateRows.map(r => ({ session_number: r.session_number, date: r.scheduled_date }));

      if (!sessions.length) {
        return NextResponse.json({ success: true, sent: 0, skipped: 0, total: athletes.length, message: "No evaluation dates scheduled yet" });
      }

      await ensureEmailLogTable();
      let sent = 0, skipped = 0;
      for (const athlete of athletes) {
        const name = `${athlete.first_name} ${athlete.last_name}`;
        try {
          const html = parentScheduleHtml({
            playerName: name,
            categoryName: category_name,
            orgName: org_name,
            sessions,
          });
          const recipients = parentEmails(athlete);
          if (!recipients.length) { skipped++; continue; }
          let anyOk = false;
          for (const to of recipients) {
            const res = await sendEmail(to, `Evaluation Dates — ${category_name} (${org_name})`, html);
            await logEmailSend({
              catId, emailType: "evaluation_dates", athleteId: athlete.id, athleteName: name, to,
              resendId: res?.id || null, status: res?.ok ? "sent" : "failed",
              error: res?.ok ? null : (res?.error || "send failed").toString().slice(0, 500),
            });
            if (res?.ok) anyOk = true;
          }
          if (anyOk) sent++; else skipped++;
        } catch (e) {
          console.error("Failed to send dates to athlete " + athlete.id + ":", e?.message || e);
          skipped++;
        }
      }

      return NextResponse.json({ success: true, sent, skipped, total: athletes.length });
    }

    // The "session_update" action lived here: a second way to email parents
    // their session details, duplicating the group email but with no preview,
    // no delivery log and no calendar link. Removed with its button; the
    // "previous session complete" line it introduced now lives in
    // groupAssignmentHtml, sent via /group-emails.

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Notify parents error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
