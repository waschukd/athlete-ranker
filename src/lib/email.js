const FROM = process.env.EMAIL_FROM || "noreply@athleteranker.com";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

export async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping email to", to);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
    }
  } catch (e) {
    console.error("Email send failed:", e);
  }
}

function emailWrapper(content) {
  return `<!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
      <tr><td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1A6BFF,#4D8FFF);padding:28px 40px;text-align:center;">
              <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">AthleteRanker</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:3px;">Athlete Evaluation Platform</div>
            </td>
          </tr>
          <tr><td style="padding:36px 40px;">${content}</td></tr>
          <tr>
            <td style="padding:16px 40px;border-top:1px solid #f3f4f6;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">© AthleteRanker · athleteranker.com</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>`;
}

function btn(url, label) {
  return `<a href="${url}" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#1A6BFF,#4D8FFF);color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">${label}</a>`;
}

function credBox(rows) {
  const rowsHtml = rows.map(([label, value, highlight]) =>
    `<tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;width:140px;">${label}</td>
      <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">
        ${highlight ? `<code style="background:#fff7f4;border:1px solid #fed7c3;padding:2px 8px;border-radius:6px;color:#1A6BFF;">${value}</code>` : value}
      </td>
    </tr>`
  ).join("");
  return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin:20px 0;">
    <table width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
  </div>`;
}

// ── Welcome emails ────────────────────────────────────────────────────────────

export async function emailWelcomeServiceProvider({ name, email, tempPassword, orgName }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Welcome to AthleteRanker</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${name}</strong>, your service provider account for <strong style="color:#111827;">${orgName}</strong> has been created.</p>
    ${credBox([["Email", email], ["Temp Password", tempPassword, true]])}
    <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">Sign in and update your password to get started.</p>
    ${btn(`${BASE_URL}/account/signin`, "Sign In to AthleteRanker →")}
  `);
  await sendEmail(email, `Welcome to AthleteRanker — ${orgName}`, html);
}

export async function emailWelcomeAssociation({ name, email, tempPassword, orgName }) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Welcome to AthleteRanker</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${name}</strong>, your association account for <strong style="color:#111827;">${orgName}</strong> has been created.</p>
    ${credBox([["Email", email], ["Temp Password", tempPassword, true]])}
    <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">Sign in and update your password to get started.</p>
    ${btn(`${BASE_URL}/account/signin`, "Sign In to AthleteRanker →")}
  `);
  await sendEmail(email, `Welcome to AthleteRanker — ${orgName}`, html);
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
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${spAdminName}</strong>, <strong style="color:#111827;">${assocName}</strong> has been linked to <strong style="color:#111827;">${spName}</strong> on AthleteRanker.</p>
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

export async function emailDirectorInvite({ name, email, catName, orgName, tempPassword }) {
  const loginUrl = `${BASE_URL}/account/signin`;
  const html = emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">You're invited as a Director</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hi <strong style="color:#111827;">${name}</strong>, you've been assigned as director for <strong style="color:#111827;">${catName}</strong> at <strong style="color:#111827;">${orgName}</strong>.</p>
    ${credBox([["Email", email], ["Temp Password", tempPassword, true]])}
    <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">Please sign in and update your password.</p>
    ${btn(loginUrl, "Sign In to AthleteRanker →")}
  `);
  await sendEmail(email, `Director Invitation — ${catName} at ${orgName}`, html);
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
