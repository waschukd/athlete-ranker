// Remove an evaluator from the pool: release their upcoming sessions, end their
// Competitive Thread membership, kill their login, and tell them.
//
//   node scripts/remove-evaluator.mjs --user 254                  (dry run)
//   node scripts/remove-evaluator.mjs --user 254 --commit         (database only)
//   node scripts/remove-evaluator.mjs --user 254 --commit --send  (and email them)
//
// --commit and --send are deliberately separate. The database changes are
// recoverable; the email is not, so it never goes out as a side effect of
// running this.
//
// Sessions are set to 'released', NOT 'cancelled'. In this schema 'cancelled'
// means the evaluator pulled out themselves and 'released' means we took them
// off. Using the wrong one would leave a record saying this person bailed on
// nine sessions when they bailed on one.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { sendEmail, emailWrapper, esc } from "../src/lib/email.js";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);

const arg = (flag) => { const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : null; };
const COMMIT = process.argv.includes("--commit");
const SEND = process.argv.includes("--send");
const USER_ID = parseInt(arg("--user"));
if (!USER_ID) { console.error("Usage: --user <id> [--commit] [--send]"); process.exit(1); }

const [user] = await sql`SELECT id, name, email, role, is_suspended FROM users WHERE id = ${USER_ID}`;
if (!user) { console.error(`No user ${USER_ID}`); process.exit(1); }
console.log(`${user.name} <${user.email}>  role=${user.role}  suspended=${user.is_suspended}\n`);

// Only sessions they are still ON, and only ones that have not happened yet.
// A past session is part of the record and is left exactly as it is.
const upcoming = await sql`
  SELECT ess.id AS signup_id, es.id AS schedule_id, es.scheduled_date, es.start_time,
         es.session_number, es.group_number, es.location, es.evaluators_required,
         c.name AS cat, o.name AS org
  FROM evaluator_session_signups ess
  JOIN evaluation_schedule es ON es.id = ess.schedule_id
  JOIN age_categories c ON c.id = es.age_category_id
  JOIN organizations o ON o.id = c.organization_id
  WHERE ess.user_id = ${USER_ID}
    AND ess.status = 'signed_up'
    AND es.scheduled_date >= CURRENT_DATE
  ORDER BY es.scheduled_date, es.start_time`;

// The driver hands back a Date for a date column, and String(date) is
// "Mon Sep 07 2026 ..." -- slicing 10 chars off that gives "Mon Sep 07", which
// parses to Invalid Date. Take the ISO day directly when it is already a Date.
const isoDay = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const fmtDate = (d) => new Date(isoDay(d) + "T00:00:00")
  .toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const fmtTime = (t) => (t ? String(t).slice(0, 5) : "");

console.log(`upcoming sessions to release (${upcoming.length}):`);
for (const s of upcoming) {
  console.log(`  ${fmtDate(s.scheduled_date)} ${fmtTime(s.start_time)}  ${s.org} / ${s.cat} S${s.session_number} G${s.group_number}`);
}

// Coverage left behind. Removing someone three days out can leave a session
// with nobody on it, and that is the association's problem to solve, not a
// detail to discover on the day.
console.log(`\ncoverage left on those sessions:`);
const gaps = [];
for (const s of upcoming) {
  const others = await sql`
    SELECT u.name FROM evaluator_session_signups ess
    JOIN users u ON u.id = ess.user_id
    WHERE ess.schedule_id = ${s.schedule_id} AND ess.user_id <> ${USER_ID} AND ess.status = 'signed_up'`;
  const req = s.evaluators_required ?? 0;
  const short = req - others.length;
  if (short > 0) gaps.push({ ...s, remaining: others.length, short });
  console.log(`  ${fmtDate(s.scheduled_date)} ${s.org} / ${s.cat}: needs ${req}, ${others.length} left` +
    (short > 0 ? `  SHORT ${short}${others.length === 0 ? " -- NOBODY" : ""}` : ""));
}

const memberships = await sql`
  SELECT em.id, em.organization_id, em.status, em.is_evaluator, o.name AS org
  FROM evaluator_memberships em JOIN organizations o ON o.id = em.organization_id
  WHERE em.user_id = ${USER_ID}`;
console.log(`\nmemberships: ${memberships.map(m => `${m.org} (${m.status})`).join(", ") || "none"}`);

const [{ acct }] = await sql`SELECT COUNT(*)::int AS acct FROM auth_accounts WHERE "userId" = (SELECT id FROM auth_users WHERE email = ${user.email})`;
const [{ sess }] = await sql`SELECT COUNT(*)::int AS sess FROM auth_sessions WHERE "userId" = (SELECT id FROM auth_users WHERE email = ${user.email})`;
console.log(`credentials: ${acct} account row(s), ${sess} live session(s)`);

// ── The email ──────────────────────────────────────────────────────────────
const rows = upcoming.map(s => `
  <tr>
    <td style="padding:7px 0;font-size:13px;color:#4a4f57;border-bottom:1px solid #f0eee9;">
      <strong style="color:#14161a;">${esc(fmtDate(s.scheduled_date))}${s.start_time ? " · " + esc(fmtTime(s.start_time)) : ""}</strong><br/>
      ${esc(s.org)} — ${esc(s.cat)}, Session ${esc(s.session_number)}${s.group_number ? " Group " + esc(s.group_number) : ""}${s.location ? " · " + esc(s.location) : ""}
    </td>
  </tr>`).join("");

const subject = "Your evaluator status with Competitive Thread";
const html = emailWrapper(`
  <p style="margin:0 0 16px;font-size:15px;color:#14161a;line-height:1.6;">Hi ${esc(user.name.split(" ")[0])},</p>
  <p style="margin:0 0 16px;font-size:14px;color:#4a4f57;line-height:1.7;">
    Thank you for your efforts with Competitive Thread. Following your cancellation of the
    Edmonton Female Hockey Alliance U13 HP session on September 7, Dan has decided to remove you
    from the evaluator pool.
  </p>
  <p style="margin:0 0 16px;font-size:14px;color:#4a4f57;line-height:1.7;">
    You have been taken off the following upcoming sessions, and no longer need to attend them:
  </p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${rows}</table>
  <p style="margin:0 0 16px;font-size:14px;color:#4a4f57;line-height:1.7;">
    Your Sideline Star access has been closed. If you believe this is in error, reply to this email
    and it will reach Dan directly.
  </p>
  <p style="margin:0;font-size:14px;color:#4a4f57;line-height:1.7;">Competitive Thread</p>
`);

console.log(`\n─── EMAIL ───────────────────────────────────────`);
console.log(`To:      ${user.email}`);
console.log(`Subject: ${subject}`);
console.log(html.replace(/<[^>]+>/g, "").replace(/\n\s*\n+/g, "\n").split("\n").map(l => l.trim()).filter(Boolean).join("\n"));
console.log(`─────────────────────────────────────────────────`);

if (!COMMIT) {
  console.log("\nDRY RUN -- nothing changed, nothing sent. Add --commit (and --send to email).");
  process.exit(0);
}

// ── Apply ──────────────────────────────────────────────────────────────────
const released = await sql`
  UPDATE evaluator_session_signups SET status = 'released'
  WHERE user_id = ${USER_ID} AND status = 'signed_up'
    AND schedule_id IN (SELECT id FROM evaluation_schedule WHERE scheduled_date >= CURRENT_DATE)
  RETURNING id`;
console.log(`\nreleased ${released.length} session sign-up(s)`);

const mem = await sql`
  UPDATE evaluator_memberships SET status = 'deleted', is_evaluator = false
  WHERE user_id = ${USER_ID} RETURNING id`;
console.log(`ended ${mem.length} membership(s)`);

// Kill the login: suspend the account, drop the password so it cannot be used,
// clear live sessions, and remove any outstanding reset token -- otherwise a
// pending reset link would hand the account straight back.
await sql`UPDATE users SET is_suspended = true WHERE id = ${USER_ID}`;
const [au] = await sql`SELECT id FROM auth_users WHERE email = ${user.email}`;
if (au) {
  const da = await sql`DELETE FROM auth_accounts WHERE "userId" = ${au.id} RETURNING id`;
  const ds = await sql`DELETE FROM auth_sessions WHERE "userId" = ${au.id} RETURNING id`;
  console.log(`suspended user, removed ${da.length} credential row(s), ${ds.length} live session(s)`);
}
try {
  const dt = await sql`DELETE FROM password_reset_tokens WHERE email = ${user.email} RETURNING id`;
  console.log(`cleared ${dt.length} pending password reset token(s)`);
} catch (e) { console.log(`(password_reset_tokens: ${e.message})`); }

if (SEND) {
  const res = await sendEmail(user.email, subject, html);
  console.log(`\nemail to ${user.email}: ${res?.ok ? "sent" : "FAILED — " + (res?.error || "unknown")}`);
} else {
  console.log(`\nEmail NOT sent (no --send).`);
}

if (gaps.length) {
  console.log(`\n${gaps.length} session(s) now short an evaluator:`);
  for (const g of gaps) {
    console.log(`  ${fmtDate(g.scheduled_date)}  ${g.org} / ${g.cat} S${g.session_number} G${g.group_number} — ${g.remaining} of ${g.evaluators_required}${g.remaining === 0 ? "  NOBODY ASSIGNED" : ""}`);
  }
}
