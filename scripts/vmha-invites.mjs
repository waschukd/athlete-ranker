// VMHA (org 70) admin + director invites.
//
//   node scripts/vmha-invites.mjs            (preview)
//   node scripts/vmha-invites.mjs --commit
//
// Admins (whole association): Dylan Yungblut -- his first invite expired on
// Sep 18 unaccepted, so this issues a fresh 7-day token -- and Sean Tennant.
// Directors, each scoped to their own division only:
//
//   U11 F   Paul Hopaluk
//   U11 M   Stacey Ruller
//   U13 M   Shayne Sweeney
//
// The two invite types accept at DIFFERENT urls -- admins at /accept-invite
// (which reads admin_invites) and directors at /director/accept-invite (which
// reads director_invites). Sending a director the admin link produces a flat
// "Invalid or expired invite" with a perfectly good token behind it, which is
// exactly what happened on the first send. Both pages are set-your-own-
// password; no temporary password is ever mailed. Re-running is
// safe: the invite row is keyed on (email, organization_id) and a re-run just
// refreshes the token and resends.
import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const FROM = process.env.EMAIL_FROM || "updates@sidelinestar.com";
const KEY = process.env.RESEND_API_KEY;
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";

const ORG = 70, ORG_NAME = "VMHA";
// --directors-only resends just the three division invites (used after the
// wrong-url send); --keep-token reuses the existing token instead of issuing
// a new one, so a link already given out by phone stays valid.
const DIRECTORS_ONLY = process.argv.includes("--directors-only");
const KEEP_TOKEN = process.argv.includes("--keep-token");

const ADMINS = [
  { name: "Dylan Yungblut", email: "dylan_yungblut@cargill.com" },
  { name: "Sean Tennant", email: "vmha.pres1@gmail.com" },
];
const DIRECTORS = [
  { name: "Paul Hopaluk", email: "vmhatigersu11f@gmail.com", cats: [140], label: "U11 F" },
  { name: "Stacey Ruller", email: "vmhatigersu11@gmail.com", cats: [141], label: "U11 M" },
  { name: "Shayne Sweeney", email: "vmhatigersu13@gmail.com", cats: [142], label: "U13 M" },
];

const cats = await sql`SELECT id, name FROM age_categories WHERE organization_id = ${ORG}`;
const catName = new Map(cats.map(c => [c.id, c.name]));
console.log(`${ORG_NAME} invites\n`);
console.log("ADMIN (full association access):");
for (const a of ADMINS) {
  const [u] = await sql`SELECT id, name FROM users WHERE lower(email) = ${a.email}`;
  const [inv] = await sql`SELECT status, expires_at FROM admin_invites WHERE organization_id = ${ORG} AND lower(email) = ${a.email}`;
  const state = u ? "has an account" : inv ? `invite ${inv.status}, expired ${new Date(inv.expires_at) < new Date() ? "yes" : "no"}` : "new";
  console.log(`   ${a.name.padEnd(18)} ${a.email.padEnd(32)} (${state})`);
}
console.log("\nDIRECTOR (their division only):");
for (const d of DIRECTORS) {
  const [u] = await sql`SELECT id FROM users WHERE lower(email) = ${d.email}`;
  console.log(`   ${d.name.padEnd(18)} ${d.email.padEnd(32)} ${d.cats.map(c => catName.get(c)).join(", ")} ${u ? "(has an account)" : "(new)"}`);
}

if (!COMMIT) { console.log("\nPREVIEW ONLY -- nothing written, nothing sent. Re-run with --commit."); process.exit(0); }
if (!KEY) { console.error("RESEND_API_KEY missing -- cannot send."); process.exit(1); }

const send = async (to, subject, html) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  return res.ok;
};

const shell = (heading, intro, bullets, url, cta) => `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:540px;margin:0 auto;padding:36px 22px;">
  <div style="font-size:19px;font-weight:800;color:#0b5cd6;margin-bottom:22px;">Sideline Star</div>
  <h2 style="margin:0 0 8px;font-size:21px;color:#101113;">${heading}</h2>
  <p style="margin:0 0 16px;font-size:14px;color:#5b606b;line-height:1.6;">${intro}</p>
  ${bullets ? `<ul style="margin:0 0 20px;padding-left:20px;font-size:14px;color:#374151;line-height:1.8;">${bullets}</ul>` : ""}
  <a href="${url}" style="display:inline-block;padding:13px 30px;background:#0b5cd6;color:#fff;text-decoration:none;border-radius:9px;font-size:15px;font-weight:600;">${cta}</a>
  <p style="margin:16px 0 0;font-size:12px;color:#8a8f98;">Or paste this link into your browser:<br><span style="word-break:break-all;color:#0b5cd6;">${url}</span></p>
  <p style="margin:22px 0 0;font-size:12px;color:#9ca3af;">This link is valid for 7 days. You will set your own password when you open it.</p>
</div>`;

const expires = new Date(Date.now() + 7 * 864e5);

for (const a of DIRECTORS_ONLY ? [] : ADMINS) {
  const token = randomBytes(32).toString("hex");
  await sql`
    INSERT INTO admin_invites (organization_id, email, name, token, expires_at, status)
    VALUES (${ORG}, ${a.email}, ${a.name}, ${token}, ${expires}, 'pending')
    ON CONFLICT (email, organization_id) DO UPDATE SET token = ${token}, expires_at = ${expires}, status = 'pending', created_at = NOW()`;
  const url = `${BASE}/accept-invite?token=${token}`;
  const ok = await send(a.email, `You've been invited to manage ${ORG_NAME} on Sideline Star`,
    shell("Association admin access",
      `Hi ${a.name.split(" ")[0]}, you've been given full admin access to <strong>${ORG_NAME}</strong> on Sideline Star — every division, the schedule, rosters, evaluator staffing and results.`,
      cats.map(c => `<li>${c.name}</li>`).join(""), url, "Set up my account →"));
  console.log(`${ok ? "sent" : "FAILED"} admin invite: ${a.email}`);
}

for (const d of DIRECTORS) {
  const [prior] = KEEP_TOKEN ? await sql`SELECT token FROM director_invites WHERE organization_id = ${ORG} AND lower(email) = ${d.email} AND status = 'pending' AND expires_at > NOW()` : [];
  const token = prior?.token || randomBytes(32).toString("hex");
  await sql`
    INSERT INTO director_invites (organization_id, email, name, category_ids, token, expires_at, status)
    VALUES (${ORG}, ${d.email}, ${d.name}, ${d.cats}, ${token}, ${expires}, 'pending')
    ON CONFLICT (email, organization_id) DO UPDATE SET
      category_ids = ${d.cats}, token = ${token}, expires_at = ${expires}, status = 'pending', created_at = NOW()`;
  const url = `${BASE}/director/accept-invite?token=${token}`;
  const ok = await send(d.email, `You've been invited as ${d.label} director — ${ORG_NAME}`,
    shell("Division director access",
      `Hi ${d.name.split(" ")[0]}, you've been set up as director for <strong>${d.label}</strong> at <strong>${ORG_NAME}</strong>. You'll see your division's roster, groups, check-in and results.`,
      d.cats.map(c => `<li>${catName.get(c)}</li>`).join(""), url, "Set up my account →"));
  console.log(`${ok ? "sent" : "FAILED"} director invite: ${d.email} (${d.label})`);
}
console.log("\ndone.");
process.exit(0);
