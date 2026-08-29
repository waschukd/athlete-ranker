// organizations.release_only — additive, non-destructive.
//
//   node scripts/migrate-release-only.mjs --prod                 # dry run
//   node scripts/migrate-release-only.mjs --prod --commit        # add column
//   node scripts/migrate-release-only.mjs --prod --commit --org 49
//                                                # add column AND enable for org 49
//
// Some associations never place a cut player into another division -- every cut
// is a straight release with one standard letter (EFHA works this way). For
// them the move-vs-release choice in the cut modal is a decision they do not
// make, and offering it is only a chance to send the wrong email.
//
// Defaults to FALSE, so every other association keeps the existing behaviour
// exactly. The cut route reads this through to_jsonb, so the app is safe
// whether or not this has run.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const envFile = process.argv.includes("--prod") ? "../.env.production.local" : "../.env.local";
const env = readFileSync(new URL(envFile, import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const orgFlagIdx = process.argv.indexOf("--org");
const ORG = orgFlagIdx > -1 ? parseInt(process.argv[orgFlagIdx + 1]) : null;

const has = async (table, col) =>
  (await sql`SELECT 1 FROM information_schema.columns WHERE table_name=${table} AND column_name=${col}`).length > 0;

console.log(`env    ${envFile}`);
console.log(`host   ${(process.env.DATABASE_URL.match(/@([^/?]+)/) || [])[1]}\n`);

const needsColumn = !(await has("organizations", "release_only"));
console.log(needsColumn
  ? "PLAN: add organizations.release_only BOOLEAN NOT NULL DEFAULT false"
  : "organizations.release_only already exists");

if (ORG) {
  const [o] = await sql`SELECT id, name FROM organizations WHERE id = ${ORG}`;
  if (!o) { console.error(`\n!! no organization ${ORG}`); process.exit(1); }
  console.log(`PLAN: set release_only = true for ${o.id} — ${o.name}`);
}

if (!COMMIT) {
  console.log("\nDRY RUN — re-run with --commit to apply.");
  process.exit(0);
}

if (needsColumn) {
  await sql`ALTER TABLE organizations ADD COLUMN release_only BOOLEAN NOT NULL DEFAULT false`;
  console.log("added organizations.release_only");
}

if (ORG) {
  await sql`UPDATE organizations SET release_only = true WHERE id = ${ORG}`;
  console.log(`enabled for org ${ORG}`);
}

const on = await sql`SELECT id, name FROM organizations WHERE release_only = true ORDER BY id`;
console.log(`\nrelease-only associations (${on.length}):`);
for (const o of on) console.log(`  ${o.id} — ${o.name}`);
