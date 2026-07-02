// SP Testers — Phase 1 foundation migration. Additive, non-destructive.
//   node scripts/migrate-testers.mjs            # dry run
//   node scripts/migrate-testers.mjs --commit   # apply
//
// Adds:
//   • evaluation_schedule.testers_required (int, default 0)  — SP-private tester capacity
//   • evaluator_invitations.role / evaluator_join_codes.role — so an invite lands the
//     invitee in the right pool (default service_provider_evaluator, unchanged behaviour)
//   • tester_session_signups                                — testers signing up for testing
// (The 'service_provider_tester' role is just a string in the existing varchar role
//  columns — no schema change needed for the role itself.)
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const has = async (table, col) => (await sql`SELECT 1 FROM information_schema.columns WHERE table_name=${table} AND column_name=${col}`).length > 0;
const tableExists = async (t) => (await sql`SELECT 1 FROM information_schema.tables WHERE table_name=${t}`).length > 0;

const plan = [];
if (!(await has("evaluation_schedule", "testers_required"))) plan.push("evaluation_schedule.testers_required");
if (!(await has("evaluator_invitations", "role"))) plan.push("evaluator_invitations.role");
if (!(await has("evaluator_join_codes", "role"))) plan.push("evaluator_join_codes.role");
if (!(await tableExists("tester_session_signups"))) plan.push("tester_session_signups (table)");
// Capability flags — a person can hold only ONE membership row per org (unique
// user_id+organization_id), so tester vs evaluator can't be two rows. Flags on the
// single row carry both. Existing rows default to evaluator (is_evaluator=true).
if (!(await has("evaluator_memberships", "is_tester"))) plan.push("evaluator_memberships.is_tester");
if (!(await has("evaluator_memberships", "is_evaluator"))) plan.push("evaluator_memberships.is_evaluator");

console.log(plan.length ? "WILL ADD:\n  - " + plan.join("\n  - ") : "Nothing to do — already migrated.");
if (!plan.length) process.exit(0);
if (!COMMIT) { console.log("\nDRY RUN — re-run with --commit to apply."); process.exit(0); }

await sql`ALTER TABLE evaluation_schedule ADD COLUMN IF NOT EXISTS testers_required integer NOT NULL DEFAULT 0`;
await sql`ALTER TABLE evaluator_invitations ADD COLUMN IF NOT EXISTS role varchar NOT NULL DEFAULT 'service_provider_evaluator'`;
await sql`ALTER TABLE evaluator_join_codes ADD COLUMN IF NOT EXISTS role varchar NOT NULL DEFAULT 'service_provider_evaluator'`;
await sql`
  CREATE TABLE IF NOT EXISTS tester_session_signups (
    id serial PRIMARY KEY,
    schedule_id integer NOT NULL REFERENCES evaluation_schedule(id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status varchar NOT NULL DEFAULT 'signed_up',
    notified_at timestamp,
    created_at timestamp DEFAULT now(),
    UNIQUE (schedule_id, user_id)
  )`;
await sql`CREATE INDEX IF NOT EXISTS idx_tester_signups_schedule ON tester_session_signups(schedule_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_tester_signups_user ON tester_session_signups(user_id)`;
// Capability flags: existing memberships are evaluators (default true); testers get is_tester=true.
await sql`ALTER TABLE evaluator_memberships ADD COLUMN IF NOT EXISTS is_tester boolean NOT NULL DEFAULT false`;
await sql`ALTER TABLE evaluator_memberships ADD COLUMN IF NOT EXISTS is_evaluator boolean NOT NULL DEFAULT true`;

console.log("DONE — testers foundation migrated.");
