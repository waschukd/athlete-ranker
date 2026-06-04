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

// When a future session is understaffed (e.g. just added, or edited so it needs
// coverage), automatically invite the eligible evaluator pool to sign up — the
// association's evaluators plus any linked service provider's evaluators — so
// staffing self-heals instead of waiting on a manual blast. Skips testing
// sessions, past dates, full sessions, and evaluators already signed up.
export async function offerOpenSession({ catId, scheduleRow }) {
  try {
    const r = scheduleRow;
    if (!r || r.status !== "scheduled") return { offered: 0 };
    if (!r.evaluators_required || r.evaluators_required <= 0) return { offered: 0 };

    if (r.scheduled_date) {
      const when = new Date(r.scheduled_date);
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      if (isFinite(when.getTime()) && when < todayStart) return { offered: 0 };
    }

    const cnt = await sql`
      SELECT COUNT(*)::int AS n FROM evaluator_session_signups
      WHERE schedule_id = ${r.id} AND status = 'signed_up'
    `;
    const open = r.evaluators_required - (cnt[0]?.n || 0);
    if (open <= 0) return { offered: 0 };

    const catInfo = await sql`
      SELECT ac.name AS category_name, o.id AS org_id, o.name AS org_name
      FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id WHERE ac.id = ${catId}
    `;
    if (!catInfo.length) return { offered: 0 };
    const { category_name, org_id, org_name } = catInfo[0];

    const orgIds = [org_id];
    const sps = await sql`SELECT service_provider_id FROM sp_association_links WHERE association_id = ${org_id} AND status = 'active'`;
    sps.forEach(s => orgIds.push(s.service_provider_id));

    let pool = await sql`
      SELECT DISTINCT u.id, u.email, u.name FROM evaluator_memberships em
      JOIN users u ON u.id = em.user_id
      WHERE em.organization_id = ANY(${orgIds}) AND em.status = 'active'
        AND u.role IN ('association_evaluator', 'service_provider_evaluator')
        AND u.id NOT IN (
          SELECT user_id FROM evaluator_session_signups WHERE schedule_id = ${r.id} AND status != 'cancelled'
        )
    `;
    // Skip evaluators who marked themselves unavailable on this date (best-effort:
    // if the table isn't migrated yet, just don't filter).
    if (r.scheduled_date) {
      try {
        const blocked = await sql`
          SELECT DISTINCT user_id FROM evaluator_unavailability
          WHERE start_date <= ${r.scheduled_date} AND end_date >= ${r.scheduled_date}
        `;
        const blockedSet = new Set(blocked.map(b => b.user_id));
        pool = pool.filter(p => !blockedSet.has(p.id));
      } catch { /* not migrated */ }
    }
    if (!pool.length) return { offered: 0 };

    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";
    const html = emailWrapper(`
      <h2 style="margin:0 0 6px;font-family:'Archivo','Hanken Grotesk',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#0b8a3e;">Open evaluator spot${open > 1 ? "s" : ""}</h2>
      <p style="margin:0 0 18px;font-size:14px;color:#5b606b;line-height:1.6;"><strong style="color:#101113;">${org_name}</strong> has <strong style="color:#101113;">${open}</strong> open evaluator spot${open > 1 ? "s" : ""} for ${category_name}. First come, first served.</p>
      <div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:10px;padding:16px 20px;margin:0 0 18px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:5px 0;font-size:13px;color:#5b606b;width:120px;">Date</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${fmtDate(r.scheduled_date)}</td></tr>
          <tr><td style="padding:5px 0;font-size:13px;color:#5b606b;">Time</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${r.start_time ? `${r.start_time}${r.end_time ? `–${r.end_time}` : ""}` : "TBD"}</td></tr>
          <tr><td style="padding:5px 0;font-size:13px;color:#5b606b;">Location</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${r.location || "TBD"}</td></tr>
        </table>
      </div>
      <div style="text-align:center;margin:8px 0 0;"><a href="${BASE_URL}/evaluator/dashboard" style="display:inline-block;font-family:'Archivo',sans-serif;padding:14px 30px;background:#0b5cd6;color:#fff;text-decoration:none;border-radius:99px;font-size:14px;font-weight:700;">Sign up →</a></div>
    `);
    const subject = `Open evaluator spot — ${category_name} (${fmtDate(r.scheduled_date)})`;
    for (const p of pool) await sendEmail(p.email, subject, html);
    return { offered: pool.length, open };
  } catch (err) {
    console.error("offerOpenSession error:", err);
    return { offered: 0, error: err?.message };
  }
}

// Notify parents ONLY when a change is last-minute (the session is within ~48h).
// Earlier changes don't need a parent notice — groups for a soon-to-be-cancelled
// session wouldn't be set up yet. Targets only parents of athletes assigned to the
// affected session's group.
export async function notifyParentsIfImminent({ catId, scheduleRow, changeType }) {
  try {
    const r = scheduleRow;
    if (!r?.scheduled_date) return { notified: 0, skipped: "no_date" };
    const when = new Date(r.scheduled_date);
    const hoursUntil = (when.getTime() - Date.now()) / 3_600_000;
    if (!(hoursUntil <= 48) || hoursUntil < -24) return { notified: 0, skipped: "not_imminent" };

    const parents = await sql`
      SELECT DISTINCT a.parent_email, a.first_name, a.last_name
      FROM player_group_assignments pga
      JOIN session_groups sg ON sg.id = pga.session_group_id
      JOIN athletes a ON a.id = pga.athlete_id
      WHERE sg.age_category_id = ${catId}
        AND sg.session_number = ${r.session_number}
        AND sg.group_number = ${r.group_number}
        AND a.parent_email IS NOT NULL AND a.parent_email <> ''
    `;
    if (!parents.length) return { notified: 0 };

    const catInfo = await sql`
      SELECT ac.name AS category_name, o.name AS org_name
      FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id WHERE ac.id = ${catId}
    `;
    const category_name = catInfo[0]?.category_name || "Evaluation";
    const org_name = catInfo[0]?.org_name || "";
    const cancelled = changeType === "cancelled";
    const accent = cancelled ? "#d23b3b" : "#0b5cd6";
    const headline = cancelled ? "Session cancelled" : "Session time changed";

    for (const p of parents) {
      const html = emailWrapper(`
        <h2 style="margin:0 0 6px;font-family:'Archivo','Hanken Grotesk',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${accent};">${headline}</h2>
        <p style="margin:0 0 18px;font-size:14px;color:#5b606b;line-height:1.6;">Hi, an upcoming ${category_name} session${org_name ? ` with ${org_name}` : ""} for <strong style="color:#101113;">${p.first_name} ${p.last_name}</strong> has been ${cancelled ? "cancelled" : "rescheduled"}.</p>
        <div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:10px;padding:16px 20px;margin:0 0 18px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:5px 0;font-size:13px;color:#5b606b;width:120px;">Group</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">Group ${r.group_number}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#5b606b;">${cancelled ? "Was" : "New time"}</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${fmtDate(r.scheduled_date)}${r.start_time ? ` · ${r.start_time}` : ""}</td></tr>
            ${cancelled ? "" : `<tr><td style="padding:5px 0;font-size:13px;color:#5b606b;">Location</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${r.location || "TBD"}</td></tr>`}
          </table>
        </div>
        <p style="font-size:13px;color:#5b606b;margin:0;">${cancelled ? "You'll be notified if it is rescheduled." : "Please plan to arrive 15 minutes early for check-in."}</p>
      `);
      await sendEmail(p.parent_email, `${headline} — ${category_name}`, html);
    }
    return { notified: parents.length };
  } catch (err) {
    console.error("notifyParentsIfImminent error:", err);
    return { notified: 0, error: err?.message };
  }
}
