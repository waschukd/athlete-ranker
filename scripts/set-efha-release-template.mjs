// Set EFHA's "released" email copy, supplied by Krista Anderson (Elite Director).
//
//   node scripts/set-efha-release-template.mjs            # dry run
//   node scripts/set-efha-release-template.mjs --commit   # apply
//
// Goes in player_released, NOT player_cut: the copy says "not been selected"
// and names no destination division, which is the release case. player_cut is
// sent when a player is MOVED into another division -- putting this there would
// tell a placed player they were not selected.
//
// Subject is left empty on purpose so resolveTemplate falls back to the
// built-in ("Thank you for coming out — {{org_name}}"). Krista supplied body
// copy only, and inventing a subject line for a release letter is her call.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const ORG = 49; // Edmonton Female Hockey Alliance
const KEY = "player_released";

// Verbatim from Krista, including her wording and line breaks. Blank lines
// become paragraphs and single newlines become <br/> when the email is built.
const BODY = `Hi {{player_name}},

Thank you, {{player_name}}, for attending the EFHA AA tryouts and for the effort and the commitment you showed throughout the process.

After careful consideration, we regret to inform you that you have not been selected for a Edmonton Ice {{from_category}} team this season. We appreciate your hard work and wish you continued success in your hockey development.

Thank you again for trying out, and best of luck in the upcoming season.

OPTIONS FOR RELEASED PLAYERS in Edmonton draw zone:

1. Seek a second tryout - details are outlined on AFHL website
https://www.afhl.ca/afhl-tryouts-guide

2. Register for tiered/community hockey with EFHA. Click "Season Registration" on EFHA website. Tiered evaluations starts Monday August 31st and schedules are posted on "Storm (Tiered) Evaluations" tab. If you are interested in the High Performance stream, please select HP interest on registration form. High performance invitation details and schedule is posted on "Storm (HP) Tryouts" tab.

OPTIONS FOR RELEASED PLAYERS OUTSIDE EDMONTON DRAW ZONE:

1. Seek a second tryout - details are outlined on AFHL website.
https://www.afhl.ca/afhl-tryouts-guide

2. Return to Primary Minor Hockey Association

Krista Anderson
Elite Director
Edmonton Female Hockey Alliance`;

const [org] = await sql`SELECT id, name FROM organizations WHERE id = ${ORG}`;
console.log(`org        ${org?.id} — ${org?.name}`);
console.log(`key        ${KEY}`);
console.log(`length     ${BODY.length} chars, ${BODY.split(/\n\s*\n/).length} paragraphs`);
const vars = [...new Set([...BODY.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]))];
console.log(`variables  ${vars.join(", ")}`);

// player_released only ever receives these — anything else renders empty.
const ALLOWED = ["player_name", "org_name", "from_category"];
const bad = vars.filter(v => !ALLOWED.includes(v));
if (bad.length) { console.error(`\n!! unsupported variables: ${bad.join(", ")} — would render blank`); process.exit(1); }
console.log(`           all supported by ${KEY}`);

let existing = null;
try { [existing] = await sql`SELECT subject, LENGTH(body_html) AS len FROM email_templates WHERE organization_id=${ORG} AND template_key=${KEY}`; }
catch { /* table not created yet */ }
console.log(`existing   ${existing ? `override present (${existing.len} chars) — will be replaced` : "none — currently using built-in wording"}`);

if (!COMMIT) {
  console.log("\n--- body preview ---\n");
  console.log(BODY);
  console.log("\nDRY RUN — re-run with --commit to save.");
  process.exit(0);
}

await sql`
  CREATE TABLE IF NOT EXISTS email_templates (
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    template_key TEXT NOT NULL,
    subject TEXT,
    body_html TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (organization_id, template_key)
  )`;
await sql`
  INSERT INTO email_templates (organization_id, template_key, subject, body_html, updated_at)
  VALUES (${ORG}, ${KEY}, ${""}, ${BODY}, NOW())
  ON CONFLICT (organization_id, template_key) DO UPDATE
    SET subject = EXCLUDED.subject, body_html = EXCLUDED.body_html, updated_at = NOW()`;

const [saved] = await sql`SELECT LENGTH(body_html) AS len, updated_at FROM email_templates WHERE organization_id=${ORG} AND template_key=${KEY}`;
console.log(`\nsaved: ${saved.len} chars at ${saved.updated_at.toISOString()}`);
