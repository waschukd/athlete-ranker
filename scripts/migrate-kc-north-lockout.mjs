// users.suspension_message + sp_access_restrictions — additive, non-destructive.
//
//   node scripts/migrate-kc-north-lockout.mjs                 # dry run
//   node scripts/migrate-kc-north-lockout.mjs --commit        # apply

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const envFile = process.argv.includes("--prod") ? "../.env.production.local" : "../.env.local";
const env = readFileSync(new URL(envFile, import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const has = async (table, col) =>
  (await sql`SELECT 1 FROM information_schema.columns WHERE table_name=${table} AND column_name=${col}`).length > 0;
const hasTable = async (table) =>
  (await sql`SELECT 1 FROM information_schema.tables WHERE table_name=${table}`).length > 0;

const needsCol = !(await has("users", "suspension_message"));
const needsTable = !(await hasTable("sp_access_restrictions"));
console.log(needsCol ? "PLAN: add users.suspension_message (text)" : "users.suspension_message already exists");
console.log(needsTable ? "PLAN: create sp_access_restrictions table" : "sp_access_restrictions already exists");

if (!COMMIT) { console.log("\nDRY RUN — re-run with --commit to apply."); process.exit(0); }

if (needsCol) { await sql`ALTER TABLE users ADD COLUMN suspension_message TEXT`; console.log("added suspension_message"); }
if (needsTable) {
  await sql`
    CREATE TABLE sp_access_restrictions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      message TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, organization_id)
    )`;
  console.log("created sp_access_restrictions");
}
console.log("\nDone.");
