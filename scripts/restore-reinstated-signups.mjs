// Repair sign-ups stranded by the reinstate bug (see the PATCH handler): a
// session was cancelled -- releasing everyone -- then un-cancelled, but the
// sign-ups stayed 'released'. The session comes back with nobody on it, the
// evaluators are never told, and they cannot get in.
//
//   node scripts/restore-reinstated-signups.mjs            # dry run
//   node scripts/restore-reinstated-signups.mjs --commit   # restore + email
//
// Scoped to FUTURE sessions that are not cancelled. Only 'released' is
// restored: a 'cancelled' sign-up is the evaluator's own withdrawal and must
// never be undone for them.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM;

const stranded = await sql`
  SELECT s.id AS signup_id, s.schedule_id, s.user_id, u.name, u.email,
         es.scheduled_date, es.start_time, es.end_time, es.location, es.status AS session_status,
         ac.name AS category, o.name AS org
  FROM evaluator_session_signups s
  JOIN evaluation_schedule es ON es.id = s.schedule_id
  JOIN age_categories ac ON ac.id = es.age_category_id
  JOIN organizations o ON o.id = ac.organization_id
  LEFT JOIN users u ON u.id = s.user_id
  WHERE s.status = 'released'
    AND es.status <> 'cancelled'
    AND es.scheduled_date >= CURRENT_DATE
  ORDER BY es.scheduled_date, es.start_time, u.name`;

if (!stranded.length) { console.log("Nothing stranded — no future session has released sign-ups."); process.exit(0); }

const bySchedule = new Map();
for (const r of stranded) {
  if (!bySchedule.has(r.schedule_id)) bySchedule.set(r.schedule_id, []);
  bySchedule.get(r.schedule_id).push(r);
}

const fmtDate = (d) => new Date(d).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const fmtTime = (t) => { if (!t) return null; const [h, m] = String(t).split(":"); const hr = parseInt(h, 10); return `${((hr + 11) % 12) + 1}:${m} ${hr < 12 ? "AM" : "PM"}`; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

for (const [sid, people] of bySchedule) {
  const s = people[0];
  console.log(`\nschedule ${sid} — ${s.org} · ${s.category} · ${fmtDate(s.scheduled_date)} ${fmtTime(s.start_time)}${s.location ? ` · ${s.location}` : ""} (${s.session_status})`);
  for (const p of people) console.log(`   ${p.name} <${p.email}>`);
}
console.log(`\n${stranded.length} sign-up(s) across ${bySchedule.size} session(s).`);

if (!COMMIT) { console.log("\nDRY RUN — re-run with --commit to restore and email."); process.exit(0); }

let restored = 0, sent = 0, failed = 0;
for (const [sid, people] of bySchedule) {
  const back = await sql`
    UPDATE evaluator_session_signups SET status = 'signed_up'
    WHERE schedule_id = ${sid} AND status = 'released' RETURNING id`;
  restored += back.length;
  console.log(`schedule ${sid}: restored ${back.length}`);

  const s = people[0];
  const when = `${fmtDate(s.scheduled_date)} at ${fmtTime(s.start_time)}`;
  const subject = `Back on — ${s.category} on ${fmtDate(s.scheduled_date)}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#0b8a3e;">Your session is back on</h2>
  <p style="margin:0 0 16px;font-size:14px;color:#5b606b;line-height:1.6;">
    The session below was cancelled and has since been reinstated. <strong style="color:#101113;">Your spot has been restored</strong> — it is back on your schedule and you can score as normal.
  </p>
  <div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:10px;padding:16px 20px;margin:0 0 18px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
      <tr><td style="padding:5px 0;color:#5b606b;width:110px;">Association</td><td style="padding:5px 0;font-weight:600;color:#101113;">${esc(s.org)}</td></tr>
      <tr><td style="padding:5px 0;color:#5b606b;">Division</td><td style="padding:5px 0;font-weight:600;color:#101113;">${esc(s.category)}</td></tr>
      <tr><td style="padding:5px 0;color:#5b606b;">When</td><td style="padding:5px 0;font-weight:600;color:#101113;">${esc(when)}${s.end_time ? ` – ${esc(fmtTime(s.end_time))}` : ""}</td></tr>
      <tr><td style="padding:5px 0;color:#5b606b;">Location</td><td style="padding:5px 0;font-weight:600;color:#101113;">${esc(s.location || "—")}</td></tr>
    </table>
  </div>
  <p style="margin:0;font-size:13px;color:#5b606b;line-height:1.6;">Apologies for the confusion — the reinstatement did not restore spots automatically, and that has been fixed.</p>
  <p style="margin:16px 0 0;font-size:13px;"><a href="https://www.sidelinestar.com/evaluator/dashboard" style="color:#0b5cd6;font-weight:600;">Open your schedule</a></p>
</div>`;

  for (const p of people) {
    if (!p.email) { console.log(`   no email for ${p.name} — skipped`); continue; }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: p.email, subject, html }),
      });
      if (res.ok) { sent++; console.log(`   SENT ${p.email}`); }
      else { failed++; console.log(`   FAIL ${p.email} — ${res.status} ${await res.text()}`); }
    } catch (e) { failed++; console.log(`   FAIL ${p.email} — ${e.message}`); }
  }
}
console.log(`\nrestored ${restored}, emailed ${sent}, failed ${failed}`);
