// Send a sample of the release letter exactly as a family would receive it.
//
//   node scripts/send-cut-email-sample.mjs                       # dry run
//   node scripts/send-cut-email-sample.mjs --commit              # send
//   node scripts/send-cut-email-sample.mjs --commit --to a@b.c --org 49 --cat 115
//
// Fidelity matters here, so the wrapper/header/paragraph markup below is copied
// verbatim from src/lib/email.js (emailWrapper, emailHeader, esc, emailPlayerCut)
// rather than approximated -- a plain-node script cannot import those through
// the "@/" alias. The BODY and SUBJECT are resolved from the live database the
// same way the cut route does it, so what arrives is the real copy.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : dflt; };
const COMMIT = process.argv.includes("--commit");
const TO = arg("--to", "dan@competitivethread.com");
const ORG = parseInt(arg("--org", "49"));
const CAT = parseInt(arg("--cat", "115")); // EFHA U18 AA
const KEY = arg("--key", "player_released");

// ── verbatim from src/lib/email.js ──────────────────────────────────────────
const BODY_FONT = "'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF_FONT = "'Playfair Display',Georgia,'Times New Roman',serif";
const GOLD = "#c8a13a", GOLD_DEEP = "#9a7616", INK = "#101113", MUTED = "#8b8f99";
const esc = (v) => String(v ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const emailHeader = (eyebrow, title) => `<div style="text-align:center;margin-bottom:6px;">
      <div style="font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:${GOLD_DEEP};font-weight:700;">${eyebrow}</div>
      <div style="width:34px;height:2px;background:${GOLD};margin:14px auto 0;border-radius:2px;"></div>
    </div>
    <h1 style="margin:18px 0 0;font-family:${SERIF_FONT};font-size:24px;font-weight:900;color:${INK};letter-spacing:-0.2px;text-align:center;line-height:1.25;">${title}</h1>`;
const emailWrapper = (content) => `<!DOCTYPE html>
  <html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Archivo:wght@600;700;800;900&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" /></head>
  <body style="margin:0;padding:0;background:#fbfbf9;font-family:${BODY_FONT};-webkit-font-smoothing:antialiased;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fbfbf9;padding:40px 20px;"><tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ece9e2;border-radius:18px;overflow:hidden;box-shadow:0 24px 60px -34px rgba(10,12,16,0.4);">
        <tr><td style="background:#0f0f12;background-image:radial-gradient(135% 160% at 86% 0%, #221f17 0%, #141416 46%, #0c0c0e 100%);padding:36px 40px;text-align:center;border-bottom:1px solid rgba(200,161,58,0.30);">
          <div style="font-family:${SERIF_FONT};font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.2px;">Sideline Star</div>
          <div style="font-size:10px;color:${GOLD};margin-top:8px;letter-spacing:0.3em;text-transform:uppercase;font-weight:700;">Athlete Evaluation Platform</div>
        </td></tr>
        <tr><td style="padding:38px 40px;">${content}</td></tr>
        <tr><td style="padding:18px 40px;border-top:1px solid #ece9e2;text-align:center;background:#fbfaf7;">
          <p style="margin:0;font-size:11px;color:#9aa0aa;">© <span style="font-family:${SERIF_FONT};color:${GOLD_DEEP};font-weight:700;">Sideline Star</span> · sidelinestar.com</p>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
const renderTemplate = (str, vars) =>
  (str || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
// ── end verbatim ────────────────────────────────────────────────────────────

const [org] = await sql`SELECT id, name FROM organizations WHERE id = ${ORG}`;
const [cat] = await sql`SELECT id, name FROM age_categories WHERE id = ${CAT}`;
const [tpl] = await sql`SELECT subject, body_html FROM email_templates WHERE organization_id=${ORG} AND template_key=${KEY}`;
if (!tpl) { console.error(`No saved ${KEY} template for org ${ORG}`); process.exit(1); }

// A real athlete's name, so the sample reads like the genuine article. Their
// family is NOT emailed -- the sample goes only to --to.
const [athlete] = await sql`
  SELECT first_name, last_name, parent_email, parent_email_2 FROM athletes
  WHERE age_category_id = ${CAT} AND is_active = true AND NULLIF(TRIM(parent_email),'') IS NOT NULL
  ORDER BY last_name LIMIT 1`;

const playerName = `${athlete.first_name} ${athlete.last_name}`.trim();
const orgName = org.name;
const vars = { player_name: athlete.first_name, org_name: orgName, from_category: cat.name, to_category: "" };

// Default subject, mirroring resolveTemplate's fallback when no override is set.
const DEFAULT_SUBJECT = "Thank you for coming out — {{org_name}}";
const subject = renderTemplate((tpl.subject && tpl.subject.trim()) || DEFAULT_SUBJECT, vars);
const message = renderTemplate(tpl.body_html, vars);

// emailPlayerCut's exact body handling: escape first, then re-apply formatting.
const paragraphs = esc(message)
  .split(/\n\s*\n/).filter(p => p.trim())
  .map(p => `<p style="margin:0 0 15px;font-size:14.5px;color:#5b606b;line-height:1.75;text-align:left;">${p.replace(/\n/g, "<br/>")}</p>`)
  .join("");
const html = emailWrapper(`
    ${emailHeader(`${esc(orgName)} &middot; Evaluation Update`, `An update on ${esc(playerName)}`)}
    <div style="margin:18px auto 0;max-width:430px;">${paragraphs}</div>
    <p style="margin:22px auto 0;max-width:420px;font-size:12.5px;color:${MUTED};text-align:center;line-height:1.6;">Questions? Simply reply to ${esc(orgName)}.</p>
  `);

// Who the REAL send would reach, from parentEmails(): parent_email +
// parent_email_2, deduped case-insensitively.
const seen = new Set();
const realRecipients = [athlete.parent_email, athlete.parent_email_2]
  .map(e => (e || "").trim())
  .filter(e => e && e.includes("@") && !seen.has(e.toLowerCase()) && seen.add(e.toLowerCase()));

console.log(`org            ${org.id} — ${orgName}`);
console.log(`division       ${cat.name}`);
console.log(`template       ${KEY}`);
console.log(`sample player  ${playerName}`);
console.log(`subject        ${subject}`);
console.log(`\nIn a real send this letter would go to ${realRecipients.length} address(es):`);
for (const r of realRecipients) console.log(`  ${r}`);
console.log(`\nSAMPLE goes only to: ${TO}`);

if (!COMMIT) { console.log("\nDRY RUN — re-run with --commit to send."); process.exit(0); }

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from: process.env.EMAIL_FROM, to: TO, subject: `[SAMPLE] ${subject}`, html }),
});
console.log(res.ok ? `\nsent to ${TO}` : `\nFAILED ${res.status} ${await res.text()}`);
