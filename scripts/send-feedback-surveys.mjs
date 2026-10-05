// Creates one feedback invite per recipient and emails the survey link.
//
//   node scripts/send-feedback-surveys.mjs                         # dry run, both audiences
//   node scripts/send-feedback-surveys.mjs --audience=evaluator    # dry run one audience
//   node scripts/send-feedback-surveys.mjs --commit                # actually create + send
//
// Skips anyone already invited for that audience, so re-running is safe.

import { loadEnv, connect } from "./_db.mjs";
loadEnv(import.meta.url, "../.env.local");
process.env.NEXT_PUBLIC_BASE_URL = "https://sidelinestar.com";
const sql = connect(import.meta.url, "../.env.local");

const COMMIT = process.argv.includes("--commit");
const onlyArg = process.argv.find(a => a.startsWith("--audience="));
const only = onlyArg ? onlyArg.split("=")[1] : null;

// Approved by Dan. Nothing outside these lists is ever invited.
const APPROVED = {
  association_admin: [
    "administration@baha.ab.ca", "lmiller@baha.ab.ca",   // BAHA
    "seeraadmin@shaw.ca",                                  // Millwoods (Kerri)
    "u15@seerahockey.ca",                                  // SEERA (Aniko)
    "bchan@kcnorth.ca",                                    // KC North (Brian)
    "vp.operations@spsfuzion.com",                         // SPS Fuzion (Connie)
    "dan.anderson@femalehockeyalliance.ca",               // EFHA (Dan Anderson)
    "dylan_yungblut@cargill.com",                          // VMHA (Dylan)
  ],
  evaluator: [
    "jacobbodnaruk9@gmail.com", "rklinaker@gmail.com", "colelinaker@gmail.com",
    "p.basterash02@gmail.com", "bonciul@gmail.com", "nrd@ualberta.ca",
    "tyler.l.parks7@gmail.com", "donaldmmilburn@gmail.com", "waschukaj@gmail.com",
    "hennessey.tyler@gmail.com",
  ],
};
const SP_ID = 16; // Competitive Thread

const { emailFeedbackSurvey } = await import("@/lib/email");

async function adminRecipients() {
  const rows = await sql`
    SELECT u.id AS user_id, u.email, u.name, o.id AS organization_id
    FROM user_organization_roles uor
    JOIN users u ON u.id = uor.user_id
    JOIN organizations o ON o.id = uor.organization_id
    WHERE o.type = 'association' AND uor.role = 'association_admin' AND u.email IS NOT NULL
    UNION
    SELECT u.id, o.contact_email, o.contact_name, o.id
    FROM organizations o LEFT JOIN users u ON LOWER(u.email) = LOWER(o.contact_email)
    WHERE o.type = 'association' AND o.contact_email IS NOT NULL
  `;
  const seen = new Set();
  return rows.filter(r => { const k = r.email.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

async function evaluatorRecipients() {
  return sql`
    SELECT DISTINCT u.id AS user_id, u.email, u.name, ${SP_ID}::int AS organization_id
    FROM evaluator_memberships em
    JOIN users u ON u.id = em.user_id
    WHERE em.organization_id = ${SP_ID} AND em.status = 'active' AND em.is_evaluator = true AND u.email IS NOT NULL
    ORDER BY u.name
  `;
}

const audiences = [
  ["association_admin", adminRecipients],
  ["evaluator", evaluatorRecipients],
].filter(([a]) => !only || a === only);

for (const [audience, load] of audiences) {
  const recipients = (await load()).filter(r => APPROVED[audience].includes(r.email.toLowerCase()));
  const existing = await sql`SELECT LOWER(email) AS email FROM feedback_responses WHERE audience = ${audience}`;
  const already = new Set(existing.map(r => r.email));
  const todo = recipients.filter(r => !already.has(r.email.toLowerCase()));
  console.log(`\n${audience}: ${recipients.length} recipients, ${todo.length} to invite (${recipients.length - todo.length} already invited)`);
  for (const r of todo) console.log(`  ${r.name ?? ""} <${r.email}>`);

  if (!COMMIT) continue;

  for (const r of todo) {
    const [row] = await sql`
      INSERT INTO feedback_responses (audience, user_id, organization_id, email, sent_at)
      VALUES (${audience}, ${r.user_id ?? null}, ${r.organization_id ?? null}, ${r.email}, NOW())
      RETURNING token
    `;
    const res = await emailFeedbackSurvey({
      name: r.name, email: r.email, audience,
      url: `https://sidelinestar.com/feedback/${row.token}`,
    });
    console.log(`  sent -> ${r.email}: ${res?.ok ? "ok" : "FAILED " + (res?.error || "")}`);
  }
}

if (!COMMIT) console.log("\nDRY RUN -- re-run with --commit to create invites and send.");
