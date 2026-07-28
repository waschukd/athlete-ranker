import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const has = async () => (await sql`SELECT 1 FROM information_schema.columns WHERE table_name='age_categories' AND column_name='welcome_sent_at'`).length > 0;
if (await has()) { console.log("Nothing to do — welcome_sent_at present."); process.exit(0); }
console.log("WILL ADD: age_categories.welcome_sent_at");
if (!COMMIT) { console.log("\nDRY RUN — re-run with --commit."); process.exit(0); }
await sql`ALTER TABLE age_categories ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMPTZ`;
console.log(await has() ? "DONE — column present." : "❌ STILL MISSING");
