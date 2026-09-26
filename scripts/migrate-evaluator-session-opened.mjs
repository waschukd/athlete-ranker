// evaluator_session_signups.opened_at / evaluator_timezone — additive, non-destructive.
//
//   node scripts/migrate-evaluator-session-opened.mjs                 # dry run
//   node scripts/migrate-evaluator-session-opened.mjs --commit        # apply
//   node scripts/migrate-evaluator-session-opened.mjs --commit --prod # against .env.production.local
//
// Why: the only existing signal for "when did an evaluator actually start
// working" was first_score_at -- session start to FIRST SCORE ENTERED, one
// combined number. That conflates "showed up late" with "showed up on time
// but didn't score right away" (e.g. scoring on paper, waiting for check-in
// to finish). opened_at splits it into two real intervals: start -> opened
// the check-in/roster screen, and opened -> first score.
//
// No backfill possible -- this only starts recording from the moment it
// ships. Historical sessions will have opened_at = NULL forever.

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

const host = (process.env.DATABASE_URL.match(/@([^/?]+)/) || [])[1];
console.log(`env    ${envFile}`);
console.log(`host   ${host}\n`);

const needsOpened = !(await has("evaluator_session_signups", "opened_at"));
const needsTz = !(await has("evaluator_session_signups", "evaluator_timezone"));
console.log(needsOpened ? "PLAN: add evaluator_session_signups.opened_at (timestamptz)" : "opened_at already exists");
console.log(needsTz ? "PLAN: add evaluator_session_signups.evaluator_timezone (text)" : "evaluator_timezone already exists");

if (!COMMIT) {
  console.log("\nDRY RUN — re-run with --commit to apply.");
  process.exit(0);
}

if (needsOpened) {
  await sql`ALTER TABLE evaluator_session_signups ADD COLUMN opened_at TIMESTAMPTZ`;
  console.log("added opened_at");
}
if (needsTz) {
  await sql`ALTER TABLE evaluator_session_signups ADD COLUMN evaluator_timezone TEXT`;
  console.log("added evaluator_timezone");
}

const [check] = await sql`
  SELECT COUNT(*)::int AS total, COUNT(opened_at)::int AS with_opened FROM evaluator_session_signups`;
console.log(`\nverify: table has ${check.total} rows, ${check.with_opened} with opened_at set (expected 0 -- recording starts now)`);
