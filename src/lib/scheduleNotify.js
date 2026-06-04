import sql from "@/lib/db";
import { sendEmail, emailWrapper } from "@/lib/email";

const ROLE_LABEL = {
  super_admin: "Super Admin",
  service_provider_admin: "Service Provider",
  association_admin: "Association Admin",
  director: "Director",
};

function fmtDate(d) {
  if (!d) return "TBD";
  return d.toString().split("T")[0];
}

// Gather every party tied to a session and email them when it changes. Used by the
// schedule route on add / edit / cancel so a change made by ANYONE (association,
// director, or the service provider) instantly reaches: the evaluators signed up to
// that session, the service provider's admins, ALL association admins (not just the
// org contact), and the category's directors. The initiator is named so recipients
// know who made the change (e.g. the association sees that the SP moved a session).
//
// changeType: "added" | "edited" | "cancelled" | "reinstated"
// scheduleRow: the evaluation_schedule row (for session details)
// scheduleId: used to target evaluators signed up to THIS session (omit for bulk)
// summary: optional human string describing what changed ("moved to Mar 14, 7:00 PM")
// initiator: { name, role } of whoever made the change
export async function notifySessionChange({ catId, scheduleRow, scheduleId, changeType, summary, initiator }) {
  try {
    const catInfo = await sql`
      SELECT ac.name AS category_name, o.id AS org_id, o.name AS org_name, o.contact_email AS org_email
      FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id
      WHERE ac.id = ${catId}
    `;
    if (!catInfo.length) return { notified: 0 };
    const { category_name, org_id, org_name, org_email } = catInfo[0];

    // ── Recipients ──────────────────────────────────────────────────────────
    const recipients = new Map(); // email -> name
    const add = (email, name) => { if (email) recipients.set(email.toLowerCase(), name || email); };

    // Evaluators signed up (this session if scheduleId given, else whole category)
    const evals = scheduleId
      ? await sql`
          SELECT DISTINCT u.email, u.name FROM evaluator_session_signups ess
          JOIN users u ON u.id = ess.user_id
          WHERE ess.schedule_id = ${scheduleId} AND ess.status = 'signed_up'`
      : await sql`
          SELECT DISTINCT u.email, u.name FROM evaluator_session_signups ess
          JOIN evaluation_schedule es ON es.id = ess.schedule_id
          JOIN users u ON u.id = ess.user_id
          WHERE es.age_category_id = ${catId} AND ess.status = 'signed_up'`;
    evals.forEach(e => add(e.email, e.name));

    // Service provider(s) linked to this association + their admins
    const sps = await sql`
      SELECT sp.id AS sp_id, sp.name AS sp_name, sp.contact_email AS sp_email
      FROM sp_association_links sal
      JOIN organizations sp ON sp.id = sal.service_provider_id
      WHERE sal.association_id = ${org_id} AND sal.status = 'active'
    `;
    for (const sp of sps) {
      add(sp.sp_email, sp.sp_name);
      const spAdmins = await sql`
        SELECT u.email, u.name FROM user_organization_roles uor
        JOIN users u ON u.id = uor.user_id
        WHERE uor.organization_id = ${sp.sp_id}
      `;
      spAdmins.forEach(a => add(a.email, a.name));
    }

    // Association admins — org contact + everyone with a role on the org
    add(org_email, org_name);
    const assocAdmins = await sql`
      SELECT u.email, u.name FROM user_organization_roles uor
      JOIN users u ON u.id = uor.user_id
      WHERE uor.organization_id = ${org_id}
    `;
    assocAdmins.forEach(a => add(a.email, a.name));

    // Directors of this category
    const directors = await sql`
      SELECT DISTINCT u.email, u.name FROM director_assignments da
      JOIN users u ON u.id = da.user_id
      WHERE da.age_category_id = ${catId} AND da.status = 'active'
    `;
    directors.forEach(d => add(d.email, d.name));

    if (recipients.size === 0) return { notified: 0 };

    // ── Email body ──────────────────────────────────────────────────────────
    const verb = { added: "added", edited: "updated", cancelled: "cancelled", reinstated: "reinstated" }[changeType] || "changed";
    const accent = changeType === "cancelled" ? "#d23b3b" : changeType === "added" ? "#0b8a3e" : "#0b5cd6";
    const r = scheduleRow || {};
    const who = initiator?.name ? `${initiator.name}${initiator.role ? ` (${ROLE_LABEL[initiator.role] || initiator.role})` : ""}` : "An administrator";
    const detailRow = (label, value) =>
      `<tr><td style="padding:5px 0;font-size:13px;color:#5b606b;width:120px;">${label}</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${value || "—"}</td></tr>`;

    const html = emailWrapper(`
      <h2 style="margin:0 0 6px;font-family:'Archivo','Hanken Grotesk',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${accent};">Session ${verb}</h2>
      <p style="margin:0 0 18px;font-size:14px;color:#5b606b;line-height:1.6;">${who} ${verb} a session for <strong style="color:#101113;">${category_name}</strong>${org_name ? ` at ${org_name}` : ""}.${summary ? ` ${summary}` : ""}</p>
      ${scheduleRow ? `<div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:10px;padding:16px 20px;margin:0 0 18px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${detailRow("Category", category_name)}
          ${detailRow("Group", r.group_number != null ? `Group ${r.group_number}` : null)}
          ${detailRow("Date", fmtDate(r.scheduled_date))}
          ${detailRow("Time", r.start_time ? `${r.start_time}${r.end_time ? `–${r.end_time}` : ""}` : null)}
          ${detailRow("Location", r.location)}
        </table>
      </div>` : ""}
      ${changeType === "cancelled"
        ? `<p style="font-size:13px;color:#5b606b;margin:0;">If you were signed up, no action is required — your record is unaffected.</p>`
        : `<p style="font-size:13px;color:#5b606b;margin:0;">Please check your dashboard for the latest details.</p>`}
    `);

    const subject = `Session ${verb} — ${category_name}${r.group_number != null ? ` · Group ${r.group_number}` : ""} (${fmtDate(r.scheduled_date)})`;
    for (const [email, name] of recipients) {
      await sendEmail(email, subject, html);
    }
    return { notified: recipients.size };
  } catch (err) {
    console.error("notifySessionChange error:", err);
    return { notified: 0, error: err?.message };
  }
}
