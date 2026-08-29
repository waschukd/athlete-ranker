// EFHA's single cut/release letter, supplied by Krista Anderson (Elite Director).
//
//   node scripts/set-efha-release-template.mjs            # dry run
//   node scripts/set-efha-release-template.mjs --commit   # apply
//
// EFHA does NOT pick a destination for a cut player -- every released player
// gets the same "you have not been selected, here are your options" letter. So
// the SAME body is written to BOTH keys:
//
//   player_released — cut, no destination        (their normal path)
//   player_cut      — cut and moved to a division (would otherwise send the
//                     built-in "we've placed you in {{to_category}}" wording)
//
// Writing both is what makes "one message for all cut players" actually true:
// whichever path the modal takes, the player receives this letter. The copy
// references no destination, so it reads correctly either way.
//
// Subject is left empty so resolveTemplate falls back to the built-in line --
// Krista supplied body copy only.

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
const KEYS = ["player_released", "player_cut"];

// Krista's wording, with the grammar tidied as she asked:
//   "a Edmonton Ice"                    -> "an Edmonton Ice"
//   "the effort and the commitment"     -> "the effort and commitment"
//   "outlined on AFHL website"          -> "outlined on the AFHL website"
//   "Tiered evaluations starts"         -> "Tiered evaluations start"
//   "schedule is posted"                -> "schedule are posted" -> reworded
//   "Return to Primary Minor Hockey Association" -> "Return to your primary
//                                          minor hockey association"
// Nothing else is changed: no sentence reordered, nothing added or removed.
const BODY = `Hi {{player_name}},

Thank you, {{player_name}}, for attending the EFHA AA tryouts and for the effort and commitment you showed throughout the process.

After careful consideration, we regret to inform you that you have not been selected for an Edmonton Ice {{from_category}} team this season. We appreciate your hard work and wish you continued success in your hockey development.

Thank you again for trying out, and best of luck in the upcoming season.

OPTIONS FOR RELEASED PLAYERS IN THE EDMONTON DRAW ZONE:

1. Seek a second tryout — details are outlined on the AFHL website:
https://www.afhl.ca/afhl-tryouts-guide

2. Register for tiered/community hockey with EFHA. Click "Season Registration" on the EFHA website. Tiered evaluations start Monday, August 31st, and schedules are posted on the "Storm (Tiered) Evaluations" tab. If you are interested in the High Performance stream, please select HP interest on the registration form. High Performance invitation details and the schedule are posted on the "Storm (HP) Tryouts" tab.

OPTIONS FOR RELEASED PLAYERS OUTSIDE THE EDMONTON DRAW ZONE:

1. Seek a second tryout — details are outlined on the AFHL website:
https://www.afhl.ca/afhl-tryouts-guide

2. Return to your primary minor hockey association.

Krista Anderson
Elite Director
Edmonton Female Hockey Alliance`;

const [org] = await sql`SELECT id, name FROM organizations WHERE id = ${ORG}`;
console.log(`org        ${org?.id} — ${org?.name}`);
console.log(`keys       ${KEYS.join(", ")}`);
console.log(`length     ${BODY.length} chars, ${BODY.split(/\n\s*\n/).length} paragraphs`);

const vars = [...new Set([...BODY.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]))];
console.log(`variables  ${vars.join(", ")}`);
// player_cut also offers to_category, but this copy deliberately never uses it.
const ALLOWED = ["player_name", "org_name", "from_category"];
const bad = vars.filter(v => !ALLOWED.includes(v));
if (bad.length) { console.error(`\n!! unsupported: ${bad.join(", ")} — would render blank`); process.exit(1); }
console.log(`           supported by BOTH keys (no to_category used — by design)`);

for (const key of KEYS) {
  let existing = null;
  try { [existing] = await sql`SELECT LENGTH(body_html) AS len FROM email_templates WHERE organization_id=${ORG} AND template_key=${key}`; }
  catch { /* table may not exist yet */ }
  console.log(`existing   ${key.padEnd(16)} ${existing ? `override present (${existing.len} chars) — replaced` : "none — using built-in"}`);
}

if (!COMMIT) {
  console.log("\n--- body ---\n");
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

for (const key of KEYS) {
  await sql`
    INSERT INTO email_templates (organization_id, template_key, subject, body_html, updated_at)
    VALUES (${ORG}, ${key}, ${""}, ${BODY}, NOW())
    ON CONFLICT (organization_id, template_key) DO UPDATE
      SET subject = EXCLUDED.subject, body_html = EXCLUDED.body_html, updated_at = NOW()`;
}

const saved = await sql`
  SELECT template_key, LENGTH(body_html) AS len, updated_at
  FROM email_templates WHERE organization_id=${ORG} ORDER BY template_key`;
console.log("");
for (const r of saved) console.log(`saved: ${r.template_key.padEnd(16)} ${r.len} chars at ${r.updated_at.toISOString()}`);
