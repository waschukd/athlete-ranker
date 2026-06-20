// Adds age_categories.roster_targets (jsonb) — the intended roster size(s) that
// define the cut line(s) for the Final-Session Contention Planner.
// Additive, nullable, non-destructive.
//   node scripts/migrate-roster-targets.mjs            # dry run
//   node scripts/migrate-roster-targets.mjs --commit   # apply
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const exists = (await sql`SELECT 1 FROM information_schema.columns WHERE table_name='age_categories' AND column_name='roster_targets'`).length > 0;
console.log("age_categories.roster_targets exists:", exists);
if (exists) { console.log("Nothing to do."); process.exit(0); }
if (!COMMIT) { console.log("DRY RUN — re-run with --commit to add the column."); process.exit(0); }
await sql`ALTER TABLE age_categories ADD COLUMN roster_targets jsonb`;
console.log("DONE — added age_categories.roster_targets (jsonb).");
