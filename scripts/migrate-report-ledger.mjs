// Report revenue ledger — see migrations/2026-07-report-revenue-ledger.sql.
// Supersedes migrate-stripe-connect.mjs (Connect deferred; Sideline Star is MoR
// and remits a provider share off-platform).
//
//   node scripts/migrate-report-ledger.mjs            # dry run
//   node scripts/migrate-report-ledger.mjs --commit   # apply
// Idempotent. The drops are guarded: it refuses to drop a column that has data.
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

const ADD = [
  ["organizations", "report_purchasing_enabled"],
  ["report_purchases", "provider_org_id"],
  ["report_purchases", "platform_fee_cents"],
];
// Each carries the predicate for "someone actually used this". IS NOT NULL is
// wrong for a NOT NULL DEFAULT false column — every row is non-null while
// holding nothing but the default, which would block the drop forever.
const DROP = [
  ["organizations", "stripe_account_id", "stripe_account_id IS NOT NULL"],
  ["organizations", "stripe_transfers_active", "stripe_transfers_active IS TRUE"],
  ["report_purchases", "destination_account_id", "destination_account_id IS NOT NULL"],
  ["report_purchases", "application_fee_cents", "application_fee_cents IS NOT NULL"],
];

const toAdd = [];
for (const [t, c] of ADD) if (!(await has(t, c))) toAdd.push(`${t}.${c}`);

// Never drop a column that someone has started using — these are meant to be
// empty leftovers from the superseded Connect migration, but check, don't assume.
const toDrop = [];
const refuse = [];
for (const [t, c, usedPredicate] of DROP) {
  if (!(await has(t, c))) continue;
  // Identifiers can't be bound as params; t/c/predicate come from the hardcoded
  // DROP list above, never from input. sql.query for a non-tagged call.
  const [{ n }] = await sql.query(`SELECT COUNT(*)::int AS n FROM ${t} WHERE ${usedPredicate}`);
  if (n > 0) refuse.push(`${t}.${c} (${n} rows have real data)`);
  else toDrop.push(`${t}.${c}`);
}

console.log(toAdd.length ? "WILL ADD:\n  - " + toAdd.join("\n  - ") : "Nothing to add.");
console.log(toDrop.length ? "WILL DROP (empty):\n  - " + toDrop.join("\n  - ") : "Nothing to drop.");
if (refuse.length) {
  console.log("\n❌ REFUSING TO DROP — these have data:\n  - " + refuse.join("\n  - "));
  console.log("Investigate before proceeding; this migration assumes they were never populated.");
  process.exit(1);
}
if (!toAdd.length && !toDrop.length) { console.log("\nNothing to do — already migrated."); process.exit(0); }
if (!COMMIT) { console.log("\nDRY RUN — re-run with --commit."); process.exit(0); }

await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS report_purchasing_enabled BOOLEAN NOT NULL DEFAULT true`;
await sql`ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS provider_org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL`;
await sql`ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER`;
await sql`CREATE INDEX IF NOT EXISTS report_purchases_provider_idx ON report_purchases (provider_org_id)`;

await sql`ALTER TABLE organizations   DROP COLUMN IF EXISTS stripe_account_id`;
await sql`ALTER TABLE organizations   DROP COLUMN IF EXISTS stripe_transfers_active`;
await sql`ALTER TABLE report_purchases DROP COLUMN IF EXISTS destination_account_id`;
await sql`ALTER TABLE report_purchases DROP COLUMN IF EXISTS application_fee_cents`;
await sql`DROP INDEX IF EXISTS organizations_stripe_account_idx`;

const left = [];
for (const [t, c] of ADD) if (!(await has(t, c))) left.push(`missing ${t}.${c}`);
for (const [t, c] of DROP) if (await has(t, c)) left.push(`still present ${t}.${c}`);
console.log(left.length ? `\n❌ ${left.join(", ")}` : "\nDONE — ledger columns present, Connect columns gone.");
