// Which database am I actually talking to?
//
// .env.local is a copy of the production environment, so it LOOKS authoritative
// even when its DATABASE_URL has gone stale -- pointing at a database that was
// production once but no longer receives writes. Queries against it succeed and
// return plausible, self-consistent, wrong answers.
//
//   node scripts/db-check.mjs                  # check .env.local
//   node scripts/db-check.mjs .env.production.local
//
// Run this before trusting anything you read out of the database.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const envFile = process.argv[2] || ".env.local";

let env;
try {
  env = readFileSync(new URL(`../${envFile}`, import.meta.url), "utf8");
} catch {
  console.error(`Cannot read ${envFile}`);
  process.exit(1);
}

let url = null;
for (const line of env.split("\n")) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) url = m[1].replace(/^["']|["']$/g, "");
}

if (!url) { console.error(`No DATABASE_URL in ${envFile}`); process.exit(1); }
if (url === "[SENSITIVE]") {
  console.error(`${envFile} has DATABASE_URL="[SENSITIVE]" -- Vercel marks it write-only,`);
  console.error(`so \`vercel env pull\` cannot retrieve it. Copy it from the Neon console.`);
  process.exit(1);
}

// Host only: never print credentials.
const host = (url.match(/@([^/?]+)/) || [])[1] || "(unparseable)";
const dbName = (url.match(/@[^/]+\/([^?]+)/) || [])[1] || "(unknown)";

const sql = neon(url);

const [{ now }] = await sql`SELECT NOW() AS now`;
const [counts] = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM category_scores)   AS scores,
    (SELECT COUNT(*)::int FROM athletes)          AS athletes,
    (SELECT COUNT(*)::int FROM organizations)     AS orgs`;
const [last] = await sql`SELECT MAX(updated_at) AS last_score FROM category_scores`;

console.log(`env file      ${envFile}`);
console.log(`host          ${host}`);
console.log(`database      ${dbName}`);
console.log(`server time   ${now.toISOString?.() ?? now}`);
console.log(`orgs          ${counts.orgs}`);
console.log(`athletes      ${counts.athletes}`);
console.log(`scores        ${counts.scores}`);
console.log(`last score    ${last.last_score ? new Date(last.last_score).toISOString() : "(never)"}`);

// Deliberately NO automatic production/stale verdict.
//
// The first version of this script guessed from the age of the newest score and
// got it exactly backwards: a Neon dev branch carries production's whole history
// across at the branch point, so it looks "recently written" no matter how long
// ago it was cut -- while production itself can sit unscored for weeks between
// evaluation blocks. Neither age nor row counts separate the two, and a
// confident wrong answer here is worse than no answer.
//
// The host below is the only reliable signal: match it against the compute
// endpoint Neon lists for each branch (Neon console -> Branches).
const newest = [
  ["category_scores", last.last_score],
  ["player_checkins", (await sql`SELECT MAX(created_at) AS m FROM player_checkins`)[0].m],
  ["analytics_events", (await sql`SELECT MAX(ts) AS m FROM analytics_events`)[0].m],
].filter(([, v]) => v);

console.log(`\nnewest activity:`);
for (const [t, v] of newest) console.log(`  ${t.padEnd(18)} ${new Date(v).toISOString()}`);

console.log(`\nWhich branch is this? Compare the host above against Neon ->`);
console.log(`Branches -> each branch's compute endpoint. This script cannot tell`);
console.log(`them apart from the data: a branch inherits production's full history.`);
