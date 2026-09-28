// organizations.independent_report_provider -- additive, non-destructive.
//
//   node scripts/migrate-independent-report-provider.mjs                 # dry run
//   node scripts/migrate-independent-report-provider.mjs --commit        # apply

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

const has = async (table, col) =>
  (await sql`SELECT 1 FROM information_schema.columns WHERE table_name=${table} AND column_name=${col}`).length > 0;

const needsCol = !(await has("organizations", "independent_report_provider"));
console.log(needsCol ? "PLAN: add organizations.independent_report_provider (boolean, default false)" : "already exists");

if (!COMMIT) { console.log("\nDRY RUN — re-run with --commit to apply."); process.exit(0); }

if (needsCol) {
  await sql`ALTER TABLE organizations ADD COLUMN independent_report_provider BOOLEAN NOT NULL DEFAULT false`;
  console.log("added independent_report_provider");
}
console.log("\nDone.");
