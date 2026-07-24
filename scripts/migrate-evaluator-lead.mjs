// Association lead + admin session-assignment schema.
// See migrations/2026-07-evaluator-lead-and-assignment.sql.
//   node scripts/migrate-evaluator-lead.mjs            # dry run
//   node scripts/migrate-evaluator-lead.mjs --commit   # apply
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const has = async (t, c) =>
  (await sql`SELECT 1 FROM information_schema.columns WHERE table_name=${t} AND column_name=${c}`).length > 0;

const WANT = [
  ["evaluator_memberships", "is_lead"],
  ["evaluator_session_signups", "assigned_by"],
  ["tester_session_signups", "assigned_by"],
];
const plan = [];
for (const [t, c] of WANT) if (!(await has(t, c))) plan.push(`${t}.${c}`);

console.log(plan.length ? "WILL ADD:\n  - " + plan.join("\n  - ") : "Nothing to do — already migrated.");
if (!plan.length) process.exit(0);
if (!COMMIT) { console.log("\nDRY RUN — re-run with --commit."); process.exit(0); }

await sql`ALTER TABLE evaluator_memberships ADD COLUMN IF NOT EXISTS is_lead BOOLEAN NOT NULL DEFAULT false`;
await sql`ALTER TABLE evaluator_session_signups ADD COLUMN IF NOT EXISTS assigned_by INTEGER`;
await sql`ALTER TABLE tester_session_signups ADD COLUMN IF NOT EXISTS assigned_by INTEGER`;

const left = [];
for (const [t, c] of WANT) if (!(await has(t, c))) left.push(`${t}.${c}`);
console.log(left.length ? `\n❌ STILL MISSING: ${left.join(", ")}` : "\nDONE — all columns present.");
