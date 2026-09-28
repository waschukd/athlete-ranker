// suspended_login_attempts -- additive, non-destructive.
//
//   node scripts/migrate-suspended-login-attempts.mjs                 # dry run
//   node scripts/migrate-suspended-login-attempts.mjs --commit        # apply

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

const hasTable = async (table) => (await sql`SELECT 1 FROM information_schema.tables WHERE table_name=${table}`).length > 0;

const needsTable = !(await hasTable("suspended_login_attempts"));
console.log(needsTable ? "PLAN: create suspended_login_attempts table" : "suspended_login_attempts already exists");

if (!COMMIT) { console.log("\nDRY RUN — re-run with --commit to apply."); process.exit(0); }

if (needsTable) {
  await sql`
    CREATE TABLE suspended_login_attempts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      email TEXT NOT NULL,
      ip TEXT,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  console.log("created suspended_login_attempts");
}
console.log("\nDone.");
