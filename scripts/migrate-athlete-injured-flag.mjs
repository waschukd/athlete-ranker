// See migrations/2026-09-athlete-injured-flag.sql
//
//   node scripts/migrate-athlete-injured-flag.mjs            # dry run
//   node scripts/migrate-athlete-injured-flag.mjs --commit   # apply
// Idempotent.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const has = (await sql`SELECT 1 FROM information_schema.columns WHERE table_name='athletes' AND column_name='injured'`).length > 0;

if (has) { console.log("Nothing to do — already migrated."); process.exit(0); }
if (!COMMIT) { console.log("WILL ADD: athletes.injured\n\nDRY RUN — re-run with --commit."); process.exit(0); }

await sql`ALTER TABLE athletes ADD COLUMN IF NOT EXISTS injured BOOLEAN NOT NULL DEFAULT false`;
console.log("DONE — athletes.injured added.");
