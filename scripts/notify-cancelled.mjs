// One-off: email the evaluators who were rostered on a session that was
// cancelled while the notification bug was live (see b1d27e1). Those people
// were released from the session but never told, and it stayed on their
// schedule -- so without this they turn up at the rink.
//
//   node scripts/notify-cancelled.mjs 718 719            # dry run, prints only
//   node scripts/notify-cancelled.mjs 718 719 --commit   # actually sends
//
// Reads production credentials from .env.production.local.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const COMMIT = process.argv.includes("--commit");
const ids = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
if (!ids.length) { console.error("Usage: node scripts/notify-cancelled.mjs <scheduleId...> [--commit]"); process.exit(1); }

const sql = neon(process.env.DATABASE_URL);
const FROM = process.env.EMAIL_FROM || "updates@sidelinestar.com";
const KEY = process.env.RESEND_API_KEY;
if (COMMIT && !KEY) { console.error("RESEND_API_KEY missing — cannot send."); process.exit(1); }

const fmtDate = (d) => new Date(d).toLocaleDateString("en-CA", {
  weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
});
const fmtTime = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(":");
  const hr = parseInt(h, 10);
  return `${((hr + 11) % 12) + 1}:${m} ${hr < 12 ? "AM" : "PM"}`;
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const sessions = await sql`
  SELECT es.id, es.scheduled_date, es.start_time, es.end_time, es.location, es.status,
         es.session_number, ac.name AS category, o.name AS org
  FROM evaluation_schedule es
  JOIN age_categories ac ON ac.id = es.age_category_id
  JOIN organizations o ON o.id = ac.organization_id
  WHERE es.id = ANY(${ids})
  ORDER BY es.scheduled_date, es.start_time`;

if (!sessions.length) { console.error("No such sessions."); process.exit(1); }

let planned = 0, sent = 0, failed = 0;

for (const s of sessions) {
  if (s.status !== "cancelled") {
    console.log(`\n!! schedule ${s.id} is "${s.status}", not cancelled — SKIPPING`);
    continue;
  }
  // Everyone who held a spot, whatever the release left behind.
  const people = await sql`
    SELECT DISTINCT u.email, u.name
    FROM evaluator_session_signups ess
    JOIN users u ON u.id = ess.user_id
    WHERE ess.schedule_id = ${s.id} AND ess.status <> 'cancelled' AND u.email IS NOT NULL
    ORDER BY u.name`;

  const when = `${fmtDate(s.scheduled_date)}${s.start_time ? ` at ${fmtTime(s.start_time)}` : ""}`;
  console.log(`\n=== schedule ${s.id} — ${s.org} · ${s.category} · ${when}${s.location ? ` · ${s.location}` : ""}`);
  console.log(`    recipients (${people.length}):`);
  for (const p of people) console.log(`      ${p.name} <${p.email}>`);

  const subject = `CANCELLED — ${s.category} on ${fmtDate(s.scheduled_date)}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#d23b3b;">Session cancelled</h2>
  <p style="margin:0 0 16px;font-size:14px;color:#5b606b;line-height:1.6;">
    The session below has been cancelled by ${esc(s.org)}. You were signed up for it — <strong style="color:#101113;">please do not attend</strong>.
  </p>
  <div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:10px;padding:16px 20px;margin:0 0 18px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
      <tr><td style="padding:5px 0;color:#5b606b;width:110px;">Association</td><td style="padding:5px 0;font-weight:600;color:#101113;">${esc(s.org)}</td></tr>
      <tr><td style="padding:5px 0;color:#5b606b;">Division</td><td style="padding:5px 0;font-weight:600;color:#101113;">${esc(s.category)}</td></tr>
      <tr><td style="padding:5px 0;color:#5b606b;">Date</td><td style="padding:5px 0;font-weight:600;color:#101113;">${esc(fmtDate(s.scheduled_date))}</td></tr>
      <tr><td style="padding:5px 0;color:#5b606b;">Time</td><td style="padding:5px 0;font-weight:600;color:#101113;">${esc(fmtTime(s.start_time))}${s.end_time ? ` – ${esc(fmtTime(s.end_time))}` : ""}</td></tr>
      <tr><td style="padding:5px 0;color:#5b606b;">Location</td><td style="padding:5px 0;font-weight:600;color:#101113;">${esc(s.location || "—")}</td></tr>
    </table>
  </div>
  <p style="margin:0 0 8px;font-size:13px;color:#5b606b;line-height:1.6;">
    Your spot has been released and no action is needed. Apologies for the late notice — this cancellation was not delivered when it happened, and your other sessions are unaffected.
  </p>
  <p style="margin:16px 0 0;font-size:13px;color:#5b606b;">
    <a href="https://www.sidelinestar.com/evaluator/dashboard" style="color:#0b5cd6;font-weight:600;">Check your schedule</a>
  </p>
</div>`;

  for (const p of people) {
    planned++;
    if (!COMMIT) continue;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: p.email, subject, html }),
      });
      if (res.ok) { sent++; console.log(`      SENT  ${p.email}`); }
      else { failed++; console.log(`      FAIL  ${p.email} — ${res.status} ${await res.text()}`); }
    } catch (e) { failed++; console.log(`      FAIL  ${p.email} — ${e.message}`); }
  }
}

console.log(COMMIT
  ? `\nsent ${sent}, failed ${failed}`
  : `\nDRY RUN — ${planned} emails would be sent. Re-run with --commit to send.`);
