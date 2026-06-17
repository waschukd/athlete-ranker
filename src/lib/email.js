const FROM = process.env.EMAIL_FROM || "noreply@sidelinestar.com";
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

export function emailWrapper(content) {
  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;padding:0;background:#fbfbf9;font-family:${BODY_FONT};-webkit-font-smoothing:antialiased;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fbfbf9;padding:40px 20px;">
      <tr><td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ededeb;border-radius:16px;overflow:hidden;box-shadow:0 20px 50px -34px rgba(10,12,16,0.3);">
          <tr>
            <td style="background:#0b5cd6;padding:30px 40px;text-align:center;">
              <div style="font-family:${DISPLAY_FONT};font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-0.6px;">Sideline Star</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.82);margin-top:4px;letter-spacing:0.16em;text-transform:uppercase;font-weight:600;">Athlete Evaluation Platform</div>
            </td>
          </tr>
          <tr><td style="padding:36px 40px;">${content}</td></tr>
          <tr>
            <td style="padding:16px 40px;border-top:1px solid #ededeb;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9aa0aa;">© Sideline Star · sidelinestar.com</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>`;
}

function btn(url, label) {
  return `<a href="${url}" style="display:inline-block;font-family:${DISPLAY_FONT};padding:14px 30px;background:#0b5cd6;color:#ffffff;text-decoration:none;border-radius:99px;font-size:14px;font-weight:700;letter-spacing:0.01em;">${label}</a>`;
}

function credBox(rows) {
  const rowsHtml = rows.map(([label, value, highlight]) =>
    `<tr>
      <td style="padding:6px 0;font-size:13px;color:#5b606b;width:140px;">${label}</td>
      <td style="padding:6px 0;font-size:13px;font-weight:600;color:#101113;">
        ${highlight ? `<code style="background:#eaf1fe;border:1px solid #c7dcfb;padding:2px 8px;border-radius:6px;color:#0b5cd6;font-weight:700;">${value}</code>` : value}
      </td>
    </tr>`
  ).join("");
  return `<div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:10px;padding:16px 20px;margin:20px 0;">
    <table width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
  </div>`;
}

// ── Welcome emails ────────────────────────────────────────────────────────────

export async function emailWelcomeAssociation({ name, email, tempPassword, orgName }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Welcome to Sideline Star</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${name}</strong>, your association account for <strong style="color:#111827;">${orgName}</strong> has been created.</p>
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
    <p style="margin:0 0 20px;font-size:14px;color:#5b606b;line-height:1.6;">Hi <strong style="color:#101113;">${name || "there"}</strong>, you've been invited to manage <strong style="color:#101113;">${orgName}</strong> as a ${kind} on Sideline Star. Click below to set your password and finish setting up your account.</p>
    <div style="text-align:center;margin:28px 0;">${btn(inviteUrl, "Finish setting up →")}</div>
    <p style="font-size:12px;color:#9aa0aa;text-align:center;margin:0;">This link expires in 7 days. If you didn't expect this invitation, you can ignore it.</p>
  `);
  return await sendEmail(email, `You're invited to manage ${orgName} on Sideline Star`, html);
}

export async function emailEvaluatorApproved({ name, email, orgName, evaluatorId }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">You've been approved!</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${name}</strong>, your evaluator application for <strong style="color:#111827;">${orgName}</strong> has been approved.</p>
    ${credBox([["Evaluator ID", evaluatorId], ["Organization", orgName]])}
    <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">Sign in to view your upcoming sessions.</p>
    ${btn(`${BASE_URL}/evaluator/dashboard`, "View My Dashboard →")}
  `);
  await sendEmail(email, `Approved — ${orgName} Evaluator`, html);
}

export async function emailEvaluatorDenied({ name, email, orgName }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Application Update</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${name}</strong>, unfortunately your evaluator application for <strong style="color:#111827;">${orgName}</strong> was not approved at this time.</p>
    <p style="font-size:13px;color:#6b7280;">If you believe this is an error, please contact the organization directly.</p>
  `);
  await sendEmail(email, `Application Update — ${orgName}`, html);
}

export async function emailEvaluatorPendingApproval({ adminEmail, adminName, evalName, evalEmail, orgName }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">New Evaluator Application</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${adminName}</strong>, a new evaluator has applied to join <strong style="color:#111827;">${orgName}</strong>.</p>
    ${credBox([["Name", evalName], ["Email", evalEmail]])}
    <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">Review and approve or deny their application.</p>
    ${btn(`${BASE_URL}/service-provider/dashboard`, "Review Application →")}
  `);
  await sendEmail(adminEmail, `New Evaluator Application — ${orgName}`, html);
}

export async function emailSPLinkedToAssociation({ spAdminEmail, spAdminName, spName, assocName }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">New Association Linked</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${spAdminName}</strong>, <strong style="color:#111827;">${assocName}</strong> has been linked to <strong style="color:#111827;">${spName}</strong> on Sideline Star.</p>
    ${btn(`${BASE_URL}/service-provider/dashboard`, "View Dashboard →")}
  `);
  await sendEmail(spAdminEmail, `New Association Linked — ${assocName}`, html);
}

export async function emailStrike1({ name, email, orgName, sessionDate }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#f59e0b;">Late Cancellation Warning</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${name}</strong>, you have received <strong style="color:#f59e0b;">Strike 1</strong> for cancelling within 24 hours of your session on <strong>${sessionDate}</strong> with <strong>${orgName}</strong>.</p>
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
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${name}</strong>, your evaluator account with <strong style="color:#111827;">${orgName}</strong> has been suspended following a second late cancellation.</p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
      <p style="margin:0;font-size:13px;color:#991b1b;">Please contact ${orgName} directly to discuss reinstatement.</p>
    </div>
  `);
  await sendEmail(email, `Account Suspended — ${orgName}`, html);
}

// ── Staffing / Session Reports ────────────────────────────────────────────────

export async function emailLateCancel48hr({ adminEmail, adminName, evalName, sessionDate, sessionTime, groupName, orgName, spotsOpen, remainingEvals }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#dc2626;">Evaluator Cancelled — Under 48 Hours</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${adminName}</strong>, an evaluator has cancelled with less than 48 hours notice.</p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;width:140px;">Evaluator</td><td style="font-size:13px;font-weight:600;color:#111827;">${evalName}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Session</td><td style="font-size:13px;font-weight:600;color:#111827;">${groupName} — ${sessionDate} ${sessionTime}</td></tr>
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
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">${orgName} · ${sessions.length} sessions this week</p>
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
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;"><strong style="color:#111827;">${orgName}</strong> has open evaluator spots. Sign up through your dashboard.</p>
    ${rows}
    ${btn(`${BASE_URL}/evaluator/dashboard`, "View & Sign Up →")}
    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">Sent by ${adminName} · ${orgName}</p>
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
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Welcome to ${categoryName} Evaluations</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
      <strong style="color:#111827;">${playerName}</strong> is registered for evaluations with <strong style="color:#111827;">${orgName}</strong>. Here's what you need to know.
    </p>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin:0 0 24px;">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;margin-bottom:12px;">What to Expect</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:6px 0;font-size:13px;color:#374151;">📋 <strong>Multiple evaluation sessions</strong> — athletes are scored by professional evaluators across several sessions</td></tr>
        <tr><td style="padding:6px 0;font-size:13px;color:#374151;">👥 <strong>Group assignments</strong> — players are organized into groups. You'll receive your child's specific schedule before sessions begin</td></tr>
        <tr><td style="padding:6px 0;font-size:13px;color:#374151;">⭐ <strong>Live scoring</strong> — evaluators score each player in real-time on key skill categories</td></tr>
        <tr><td style="padding:6px 0;font-size:13px;color:#374151;">📊 <strong>Rankings update automatically</strong> — scores are compiled and rankings adjust after each session</td></tr>
      </table>
    </div>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:20px 24px;margin:0 0 24px;">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#92400e;margin-bottom:12px;">Tips for Parents</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;font-size:13px;color:#78350f;">• Arrive at least 15 minutes early for check-in</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#78350f;">• Ensure proper equipment is ready (helmet stickers or jersey numbers will be assigned)</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#78350f;">• Hydration and nutrition — make sure your athlete is fueled and hydrated</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#78350f;">• Trust the process — evaluators are trained professionals looking at the full picture</td></tr>
      </table>
    </div>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px 24px;margin:0 0 24px;">
      <div style="font-size:14px;font-weight:600;color:#166534;margin-bottom:6px;">📄 Player Reports Available After Evaluations</div>
      <p style="margin:0;font-size:13px;color:#15803d;line-height:1.6;">
        At the end of the evaluation process, you'll have the option to purchase a comprehensive player report. It includes the collective feedback from all evaluators, an AI-compiled scouting analysis, and personalized development suggestions for your athlete.
      </p>
    </div>

    <p style="font-size:12px;color:#9ca3af;margin:0;">You'll receive another email with ${playerName}'s specific schedule once groups are assigned.</p>
  `);
}

export function parentScheduleHtml({ playerName: _pn, categoryName: _cn, orgName: _on, sessions }) {
  const playerName = esc(_pn), categoryName = esc(_cn), orgName = esc(_on);
  const rows = sessions.map(s => `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 0;font-size:13px;color:#111827;font-weight:600;">S${s.session_number}</td>
      <td style="padding:10px 0;font-size:13px;color:#111827;">Group ${s.group_number}</td>
      <td style="padding:10px 0;font-size:13px;color:#6b7280;">${s.date || "TBD"}</td>
      <td style="padding:10px 0;font-size:13px;color:#6b7280;">${s.time || "TBD"}</td>
      <td style="padding:10px 0;font-size:13px;color:#6b7280;">${esc(s.location) || "TBD"}</td>
    </tr>
  `).join("");

  return emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Evaluation Schedule</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
      Here's <strong style="color:#111827;">${playerName}</strong>'s upcoming evaluation schedule for <strong style="color:#111827;">${categoryName}</strong> at <strong style="color:#111827;">${orgName}</strong>.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f3f4f6;">
      <tr style="background:#f9fafb;">
        <th style="padding:8px 0;font-size:11px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;">Session</th>
        <th style="padding:8px 0;font-size:11px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;">Group</th>
        <th style="padding:8px 0;font-size:11px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;">Date</th>
        <th style="padding:8px 0;font-size:11px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;">Time</th>
        <th style="padding:8px 0;font-size:11px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;">Location</th>
      </tr>
      ${rows}
    </table>

    <div style="margin-top:24px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;">
      <p style="margin:0;font-size:13px;color:#374151;">📎 A calendar invite is attached to this email. Open it to add these sessions to your calendar.</p>
    </div>

    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">Please arrive 15 minutes early for check-in. Check-in details will be provided at the venue.</p>
  `);
}

// Group-assignment alert: tells a parent which group their athlete is in for a
// specific session, with the rink/date/time. Sent from the Groups page once the
// director has set the groups for a session.
export function groupAssignmentHtml({ playerName: _pn, categoryName: _cn, orgName: _on, sessionLabel: _sl, groupNumber, date, time, location: _loc }) {
  const playerName = esc(_pn), categoryName = esc(_cn), orgName = esc(_on), sessionLabel = esc(_sl), location = esc(_loc);
  const rows = [
    ["Group", `Group ${groupNumber}`, true],
    ["Session", sessionLabel || "—"],
    ["Date", date || "TBD"],
    ["Time", time || "TBD"],
    ["Location", location || "TBD"],
  ];
  return emailWrapper(`
    <h2 style="margin:0 0 6px;font-family:${DISPLAY_FONT};font-size:22px;font-weight:800;letter-spacing:-0.4px;color:#101113;">${playerName}'s group assignment</h2>
    <p style="margin:0 0 18px;font-size:14px;color:#5b606b;line-height:1.6;">Here is <strong style="color:#101113;">${playerName}</strong>'s group and ice time for <strong style="color:#101113;">${categoryName}</strong> evaluations with <strong style="color:#101113;">${orgName}</strong>. Please arrive at least 15 minutes early for check-in.</p>
    ${credBox(rows)}
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin:4px 0 0;">
      <p style="margin:0;font-size:13px;color:#374151;">📎 A calendar invite is attached — open it to add this session to your calendar.</p>
    </div>
  `);
}

// ── Parent paywall delivery: "your child's report is ready" + preview/buy CTA ──
// fromLine reads "<SP> on behalf of <Association>" when an SP name is provided.
export function parentReportEmailHtml({ playerName: _pn, orgName: _on, spName: _sp, reportUrl, priceStr }) {
  const playerName = esc(_pn), orgName = esc(_on), spName = _sp ? esc(_sp) : _sp;
  const fromLine = spName ? `${spName} on behalf of ${orgName}` : orgName;
  return emailWrapper(`
    <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#0b5cd6;font-weight:700;margin-bottom:8px;">${fromLine}</div>
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#111827;font-family:${DISPLAY_FONT};">${playerName}'s Development Report is ready</h2>
    <p style="margin:0 0 18px;font-size:14px;color:#5b606b;line-height:1.6;">${playerName}'s evaluation is complete. Their personalized Development Report shows where they stand against the group across objective testing and evaluator scoring, how they progressed session over session, what the evaluators saw, and a clear plan of exactly what to work on first.</p>
    <div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:12px;padding:16px 20px;margin:0 0 22px;font-size:13px;color:#5b606b;line-height:1.9;">
      <b style="color:#111827;">Inside the full report</b><br/>
      ✓ Objective testing vs the group &nbsp; ✓ Skill profile with interpretation<br/>
      ✓ Session-by-session progress &nbsp; ✓ Every evaluator note<br/>
      ✓ A personalized development plan &nbsp; ✓ Downloadable PDF
    </div>
    ${btn(reportUrl, "View the report →")}
    <p style="margin:18px 0 0;font-size:12px;color:#9aa0aa;">Open a free preview now; unlock the full report for ${priceStr}. Secure payment via Stripe, no account needed.</p>
  `);
}

export async function sendParentReportEmail({ to, playerName, orgName, spName, reportUrl, priceStr }) {
  const html = parentReportEmailHtml({ playerName, orgName, spName, reportUrl, priceStr });
  return sendEmail(to, `${playerName}'s Development Report — ${orgName}`, html);
}
