// Org-level goalie template. Additive JSONB column, non-destructive.
//   node scripts/migrate-goalie-template.mjs            # dry run
//   node scripts/migrate-goalie-template.mjs --commit   # apply
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const exists = (await sql`SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='goalie_template'`).length > 0;
console.log("organizations.goalie_template exists:", exists);
if (exists) { console.log("Nothing to do."); process.exit(0); }
if (!COMMIT) { console.log("DRY RUN — re-run with --commit."); process.exit(0); }
await sql`ALTER TABLE organizations ADD COLUMN goalie_template jsonb`;
console.log("DONE — added organizations.goalie_template.");
