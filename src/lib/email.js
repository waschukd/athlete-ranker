// Always send with a recognizable sender NAME ("Sideline Star <addr>") so the
// inbox shows the brand, not just the mailbox ("updates"). If EMAIL_FROM already
// carries a display name (contains "<"), it's used as-is. Exported so the few
// routes that send via raw fetch can share the exact same From.
const SENDER_NAME = process.env.EMAIL_FROM_NAME || "Sideline Star";
const RAW_FROM = process.env.EMAIL_FROM || "updates@sidelinestar.com";
export const FROM = RAW_FROM.includes("<") ? RAW_FROM : `${SENDER_NAME} <${RAW_FROM}>`;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

// Escape user-controlled values before interpolating into email HTML. Names,
// org names, notes, locations, etc. come from rosters/admins and must never be
// able to inject markup (phishing links, tracking pixels) into outbound mail.
export function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Returns { ok, id?, skipped?, error? } so callers can surface delivery status
// to the user instead of silently swallowing failures. `id` is the Resend
// message id — callers that track delivery/bounces correlate webhook events to it.
// `attachments` (optional) = [{ filename, content }] where content is base64.
export async function sendEmail(to, subject, html, attachments) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping email to", to);
    return { ok: false, skipped: true, error: "Email is not configured" };
  }
  try {
    const payload = { from: FROM, to, subject, html };
    if (attachments?.length) payload.attachments = attachments;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return { ok: false, error: err || "Email provider rejected the message" };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, id: data.id || null };
  } catch (e) {
    console.error("Email send failed:", e);
    return { ok: false, error: e?.message || "Email send failed" };
  }
}

// Both parent emails for an athlete (separated households) — deduped, valid only.
// Use everywhere we notify or sell to a parent so both households are reached.
export function parentEmails(athlete) {
  const seen = new Set();
  return [athlete?.parent_email, athlete?.parent_email_2]
    .map(e => (e || "").trim())
    .filter(e => e && e.includes("@") && !seen.has(e.toLowerCase()) && seen.add(e.toLowerCase()));
}

const BODY_FONT = "'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const DISPLAY_FONT = "'Archivo','Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF_FONT = "'Playfair Display',Georgia,'Times New Roman',serif";
// Premium "Minimal Athletic / gold" palette — matches the Development Report.
const GOLD = "#c8a13a";        // accents, buttons, on-dark
const GOLD_DEEP = "#9a7616";   // small uppercase labels on light backgrounds (readable)
const GOLD_SOFT = "#faf6ea";   // tinted fill
const GOLD_LINE = "#ece1c2";   // tinted border
const INK = "#101113";         // primary text
const MUTED = "#8b8f99";       // secondary text

export function emailWrapper(content) {
  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Archivo:wght@600;700;800;900&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;padding:0;background:#fbfbf9;font-family:${BODY_FONT};-webkit-font-smoothing:antialiased;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fbfbf9;padding:40px 20px;">
      <tr><td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ece9e2;border-radius:18px;overflow:hidden;box-shadow:0 24px 60px -34px rgba(10,12,16,0.4);">
          <tr>
            <td style="background:#0f0f12;background-image:radial-gradient(135% 160% at 86% 0%, #221f17 0%, #141416 46%, #0c0c0e 100%);padding:36px 40px;text-align:center;border-bottom:1px solid rgba(200,161,58,0.30);">
              <div style="font-family:${SERIF_FONT};font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.2px;">Sideline Star</div>
              <div style="font-size:10px;color:${GOLD};margin-top:8px;letter-spacing:0.3em;text-transform:uppercase;font-weight:700;">Athlete Evaluation Platform</div>
            </td>
          </tr>
          <tr><td style="padding:38px 40px;">${content}</td></tr>
          <tr>
            <td style="padding:18px 40px;border-top:1px solid #ece9e2;text-align:center;background:#fbfaf7;">
              <p style="margin:0;font-size:11px;color:#9aa0aa;">© <span style="font-family:${SERIF_FONT};color:${GOLD_DEEP};font-weight:700;">Sideline Star</span> · sidelinestar.com</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>`;
}

function btn(url, label) {
  return `<a href="${url}" style="display:inline-block;font-family:${DISPLAY_FONT};padding:14px 32px;background:${GOLD};color:#1b1505;text-decoration:none;border-radius:99px;font-size:14px;font-weight:800;letter-spacing:0.01em;">${label}</a>`;
}

function credBox(rows) {
  const rowsHtml = rows.map(([label, value, highlight]) =>
    `<tr>
      <td style="padding:6px 0;font-size:13px;color:#5b606b;width:140px;">${label}</td>
      <td style="padding:6px 0;font-size:13px;font-weight:600;color:#101113;">
        ${highlight ? `<code style="background:${GOLD_SOFT};border:1px solid ${GOLD_LINE};padding:2px 8px;border-radius:6px;color:${GOLD_DEEP};font-weight:700;">${value}</code>` : value}
      </td>
    </tr>`
  ).join("");
  return `<div style="background:${GOLD_SOFT};border:1px solid ${GOLD_LINE};border-radius:12px;padding:16px 20px;margin:20px 0;">
    <table width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
  </div>`;
}

// Centered premium intro: gold eyebrow + hairline rule + serif headline.
function emailHeader(eyebrow, title) {
  return `<div style="text-align:center;margin-bottom:6px;">
      <div style="font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:${GOLD_DEEP};font-weight:700;">${eyebrow}</div>
      <div style="width:34px;height:2px;background:${GOLD};margin:14px auto 0;border-radius:2px;"></div>
    </div>
    <h1 style="margin:18px 0 0;font-family:${SERIF_FONT};font-size:24px;font-weight:900;color:${INK};letter-spacing:-0.2px;text-align:center;line-height:1.25;">${title}</h1>`;
}
// Gold-tinted info section with a small uppercase eyebrow.
function infoCard(eyebrow, innerHtml) {
  return `<div style="background:${GOLD_SOFT};border:1px solid ${GOLD_LINE};border-radius:14px;padding:18px 22px;margin:0 0 16px;">
      <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD_DEEP};font-weight:700;margin-bottom:12px;">${eyebrow}</div>
      ${innerHtml}
    </div>`;
}

// ── Welcome emails ────────────────────────────────────────────────────────────

export async function emailWelcomeAssociation({ name, email, tempPassword, orgName }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Welcome to Sideline Star</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${esc(name)}</strong>, your association account for <strong style="color:#111827;">${esc(orgName)}</strong> has been created.</p>
    ${credBox([["Email", email], ["Temp Password", tempPassword, true]])}
    <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">Sign in and update your password to get started.</p>
    ${btn(`${BASE_URL}/account/signin`, "Sign In to Sideline Star →")}
  `);
  await sendEmail(email, `Welcome to Sideline Star — ${orgName}`, html);
}

// Invite to finish setting up an org account (sets their own password via the
// /accept-invite link). Replaces the old temp-password welcome for SP/God-Mode
// created orgs. Returns the sendEmail status so callers can report it.
export async function emailOrgInvite({ name, email, orgName, orgType, inviteUrl }) {
  const kind = orgType === "service_provider" ? "service provider" : "association";
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-family:${DISPLAY_FONT};font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#101113;">You're invited</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#5b606b;line-height:1.6;">Hi <strong style="color:#101113;">${esc(name || "there")}</strong>, you've been invited to manage <strong style="color:#101113;">${esc(orgName)}</strong> as a ${esc(kind)} on Sideline Star. Click below to set your password and finish setting up your account.</p>
    <div style="text-align:center;margin:28px 0;">${btn(inviteUrl, "Finish setting up →")}</div>
    <p style="font-size:12px;color:#9aa0aa;text-align:center;margin:0;">This link expires in 7 days. If you didn't expect this invitation, you can ignore it.</p>
  `);
  return await sendEmail(email, `You're invited to manage ${orgName} on Sideline Star`, html);
}

export async function emailEvaluatorApproved({ name, email, orgName, evaluatorId }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">You've been approved!</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${esc(name)}</strong>, your evaluator application for <strong style="color:#111827;">${esc(orgName)}</strong> has been approved.</p>
    ${credBox([["Evaluator ID", evaluatorId], ["Organization", orgName]])}
    <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">Sign in to view your upcoming sessions.</p>
    ${btn(`${BASE_URL}/evaluator/dashboard`, "View My Dashboard →")}
  `);
  await sendEmail(email, `Approved — ${orgName} Evaluator`, html);
}

export async function emailEvaluatorDenied({ name, email, orgName }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Application Update</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${esc(name)}</strong>, unfortunately your evaluator application for <strong style="color:#111827;">${esc(orgName)}</strong> was not approved at this time.</p>
    <p style="font-size:13px;color:#6b7280;">If you believe this is an error, please contact the organization directly.</p>
  `);
  await sendEmail(email, `Application Update — ${orgName}`, html);
}

export async function emailEvaluatorPendingApproval({ adminEmail, adminName, evalName, evalEmail, orgName }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">New Evaluator Application</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${esc(adminName)}</strong>, a new evaluator has applied to join <strong style="color:#111827;">${esc(orgName)}</strong>.</p>
    ${credBox([["Name", evalName], ["Email", evalEmail]])}
    <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">Review and approve or deny their application.</p>
    ${btn(`${BASE_URL}/service-provider/dashboard`, "Review Application →")}
  `);
  await sendEmail(adminEmail, `New Evaluator Application — ${orgName}`, html);
}

export async function emailSPLinkedToAssociation({ spAdminEmail, spAdminName, spName, assocName }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">New Association Linked</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${spAdminName}</strong>, <strong style="color:#111827;">${assocName}</strong> has been linked to <strong style="color:#111827;">${esc(spName)}</strong> on Sideline Star.</p>
    ${btn(`${BASE_URL}/service-provider/dashboard`, "View Dashboard →")}
  `);
  await sendEmail(spAdminEmail, `New Association Linked — ${assocName}`, html);
}

export async function emailStrike1({ name, email, orgName, sessionDate }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#f59e0b;">Late Cancellation Warning</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${esc(name)}</strong>, you have received <strong style="color:#f59e0b;">Strike 1</strong> for cancelling within 24 hours of your session on <strong>${sessionDate}</strong> with <strong>${esc(orgName)}</strong>.</p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
      <p style="margin:0;font-size:13px;color:#92400e;">⚠️ A second late cancellation will result in automatic suspension from future sessions.</p>
    </div>
    ${btn(`${BASE_URL}/evaluator/dashboard`, "View My Sessions →")}
  `);
  await sendEmail(email, `⚠️ Strike 1 — Late Cancellation Warning`, html);
}

export async function emailStrike2Suspended({ name, email, orgName }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#dc2626;">Account Suspended</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${esc(name)}</strong>, your evaluator account with <strong style="color:#111827;">${esc(orgName)}</strong> has been suspended following a second late cancellation.</p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
      <p style="margin:0;font-size:13px;color:#991b1b;">Please contact ${esc(orgName)} directly to discuss reinstatement.</p>
    </div>
  `);
  await sendEmail(email, `Account Suspended — ${orgName}`, html);
}

// ── Staffing / Session Reports ────────────────────────────────────────────────

export async function emailLateCancel48hr({ adminEmail, adminName, evalName, sessionDate, sessionTime, groupName, orgName, spotsOpen, remainingEvals }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#dc2626;">Evaluator Cancelled — Under 48 Hours</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${esc(adminName)}</strong>, an evaluator has cancelled with less than 48 hours notice.</p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;width:140px;">Evaluator</td><td style="font-size:13px;font-weight:600;color:#111827;">${esc(evalName)}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Session</td><td style="font-size:13px;font-weight:600;color:#111827;">${esc(groupName)} — ${sessionDate} ${sessionTime}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Spots Now Open</td><td style="font-size:13px;font-weight:700;color:#dc2626;">${spotsOpen}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Still Signed Up</td><td style="font-size:13px;color:#111827;">${remainingEvals}</td></tr>
      </table>
    </div>
    ${btn(`${BASE_URL}/service-provider/dashboard`, "Manage Sessions →")}
  `);
  await sendEmail(adminEmail, `⚠️ Evaluator Cancelled — ${sessionDate} Session Understaffed`, html);
}

export async function emailWeeklyStaffingReport({ adminEmail, adminName, orgName, sessions }) {
  // sessions = [{ name, date, time, group, required, signed_up, evaluators: [{name}] }]
  const fullSessions = sessions.filter(s => s.signed_up >= s.required);
  const partialSessions = sessions.filter(s => s.signed_up > 0 && s.signed_up < s.required);
  const emptySessions = sessions.filter(s => s.signed_up === 0);

  const sessionRows = sessions.map(s => {
    const status = s.signed_up >= s.required ? '🟢' : s.signed_up > 0 ? '🟡' : '🔴';
    const evalList = s.evaluators?.map(e => e.name).join(", ") || "None";
    return `<tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 0;font-size:13px;color:#111827;font-weight:600;">${s.date} ${s.time}</td>
      <td style="padding:10px 0;font-size:13px;color:#6b7280;">${s.group}</td>
      <td style="padding:10px 0;font-size:13px;text-align:center;">${status} ${s.signed_up}/${s.required}</td>
      <td style="padding:10px 0;font-size:13px;color:#6b7280;">${evalList}</td>
    </tr>`;
  }).join("");

  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Weekly Staffing Report</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">${esc(orgName)} · ${sessions.length} sessions this week</p>
    <div style="display:flex;gap:12px;margin:0 0 24px;">
      <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:24px;font-weight:800;color:#16a34a;">${fullSessions.length}</div>
        <div style="font-size:11px;color:#16a34a;font-weight:600;">FULLY STAFFED</div>
      </div>
      <div style="flex:1;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:24px;font-weight:800;color:#d97706;">${partialSessions.length}</div>
        <div style="font-size:11px;color:#d97706;font-weight:600;">PARTIAL</div>
      </div>
      <div style="flex:1;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:24px;font-weight:800;color:#dc2626;">${emptySessions.length}</div>
        <div style="font-size:11px;color:#dc2626;font-weight:600;">UNFILLED</div>
      </div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f3f4f6;">
      <tr style="background:#f9fafb;">
        <th style="padding:8px 0;font-size:11px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;">Date/Time</th>
        <th style="padding:8px 0;font-size:11px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;">Group</th>
        <th style="padding:8px 0;font-size:11px;color:#6b7280;text-align:center;font-weight:600;text-transform:uppercase;">Staff</th>
        <th style="padding:8px 0;font-size:11px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;">Evaluators</th>
      </tr>
      ${sessionRows}
    </table>
    <div style="margin-top:24px;">
      ${btn(`${BASE_URL}/service-provider/dashboard`, "View Dashboard →")}
    </div>
  `);
  await sendEmail(adminEmail, `📋 Weekly Staffing Report — ${orgName}`, html);
}

export async function emailDailyStaffingAlert({ adminEmail, adminName, orgName, openSessions }) {
  // openSessions = sessions happening today/tomorrow that need evaluators
  if (!openSessions.length) return;

  const rows = openSessions.map(s => `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:10px;">
      <div style="font-size:14px;font-weight:700;color:#111827;">${s.date} at ${s.time} — ${s.group}</div>
      <div style="font-size:13px;color:#d97706;margin-top:4px;">${s.required - s.signed_up} spot${s.required - s.signed_up !== 1 ? "s" : ""} still needed · ${s.signed_up}/${s.required} filled</div>
      ${s.signed_up > 0 ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">Signed up: ${s.evaluators?.map(e => e.name).join(", ")}</div>` : ""}
    </div>
  `).join("");

  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Daily Staffing Alert</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">${openSessions.length} session${openSessions.length !== 1 ? "s" : ""} need${openSessions.length === 1 ? "s" : ""} evaluators in the next 24 hours.</p>
    ${rows}
    ${btn(`${BASE_URL}/service-provider/dashboard`, "Fill Open Spots →")}
  `);
  await sendEmail(adminEmail, `🚨 ${openSessions.length} Session${openSessions.length !== 1 ? "s" : ""} Need Evaluators — ${orgName}`, html);
}

export async function emailOpenSessionsBlast({ evaluatorEmails, orgName, openSessions, adminName }) {
  // Send to all evaluators in pool about open sessions
  const rows = openSessions.map(s => `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin-bottom:10px;">
      <div style="font-size:14px;font-weight:700;color:#111827;">${s.date} at ${s.time}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:3px;">${s.group} · ${s.required - s.signed_up} spot${s.required - s.signed_up !== 1 ? "s" : ""} available</div>
    </div>
  `).join("");

  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Open Sessions Available</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;"><strong style="color:#111827;">${esc(orgName)}</strong> has open evaluator spots. Sign up through your dashboard.</p>
    ${rows}
    ${btn(`${BASE_URL}/evaluator/dashboard`, "View & Sign Up →")}
    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">Sent by ${esc(adminName)} · ${esc(orgName)}</p>
  `);

  // Send to each evaluator
  for (const email of evaluatorEmails) {
    await sendEmail(email, `📢 Open Evaluator Sessions Available — ${orgName}`, html);
  }
}

// ── Parent Emails ─────────────────────────────────────────────────────────

export function parentOnboardingHtml({ playerName: _pn, categoryName: _cn, orgName: _on }) {
  const playerName = esc(_pn), categoryName = esc(_cn), orgName = esc(_on);
  return emailWrapper(`
    ${emailHeader(`${esc(orgName)} &middot; Evaluations`, `Welcome to ${esc(categoryName)} Evaluations`)}
    <p style="margin:14px auto 26px;max-width:430px;font-size:14.5px;color:#5b606b;line-height:1.7;text-align:center;"><strong style="color:${INK};">${esc(playerName)}</strong> is registered for evaluations with <strong style="color:${INK};">${esc(orgName)}</strong>. Here's what to expect.</p>
    ${infoCard("What to expect", `<table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;font-size:13px;color:#4a4f57;line-height:1.55;"><strong style="color:${INK};">Multiple sessions</strong> — scored by professional evaluators across several sessions.</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#4a4f57;line-height:1.55;"><strong style="color:${INK};">Group assignments</strong> — players are organized into groups; you'll get the exact schedule before each session.</td></tr>
      </table>`)}
    ${infoCard("Before you arrive", `<table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:4px 0;font-size:13px;color:#4a4f57;">Arrive at least 30 minutes prior to your session for check-in.</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#4a4f57;">Have full equipment ready; jersey numbers are assigned at check-in.</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#4a4f57;">Make sure skates are freshly sharpened.</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#4a4f57;">Make sure your athlete is fuelled and hydrated.</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#4a4f57;">Trust the process — evaluators assess the full picture across sessions.</td></tr>
      </table>`)}
    ${infoCard("After evaluations", `<p style="margin:0;font-size:13px;color:#4a4f57;line-height:1.6;">A comprehensive Development Report will be available — collective evaluator feedback, an AI-compiled scouting analysis, and a personalized plan for ${esc(playerName)}.</p>`)}
    <p style="margin:6px 0 0;font-size:12px;color:${MUTED};text-align:center;line-height:1.6;">You'll receive another email with ${esc(playerName)}'s specific schedule once groups are assigned.</p>
  `);
}

// A player's full schedule. Like the ice-time email, the group column is
// deliberately absent — the session's date/time/rink is already group-specific,
// so naming the group adds nothing a parent can act on and invites mid-process
// comparison between families.
export function parentScheduleHtml({ playerName: _pn, categoryName: _cn, orgName: _on, sessions }) {
  const playerName = esc(_pn), categoryName = esc(_cn), orgName = esc(_on);
  const th = `padding:11px 16px;font-size:10px;color:${GOLD_DEEP};text-align:left;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;`;
  const rows = sessions.map(s => `
    <tr style="border-top:1px solid ${GOLD_LINE};">
      <td style="padding:11px 16px;font-size:13px;color:${INK};font-weight:700;">S${s.session_number}</td>
      <td style="padding:11px 16px;font-size:13px;color:#4a4f57;">${s.date || "TBD"}</td>
      <td style="padding:11px 16px;font-size:13px;color:#4a4f57;">${s.time || "TBD"}</td>
      <td style="padding:11px 16px;font-size:13px;color:#4a4f57;">${esc(s.location) || "TBD"}</td>
    </tr>
  `).join("");

  return emailWrapper(`
    ${emailHeader(`${esc(orgName)} &middot; ${esc(categoryName)}`, "Evaluation Schedule")}
    <p style="margin:14px auto 24px;max-width:420px;font-size:14.5px;color:#5b606b;line-height:1.7;text-align:center;">Here is <strong style="color:${INK};">${esc(playerName)}</strong>'s upcoming evaluation schedule.</p>
    <div style="border:1px solid ${GOLD_LINE};border-radius:14px;overflow:hidden;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr style="background:${GOLD_SOFT};">
          <th style="${th}">Session</th><th style="${th}">Date</th><th style="${th}">Time</th><th style="${th}">Location</th>
        </tr>
        ${rows}
      </table>
    </div>
    <p style="margin:18px 0 0;font-size:12.5px;color:${MUTED};text-align:center;line-height:1.6;">A calendar invite is attached — open it to add these sessions to your calendar. Please arrive at least 30 minutes early for check-in.</p>
  `);
}

// A player's ice time for one session — date, time, rink. Sent from the Groups
// page once the director has set that session's groups.
//
// Deliberately does NOT name the group. Groups are an internal artifact of how
// the ice is split, but parents read "Group 1" as a tier and start comparing
// mid-process. They get the information they need to show up; the grouping stays
// on the dashboard. The caller still passes groupNumber — it selects WHICH
// date/time this parent gets — it just never reaches the page.
// completedLabel (optional) names the session that just finished, so sessions 2+
// read as progress through the process rather than a bare time slot. Omitted for
// session 1 — nothing has been completed yet, and announcing "Registration
// complete" to someone who just registered reads as a non-sequitur.
export function groupAssignmentHtml({ playerName: _pn, categoryName: _cn, orgName: _on, sessionLabel: _sl, date, time, location: _loc, calendarUrl, completedLabel }) {
  const playerName = esc(_pn), categoryName = esc(_cn), orgName = esc(_on), sessionLabel = esc(_sl), location = esc(_loc);
  // A quiet text link, not a big button — the session card is the headline; this
  // is a convenience underneath it. Deliberately NOT an .ics attachment: Gmail
  // would render its own bulky event card above our email and bury the brand.
  const calendarLink = calendarUrl
    ? `<p style="margin:18px auto 0;text-align:center;">
         <a href="${esc(calendarUrl)}" style="display:inline-block;font-size:12.5px;font-weight:600;color:${GOLD_DEEP};text-decoration:none;border-bottom:1px solid ${GOLD_LINE};padding-bottom:2px;">+ Add to calendar</a>
       </p>`
    : "";
  const intro = completedLabel
    ? `${esc(completedLabel)} is complete. Here is ${esc(playerName)}'s next ice time. Please arrive at least 30 minutes early for check-in.`
    : `Here is ${esc(playerName)}'s ice time. Please arrive at least 30 minutes early for check-in.`;
  return emailWrapper(`
    ${emailHeader(`${esc(orgName)} &middot; ${esc(categoryName)}`, `${esc(playerName)}'s Ice Time`)}
    <p style="margin:14px auto 26px;max-width:420px;font-size:14.5px;color:#5b606b;line-height:1.7;text-align:center;">${intro}</p>
    <div style="border-radius:18px;overflow:hidden;background:#0f0f12;background-image:radial-gradient(150% 220% at 88% 0%, #221f17 0%, #141416 55%, #0d0d0f 100%);border:1px solid rgba(200,161,58,0.28);box-shadow:0 22px 50px -34px rgba(10,12,16,0.7);">
      <div style="padding:30px 28px;text-align:center;">
        <div style="font-size:10px;letter-spacing:0.26em;text-transform:uppercase;color:${GOLD};font-weight:700;">${sessionLabel || "Evaluation Session"}</div>
        <div style="font-family:${SERIF_FONT};font-size:26px;font-weight:800;color:#ffffff;margin:12px 0 0;line-height:1.2;">${date || "Date to be confirmed"}</div>
        <div style="width:30px;height:1px;background:rgba(200,161,58,0.55);margin:18px auto;"></div>
        <div style="font-size:15px;color:#e9e5dc;font-weight:600;">${time || "Time to be confirmed"}</div>
        <div style="font-size:13.5px;color:#a7abb4;margin-top:6px;">${location || "Location to be confirmed"}</div>
      </div>
    </div>
    ${calendarLink}
  `);
}

// ── Parent paywall delivery: "your child's report is ready" + preview/buy CTA ──
// fromLine reads "<SP> on behalf of <Association>" when an SP name is provided.
export function parentReportEmailHtml({ playerName: _pn, orgName: _on, spName: _sp, reportUrl, priceStr }) {
  const playerName = esc(_pn), orgName = esc(_on), spName = _sp ? esc(_sp) : _sp;
  const fromLine = spName ? `${spName} on behalf of ${orgName}` : orgName;
  return emailWrapper(`
    ${emailHeader(fromLine, `${esc(playerName)}'s Development Report is ready`)}
    <p style="margin:14px auto 22px;max-width:444px;font-size:14.5px;color:#5b606b;line-height:1.7;text-align:center;">${esc(playerName)}'s evaluation is complete. The Development Report shows where they stand against the group, how they progressed session over session, what the evaluators saw, and a clear plan of exactly what to work on first.</p>
    ${infoCard("Inside the full report", `<div style="font-size:13px;color:#4a4f57;line-height:1.95;">
        Objective testing vs the group &nbsp;·&nbsp; Skill profile with interpretation<br/>
        Session-by-session progress &nbsp;·&nbsp; Every evaluator note<br/>
        A personalized development plan &nbsp;·&nbsp; Downloadable PDF
      </div>`)}
    <div style="text-align:center;margin:8px 0 0;">${btn(reportUrl, "View the report")}</div>
    <p style="margin:18px 0 0;font-size:12px;color:${MUTED};text-align:center;line-height:1.6;">Open a free preview now; unlock the full report for ${priceStr}. Secure payment via Stripe — no account needed.</p>
  `);
}

export async function sendParentReportEmail({ to, playerName, orgName, spName, reportUrl, priceStr }) {
  const html = parentReportEmailHtml({ playerName, orgName, spName, reportUrl, priceStr });
  return sendEmail(to, `${playerName}'s Development Report — ${orgName}`, html);
}

// Placement note when a player is moved out of a division and re-registered at
// another level. Callers pass `message`/`subject` already resolved (org override
// or the built-in default from emailTemplateDefaults) and already merged.
//
// The copy is addressed to the player — kids read these over a parent's shoulder
// — so it is left-aligned like a letter rather than centred like a notice, and
// blank lines are honoured as paragraphs.
export async function emailPlayerCut({ to, playerName, orgName, message, subject }) {
  // The body is admin-authored: escape first, then re-apply our own formatting,
  // so an override can't inject markup or links.
  const paragraphs = esc(message || "")
    .split(/\n\s*\n/)
    .filter(p => p.trim())
    .map(p => `<p style="margin:0 0 15px;font-size:14.5px;color:#5b606b;line-height:1.75;text-align:left;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  const html = emailWrapper(`
    ${emailHeader(`${esc(orgName)} &middot; Evaluation Update`, `An update on ${esc(playerName)}`)}
    <div style="margin:18px auto 0;max-width:430px;">${paragraphs}</div>
    <p style="margin:22px auto 0;max-width:420px;font-size:12.5px;color:${MUTED};text-align:center;line-height:1.6;">Questions? Simply reply to ${esc(orgName)}.</p>
  `);
  return sendEmail(to, subject || `Evaluation update — ${orgName}`, html);
}
