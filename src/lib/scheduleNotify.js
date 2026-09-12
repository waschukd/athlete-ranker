import sql from "@/lib/db";
import { sendEmail, emailWrapper, parentEmails, esc, fmtBlastDate, fmtBlastTime } from "@/lib/email";
import { getCategoryDirectors, getOrgRoleUsers } from "@/lib/categoryRecipients";
import { contiguousBlock } from "@/lib/sessionBlocks";

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
// `alsoNotify` exists because of an ordering trap: cancelling a session
// releases its sign-ups BEFORE this runs, and the hard-delete path removes the
// rows outright, so by the time the query below looks for status='signed_up'
// there is nobody left and the people who most needed the email -- the
// evaluators actually rostered on it -- were the only ones who never got it.
// Callers that mutate sign-ups must capture the roster first and pass it here.
export async function notifySessionChange({ catId, scheduleRow, scheduleId, changeType, summary, initiator, alsoNotify = [] }) {
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
    // Roster captured by the caller before it released/deleted the sign-ups.
    for (const e of alsoNotify) add(e?.email, e?.name);

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
    const assocAdmins = await getOrgRoleUsers(org_id);
    assocAdmins.forEach(a => add(a.email, a.name));

    // Directors of this category
    const directors = await getCategoryDirectors(catId);
    directors.forEach(d => add(d.email, d.name));

    if (recipients.size === 0) return { notified: 0 };

    // ── Email body ──────────────────────────────────────────────────────────
    const verb = { added: "added", edited: "updated", cancelled: "cancelled", reinstated: "reinstated" }[changeType] || "changed";
    const accent = changeType === "cancelled" ? "#d23b3b" : changeType === "added" ? "#0b8a3e" : "#0b5cd6";
    const r = scheduleRow || {};
    const who = initiator?.name ? `${esc(initiator.name)}${initiator.role ? ` (${esc(ROLE_LABEL[initiator.role] || initiator.role)})` : ""}` : "An administrator";
    // Escape the value — it can carry user-controlled content (location, names).
    const detailRow = (label, value) =>
      `<tr><td style="padding:5px 0;font-size:13px;color:#5b606b;width:120px;">${label}</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${value != null && value !== "" ? esc(value) : "—"}</td></tr>`;

    const html = emailWrapper(`
      <h2 style="margin:0 0 6px;font-family:'Archivo','Hanken Grotesk',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${accent};">Session ${verb}</h2>
      <p style="margin:0 0 18px;font-size:14px;color:#5b606b;line-height:1.6;">${who} ${verb} a session for <strong style="color:#101113;">${esc(category_name)}</strong>${org_name ? ` at ${esc(org_name)}` : ""}.${summary ? ` ${esc(summary)}` : ""}</p>
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

    // Evaluators are defined by the membership's own is_evaluator flag, never by
    // users.role: role is the account's primary role and an SP admin who also
    // evaluates is still 'service_provider_admin' there.
    //
    // Coaches (category_evaluators.kind = 'coach') are a comparison-only scoring
    // track, not evaluators, and must not be recruited to fill an evaluator
    // spot -- but only for the org where they coach. A real CT evaluator who
    // also coaches for EFHA is still a CT evaluator, and a blanket "any coach
    // anywhere" exclusion silently dropped her from CT's own blasts.
    let pool = await sql`
      SELECT DISTINCT u.id, u.email, u.name FROM evaluator_memberships em
      JOIN users u ON u.id = em.user_id
      WHERE em.organization_id = ANY(${orgIds}) AND em.status = 'active'
        AND em.is_evaluator = true
        AND NOT EXISTS (
          SELECT 1 FROM category_evaluators ce
          JOIN age_categories cac ON cac.id = ce.age_category_id
          WHERE ce.user_id = em.user_id AND ce.kind = 'coach' AND cac.organization_id = em.organization_id
        )
        AND u.id NOT IN (
          SELECT user_id FROM evaluator_session_signups WHERE schedule_id = ${r.id} AND status = 'signed_up'
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
      <p style="margin:0 0 18px;font-size:14px;color:#5b606b;line-height:1.6;"><strong style="color:#101113;">${esc(org_name)}</strong> has <strong style="color:#101113;">${open}</strong> open evaluator spot${open > 1 ? "s" : ""} for ${esc(category_name)}. First come, first served.</p>
      <div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:10px;padding:16px 20px;margin:0 0 18px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:5px 0;font-size:13px;color:#5b606b;width:120px;">Date</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${fmtBlastDate(r.scheduled_date)}</td></tr>
          <tr><td style="padding:5px 0;font-size:13px;color:#5b606b;">Time</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${r.start_time ? `${fmtBlastTime(r.start_time)}${r.end_time ? `–${fmtBlastTime(r.end_time)}` : ""}` : "TBD"}</td></tr>
          <tr><td style="padding:5px 0;font-size:13px;color:#5b606b;">Location</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${r.location ? esc(r.location) : "TBD"}</td></tr>
        </table>
      </div>
      <div style="text-align:center;margin:8px 0 0;"><a href="${BASE_URL}/evaluator/dashboard" style="display:inline-block;font-family:'Archivo',sans-serif;padding:14px 30px;background:#0b5cd6;color:#fff;text-decoration:none;border-radius:99px;font-size:14px;font-weight:700;">Sign up →</a></div>
    `);
    const subject = `Open evaluator spot — ${category_name} (${fmtBlastDate(r.scheduled_date)})`;
    for (const p of pool) await sendEmail(p.email, subject, html);
    return { offered: pool.length, open };
  } catch (err) {
    console.error("offerOpenSession error:", err);
    return { offered: 0, error: err?.message };
  }
}

// Real complaint: a session added (or moved) earlier in the day at the same
// rink than one an evaluator already signed up for is invisible to them
// unless they happen to reopen their dashboard -- offerOpenSession blasts the
// WHOLE eligible pool generically, which is easy to miss/ignore among
// everything else Sideline Star already emails. This targets specifically
// the evaluators already committed to a session THAT DAY at THAT RINK which
// now connects to the new/moved one (same detection as
// lib/sessionBlocks.contiguousBlock, used for the evaluator-signup prompt and
// the admin blast button), and tells them directly: you're already going to
// be there, here's one more that lines up.
export async function notifyConnectingEvaluators({ catId, scheduleRow }) {
  try {
    const r = scheduleRow;
    if (!r || r.status !== "scheduled") return { notified: 0 };
    if (!r.evaluators_required || r.evaluators_required <= 0) return { notified: 0, skipped: "no_evaluators_needed" };
    if (!r.scheduled_date || !r.location || !r.start_time) return { notified: 0, skipped: "missing_time_or_location" };

    const catInfo = await sql`
      SELECT ac.name AS category_name, o.id AS org_id, o.name AS org_name
      FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id WHERE ac.id = ${catId}
    `;
    if (!catInfo.length) return { notified: 0 };
    const { category_name, org_id, org_name } = catInfo[0];

    const dayRows = await sql`
      SELECT es.id AS schedule_id, es.scheduled_date, es.start_time, es.end_time, es.location
      FROM evaluation_schedule es
      JOIN age_categories ac ON ac.id = es.age_category_id
      WHERE ac.organization_id = ${org_id} AND es.scheduled_date = ${r.scheduled_date} AND es.status = 'scheduled'
    `;
    // dayRows is already scoped to this one org by the query above, but
    // contiguousBlock's grouping key checks org_id on each row -- attach it
    // explicitly rather than relying on a value that was never selected.
    const clicked = { schedule_id: r.id, org_id, scheduled_date: r.scheduled_date, start_time: r.start_time, end_time: r.end_time, location: r.location };
    const block = contiguousBlock(clicked, [...dayRows.map(d => ({ ...d, org_id })), clicked]);
    const connectingIds = block.map(s => s.schedule_id).filter(id => id !== r.id);
    if (!connectingIds.length) return { notified: 0, skipped: "no_connections" };

    const cnt = await sql`SELECT COUNT(*)::int AS n FROM evaluator_session_signups WHERE schedule_id = ${r.id} AND status = 'signed_up'`;
    const open = r.evaluators_required - (cnt[0]?.n || 0);
    if (open <= 0) return { notified: 0, skipped: "already_full" };

    const evaluators = await sql`
      SELECT DISTINCT u.id, u.email, u.name
      FROM evaluator_session_signups ess
      JOIN users u ON u.id = ess.user_id
      WHERE ess.schedule_id = ANY(${connectingIds}) AND ess.status = 'signed_up'
        AND u.id NOT IN (SELECT user_id FROM evaluator_session_signups WHERE schedule_id = ${r.id} AND status = 'signed_up')
    `;
    if (!evaluators.length) return { notified: 0 };

    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";
    const html = emailWrapper(`
      <h2 style="margin:0 0 6px;font-family:'Archivo','Hanken Grotesk',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#0b8a3e;">A session was added next to one of yours</h2>
      <p style="margin:0 0 18px;font-size:14px;color:#5b606b;line-height:1.6;">You're already signed up at <strong style="color:#101113;">${esc(r.location)}</strong> on ${fmtBlastDate(r.scheduled_date)} -- <strong style="color:#101113;">${esc(org_name)}</strong> just added a ${esc(category_name)} session that connects right to it.</p>
      <div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:10px;padding:16px 20px;margin:0 0 18px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:5px 0;font-size:13px;color:#5b606b;width:120px;">Date</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${fmtBlastDate(r.scheduled_date)}</td></tr>
          <tr><td style="padding:5px 0;font-size:13px;color:#5b606b;">Time</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${fmtBlastTime(r.start_time)}${r.end_time ? `–${fmtBlastTime(r.end_time)}` : ""}</td></tr>
          <tr><td style="padding:5px 0;font-size:13px;color:#5b606b;">Location</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${esc(r.location)}</td></tr>
          <tr><td style="padding:5px 0;font-size:13px;color:#5b606b;">Spots open</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${open}</td></tr>
        </table>
      </div>
      <div style="text-align:center;margin:8px 0 0;"><a href="${BASE_URL}/evaluator/dashboard" style="display:inline-block;font-family:'Archivo',sans-serif;padding:14px 30px;background:#0b5cd6;color:#fff;text-decoration:none;border-radius:99px;font-size:14px;font-weight:700;">Add it to your day →</a></div>
    `);
    const subject = `A connecting session was just added — ${category_name} (${fmtBlastDate(r.scheduled_date)})`;
    for (const e of evaluators) await sendEmail(e.email, subject, html);
    return { notified: evaluators.length };
  } catch (err) {
    console.error("notifyConnectingEvaluators error:", err);
    return { notified: 0, error: err?.message };
  }
}

// Real incident: someone can sign up for two sessions that DON'T overlap at
// signup time (both the evaluator and tester signup routes have their own
// conflict guard, honest about that), but a session gets edited afterward --
// date/time moved -- and nothing ever re-checks it against what everyone
// already signed up for is now double-booked into. Sara Diamond ended up
// rostered on two evaluation sessions at different rinks this way; the same
// gap exists across the evaluator/tester line -- a tester's testing slot can
// just as easily get moved onto an evaluation they already signed up for.
// Call this after ANY edit that changes date/start_time/end_time, for the row
// as it now stands, and it finds everyone on THIS session (evaluator OR
// tester) who now conflicts with another signed-up commitment of theirs
// (evaluator OR tester) that same day, and tells both them (so they know to
// drop one) and the org's admins (so staffing gets fixed). Works for both an
// association-owned row (age_category_id set) and an SP-owned testing event
// (service_provider_id set, no category) -- context is read off the row
// itself, not passed in, since a testing event has no catId to give it.
export async function warnScheduleConflicts({ scheduleRow }) {
  try {
    const r = scheduleRow;
    if (!r?.scheduled_date || !r.start_time || !r.end_time) return { warned: 0, skipped: "missing_time" };

    let category_name, org_id, org_name, isSpEvent = false;
    if (r.age_category_id) {
      const catInfo = await sql`
        SELECT ac.name AS category_name, o.id AS org_id, o.name AS org_name
        FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id WHERE ac.id = ${r.age_category_id}
      `;
      if (!catInfo.length) return { warned: 0 };
      ({ category_name, org_id, org_name } = catInfo[0]);
    } else if (r.service_provider_id) {
      const spInfo = await sql`SELECT id AS org_id, name AS org_name FROM organizations WHERE id = ${r.service_provider_id}`;
      if (!spInfo.length) return { warned: 0 };
      ({ org_id, org_name } = spInfo[0]);
      category_name = r.client_label || r.age_label || "Testing";
      isSpEvent = true;
    } else {
      return { warned: 0, skipped: "no_org_context" };
    }

    // Two UNIONs: who's currently on THIS row (either signup table), cross
    // joined against every OTHER active commitment of theirs (either signup
    // table) that overlaps it in time. Catches all three combinations --
    // evaluator/evaluator, tester/tester, and the cross case -- in one pass.
    const conflicts = await sql`
      SELECT DISTINCT u.id AS user_id, u.email, u.name, other.other_role,
        sb.id AS other_schedule_id, sb.start_time AS other_start, sb.end_time AS other_end,
        sb.location AS other_location, sb.session_number AS other_session, sb.group_number AS other_group,
        COALESCE(acb.name, sb.client_label, sb.age_label, 'Testing') AS other_category,
        COALESCE(obassoc.name, obsp.name) AS other_org
      FROM (
        SELECT user_id FROM evaluator_session_signups WHERE schedule_id = ${r.id} AND status = 'signed_up'
        UNION
        SELECT user_id FROM tester_session_signups WHERE schedule_id = ${r.id} AND status = 'signed_up'
      ) AS on_this
      JOIN users u ON u.id = on_this.user_id
      JOIN (
        SELECT user_id, schedule_id, 'evaluator' AS other_role FROM evaluator_session_signups WHERE status = 'signed_up' AND schedule_id != ${r.id}
        UNION ALL
        SELECT user_id, schedule_id, 'tester' AS other_role FROM tester_session_signups WHERE status = 'signed_up' AND schedule_id != ${r.id}
      ) AS other ON other.user_id = on_this.user_id
      JOIN evaluation_schedule sb ON sb.id = other.schedule_id
      LEFT JOIN age_categories acb ON acb.id = sb.age_category_id
      LEFT JOIN organizations obassoc ON obassoc.id = acb.organization_id
      LEFT JOIN organizations obsp ON obsp.id = sb.service_provider_id
      WHERE sb.scheduled_date = ${r.scheduled_date}
        AND sb.status != 'cancelled'
        AND sb.start_time IS NOT NULL AND sb.end_time IS NOT NULL
        AND sb.start_time < ${r.end_time} AND sb.end_time > ${r.start_time}
    `;
    if (!conflicts.length) return { warned: 0 };

    const admins = new Map();
    const addAdmin = (email, name) => { if (email) admins.set(email.toLowerCase(), name || email); };
    // An SP-owned testing event has no association to link from -- it's
    // already the SP's own event, so just alert the SP's own admins below.
    if (!isSpEvent) {
      const sps = await sql`
        SELECT sp.contact_email AS sp_email, sp.name AS sp_name
        FROM sp_association_links sal JOIN organizations sp ON sp.id = sal.service_provider_id
        WHERE sal.association_id = ${org_id} AND sal.status = 'active'
      `;
      sps.forEach(sp => addAdmin(sp.sp_email, sp.sp_name));
    }
    const orgAdmins = await getOrgRoleUsers(org_id);
    orgAdmins.forEach(a => addAdmin(a.email, a.name));

    for (const c of conflicts) {
      const html = emailWrapper(`
        <h2 style="margin:0 0 6px;font-family:'Archivo','Hanken Grotesk',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#d23b3b;">You're now double-booked</h2>
        <p style="margin:0 0 18px;font-size:14px;color:#5b606b;line-height:1.6;">A session time change means you're signed up for two overlapping sessions on <strong style="color:#101113;">${fmtBlastDate(r.scheduled_date)}</strong>. Please cancel one from your dashboard.</p>
        <div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:10px;padding:16px 20px;margin:0 0 12px;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#5b606b;text-transform:uppercase;letter-spacing:0.4px;">${esc(org_name)} · ${esc(category_name)}</p>
          <p style="margin:0;font-size:13px;color:#101113;">S${esc(r.session_number)}G${esc(r.group_number)} · ${fmtBlastTime(r.start_time)}–${fmtBlastTime(r.end_time)} @ ${esc(r.location || "TBD")}</p>
        </div>
        <div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:10px;padding:16px 20px;margin:0 0 18px;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#5b606b;text-transform:uppercase;letter-spacing:0.4px;">${esc(c.other_org)} · ${esc(c.other_category)}</p>
          <p style="margin:0;font-size:13px;color:#101113;">S${esc(c.other_session)}G${esc(c.other_group)} · ${fmtBlastTime(c.other_start)}–${fmtBlastTime(c.other_end)} @ ${esc(c.other_location || "TBD")}</p>
        </div>
      `);
      await sendEmail(c.email, `You're double-booked on ${fmtBlastDate(r.scheduled_date)}`, html);

      for (const [email] of admins) {
        await sendEmail(email, `⚠ ${c.name} is double-booked — ${fmtBlastDate(r.scheduled_date)}`, emailWrapper(`
          <h2 style="margin:0 0 6px;font-family:'Archivo','Hanken Grotesk',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#d23b3b;">Double-booked</h2>
          <p style="margin:0 0 18px;font-size:14px;color:#5b606b;line-height:1.6;"><strong style="color:#101113;">${esc(c.name)}</strong> (${esc(c.email)}) is now signed up for two overlapping sessions on ${fmtBlastDate(r.scheduled_date)}, caused by a schedule edit. They've been emailed to drop one.</p>
          <div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:10px;padding:16px 20px;margin:0 0 12px;">
            <p style="margin:0;font-size:13px;color:#101113;">${esc(org_name)} ${esc(category_name)} S${esc(r.session_number)}G${esc(r.group_number)} · ${fmtBlastTime(r.start_time)}–${fmtBlastTime(r.end_time)} @ ${esc(r.location || "TBD")}</p>
          </div>
          <div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:10px;padding:16px 20px;margin:0 0 4px;">
            <p style="margin:0;font-size:13px;color:#101113;">${esc(c.other_org)} ${esc(c.other_category)} S${esc(c.other_session)}G${esc(c.other_group)} · ${fmtBlastTime(c.other_start)}–${fmtBlastTime(c.other_end)} @ ${esc(c.other_location || "TBD")}</p>
          </div>
        `));
      }
    }
    return { warned: conflicts.length };
  } catch (err) {
    console.error("warnScheduleConflicts error:", err);
    return { warned: 0, error: err?.message };
  }
}

// Testing is a one-shot CSV upload (not a live session evaluators trickle
// scores into), so directors/admins have no other signal that results exist
// until they happen to open the dashboard. Fires once per successful upload,
// to the category's directors plus every association admin (org contact +
// user_organization_roles) — same recipient set as notifySessionChange, minus
// evaluators/SP (they don't need this one; the SP is who just uploaded it).
export async function notifyTestingResultsUploaded({ catId, sessionNumber, matchedCount }) {
  try {
    if (!matchedCount) return { notified: 0, skipped: "no_matches" };
    const catInfo = await sql`
      SELECT ac.name AS category_name, ac.id AS org_scoped_id, o.id AS org_id, o.name AS org_name, o.contact_email AS org_email
      FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id
      WHERE ac.id = ${catId}
    `;
    if (!catInfo.length) return { notified: 0 };
    const { category_name, org_id, org_name, org_email } = catInfo[0];

    const recipients = new Map();
    const add = (email, name) => { if (email) recipients.set(email.toLowerCase(), name || email); };

    add(org_email, org_name);
    const assocAdmins = await getOrgRoleUsers(org_id, { onlyRole: "association_admin" });
    assocAdmins.forEach(a => add(a.email, a.name));

    const directors = await getCategoryDirectors(catId);
    directors.forEach(d => add(d.email, d.name));

    if (recipients.size === 0) return { notified: 0 };

    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";
    const html = emailWrapper(`
      <h2 style="margin:0 0 6px;font-family:'Archivo','Hanken Grotesk',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#0b8a3e;">Testing results uploaded</h2>
      <p style="margin:0 0 18px;font-size:14px;color:#5b606b;line-height:1.6;">Your testing results for <strong style="color:#101113;">${esc(category_name)}</strong>${sessionNumber != null ? ` (Session ${esc(sessionNumber)})` : ""} have been uploaded and are viewable from the dashboard.</p>
      <div style="text-align:center;margin:8px 0 0;"><a href="${BASE_URL}/association/dashboard/category/${catId}" style="display:inline-block;font-family:'Archivo',sans-serif;padding:14px 30px;background:#0b5cd6;color:#fff;text-decoration:none;border-radius:99px;font-size:14px;font-weight:700;">View results →</a></div>
    `);
    const subject = `Testing results uploaded — ${category_name}`;
    for (const [email] of recipients) await sendEmail(email, subject, html);
    return { notified: recipients.size };
  } catch (err) {
    console.error("notifyTestingResultsUploaded error:", err);
    return { notified: 0, error: err?.message };
  }
}

// Notify parents when a change is last-minute (session within ~48h) OR when
// they were already told a now-wrong time: the per-session "ice time" email
// (group-emails route, logged to group_email_log) quotes the OLD date/time
// verbatim, and nothing else ever corrects it if the edit happens further
// out than 48h -- a family could be sitting on a stale email with no way to
// know it changed. Sessions more than ~24h in the past are never notified
// either way; nothing to act on.
export async function notifyParentsIfImminent({ catId, scheduleRow, changeType }) {
  try {
    const r = scheduleRow;
    if (!r?.scheduled_date) return { notified: 0, skipped: "no_date" };
    const when = new Date(r.scheduled_date);
    const hoursUntil = (when.getTime() - Date.now()) / 3_600_000;
    if (hoursUntil < -24) return { notified: 0, skipped: "already_past" };

    let alreadyToldParents = false;
    if (r.session_number != null && r.group_number != null) {
      const sent = await sql`
        SELECT 1 FROM group_email_log
        WHERE age_category_id = ${catId} AND session_number = ${r.session_number}
          AND group_number = ${r.group_number} AND status = 'sent' LIMIT 1`;
      alreadyToldParents = sent.length > 0;
    }
    if (hoursUntil > 48 && !alreadyToldParents) return { notified: 0, skipped: "not_imminent" };

    const parents = await sql`
      SELECT DISTINCT a.id, a.parent_email, a.parent_email_2, a.first_name, a.last_name
      FROM player_group_assignments pga
      JOIN session_groups sg ON sg.id = pga.session_group_id
      JOIN athletes a ON a.id = pga.athlete_id
      WHERE sg.age_category_id = ${catId}
        AND sg.session_number = ${r.session_number}
        AND sg.group_number = ${r.group_number}
        AND ((a.parent_email IS NOT NULL AND a.parent_email <> '') OR (a.parent_email_2 IS NOT NULL AND a.parent_email_2 <> ''))
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
        <p style="margin:0 0 18px;font-size:14px;color:#5b606b;line-height:1.6;">Hi, an upcoming ${esc(category_name)} session${org_name ? ` with ${esc(org_name)}` : ""} for <strong style="color:#101113;">${esc(p.first_name)} ${esc(p.last_name)}</strong> has been ${cancelled ? "cancelled" : "rescheduled"}.</p>
        <div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:10px;padding:16px 20px;margin:0 0 18px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:5px 0;font-size:13px;color:#5b606b;width:120px;">${cancelled ? "Was" : "New time"}</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${fmtDate(r.scheduled_date)}${r.start_time ? ` · ${r.start_time}` : ""}</td></tr>
            ${cancelled ? "" : `<tr><td style="padding:5px 0;font-size:13px;color:#5b606b;">Location</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#101113;">${r.location ? esc(r.location) : "TBD"}</td></tr>`}
          </table>
        </div>
        <p style="font-size:13px;color:#5b606b;margin:0;">${cancelled ? "You'll be notified if it is rescheduled." : "Please plan to arrive at least 30 minutes early for check-in."}</p>
      `);
      for (const to of parentEmails(p)) await sendEmail(to, `${headline} — ${category_name}`, html);
    }
    return { notified: parents.length };
  } catch (err) {
    console.error("notifyParentsIfImminent error:", err);
    return { notified: 0, error: err?.message };
  }
}
