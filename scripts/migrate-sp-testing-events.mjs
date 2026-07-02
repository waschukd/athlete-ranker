// SP-owned testing events — testing sessions an SP schedules directly for a
// testing-only client (e.g. a Ringette association), not tied to an association
// they also evaluate for. Reuses evaluation_schedule (+ tester_session_signups).
//   node scripts/migrate-sp-testing-events.mjs            # dry run
//   node scripts/migrate-sp-testing-events.mjs --commit   # apply
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const has = async (c) => (await sql`SELECT 1 FROM information_schema.columns WHERE table_name='evaluation_schedule' AND column_name=${c}`).length > 0;
const plan = [];
if (!(await has("service_provider_id"))) plan.push("evaluation_schedule.service_provider_id");
if (!(await has("client_label"))) plan.push("evaluation_schedule.client_label");

console.log(plan.length ? "WILL ADD:\n  - " + plan.join("\n  - ") : "Nothing to do — already migrated.");
if (!plan.length) process.exit(0);
if (!COMMIT) { console.log("\nDRY RUN — re-run with --commit."); process.exit(0); }

await sql`ALTER TABLE evaluation_schedule ADD COLUMN IF NOT EXISTS service_provider_id integer REFERENCES organizations(id) ON DELETE CASCADE`;
await sql`ALTER TABLE evaluation_schedule ADD COLUMN IF NOT EXISTS client_label varchar`;
await sql`CREATE INDEX IF NOT EXISTS idx_eval_schedule_sp ON evaluation_schedule(service_provider_id)`;
console.log("DONE — SP testing events migrated.");
