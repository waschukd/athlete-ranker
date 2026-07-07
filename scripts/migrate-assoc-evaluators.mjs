// SP grants an association permission to add its OWN (coach) evaluators.
// Additive flag on the SP↔association link. Non-destructive.
//   node scripts/migrate-assoc-evaluators.mjs            # dry run
//   node scripts/migrate-assoc-evaluators.mjs --commit   # apply
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const exists = (await sql`SELECT 1 FROM information_schema.columns WHERE table_name='sp_association_links' AND column_name='allow_association_evaluators'`).length > 0;
console.log("sp_association_links.allow_association_evaluators exists:", exists);
if (exists) { console.log("Nothing to do."); process.exit(0); }
if (!COMMIT) { console.log("DRY RUN — re-run with --commit."); process.exit(0); }
await sql`ALTER TABLE sp_association_links ADD COLUMN allow_association_evaluators boolean NOT NULL DEFAULT false`;
console.log("DONE — added allow_association_evaluators.");
