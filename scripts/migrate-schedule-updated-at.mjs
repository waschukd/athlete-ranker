// evaluation_schedule.updated_at — additive, non-destructive.
//
//   node scripts/migrate-schedule-updated-at.mjs                     # dry run
//   node scripts/migrate-schedule-updated-at.mjs --commit            # apply
//   node scripts/migrate-schedule-updated-at.mjs --commit --prod     # against .env.production.local
//
// Why: nothing recorded that a session had been edited. The table had
// created_at but no updated_at, and the PATCH handler wrote no audit row, so a
// session moved from 5:45 to 7:00 left no trace at all -- there was no way to
// find, after the fact, which sessions had changed or to tell a calendar client
// that an event had been revised.
//
// The evaluator .ics feed needs exactly this: RFC 5545 uses SEQUENCE to signal
// "this event was updated". Without a revision timestamp there is nothing to
// derive SEQUENCE from, so Google/Outlook keep showing the original time and an
// evaluator turns up an hour early.
//
// Backfilled to created_at, so existing rows read as "never edited" rather than
// as "edited just now" (which would bump SEQUENCE on every event at once).

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

const needsColumn = !(await has("evaluation_schedule", "updated_at"));
console.log(needsColumn
  ? "PLAN: add evaluation_schedule.updated_at (timestamp, backfilled to created_at)"
  : "evaluation_schedule.updated_at already exists — nothing to add");

if (!needsColumn) {
  const [n] = await sql`SELECT COUNT(*)::int AS c FROM evaluation_schedule WHERE updated_at IS NULL`;
  if (n.c > 0) console.log(`NOTE: ${n.c} rows have a NULL updated_at and would be backfilled`);
}

if (!COMMIT) {
  console.log("\nDRY RUN — re-run with --commit to apply.");
  process.exit(0);
}

if (needsColumn) {
  await sql`ALTER TABLE evaluation_schedule ADD COLUMN updated_at TIMESTAMP`;
  console.log("added evaluation_schedule.updated_at");
}
const res = await sql`
  UPDATE evaluation_schedule SET updated_at = COALESCE(updated_at, created_at, NOW())
  WHERE updated_at IS NULL RETURNING id`;
console.log(`backfilled ${res.length} rows`);

const [check] = await sql`
  SELECT COUNT(*)::int AS total, COUNT(updated_at)::int AS with_ts FROM evaluation_schedule`;
console.log(`\nverify: ${check.with_ts}/${check.total} rows have updated_at`);
