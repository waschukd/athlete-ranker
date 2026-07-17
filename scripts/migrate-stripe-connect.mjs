// Stripe Connect schema — connected account per provider org + split audit on
// each purchase. See migrations/2026-07-stripe-connect.sql for the reasoning.
//
//   node scripts/migrate-stripe-connect.mjs            # dry run
//   node scripts/migrate-stripe-connect.mjs --commit   # apply
// Idempotent — additive only, no data is rewritten.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const has = async (table, col) =>
  (await sql`SELECT 1 FROM information_schema.columns WHERE table_name=${table} AND column_name=${col}`).length > 0;

const WANT = [
  ["organizations", "stripe_account_id"],
  ["organizations", "stripe_transfers_active"],
  ["organizations", "report_purchasing_enabled"],
  ["report_purchases", "application_fee_cents"],
  ["report_purchases", "provider_org_id"],
  ["report_purchases", "destination_account_id"],
];

const plan = [];
for (const [t, c] of WANT) if (!(await has(t, c))) plan.push(`${t}.${c}`);

console.log(plan.length ? "WILL ADD:\n  - " + plan.join("\n  - ") : "Nothing to do — already migrated.");
if (!plan.length) process.exit(0);
if (!COMMIT) { console.log("\nDRY RUN — re-run with --commit."); process.exit(0); }

await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_account_id TEXT`;
await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_transfers_active BOOLEAN NOT NULL DEFAULT false`;
await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS report_purchasing_enabled BOOLEAN NOT NULL DEFAULT true`;
await sql`ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS application_fee_cents INTEGER`;
await sql`ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS provider_org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL`;
await sql`ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS destination_account_id TEXT`;
await sql`CREATE INDEX IF NOT EXISTS report_purchases_provider_idx ON report_purchases (provider_org_id)`;
await sql`CREATE INDEX IF NOT EXISTS organizations_stripe_account_idx ON organizations (stripe_account_id)`;

const left = [];
for (const [t, c] of WANT) if (!(await has(t, c))) left.push(`${t}.${c}`);
console.log(left.length ? `\n❌ STILL MISSING: ${left.join(", ")}` : "\nDONE — all columns present.");
