// Round-robin / matchup evaluation format. Additive + gated: a category is
// 'standard' unless explicitly set 'round_robin', so existing evals are
// untouched. Adds the format flag + persistent scrimmage teams.
//   node scripts/migrate-round-robin.mjs            # dry run
//   node scripts/migrate-round-robin.mjs --commit   # apply
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

async function has(table, col) {
  return (await sql`SELECT 1 FROM information_schema.columns WHERE table_name=${table} AND column_name=${col}`).length > 0;
}
async function tableExists(t) {
  return (await sql`SELECT 1 FROM information_schema.tables WHERE table_name=${t}`).length > 0;
}

const need = [];
if (!(await has("age_categories", "eval_format"))) need.push("age_categories.eval_format");
if (!(await tableExists("scrimmage_teams"))) need.push("scrimmage_teams");
if (!(await tableExists("scrimmage_team_members"))) need.push("scrimmage_team_members");

console.log("To create:", need.length ? need.join(", ") : "(nothing — already migrated)");
if (!need.length) process.exit(0);
if (!COMMIT) { console.log("DRY RUN — re-run with --commit."); process.exit(0); }

if (need.includes("age_categories.eval_format")) {
  await sql`ALTER TABLE age_categories ADD COLUMN eval_format text NOT NULL DEFAULT 'standard'`;
}
if (need.includes("scrimmage_teams")) {
  await sql`CREATE TABLE scrimmage_teams (
    id serial PRIMARY KEY,
    age_category_id integer NOT NULL REFERENCES age_categories(id) ON DELETE CASCADE,
    name text NOT NULL,
    display_order integer NOT NULL DEFAULT 0,
    created_at timestamp DEFAULT now()
  )`;
}
if (need.includes("scrimmage_team_members")) {
  await sql`CREATE TABLE scrimmage_team_members (
    id serial PRIMARY KEY,
    scrimmage_team_id integer NOT NULL REFERENCES scrimmage_teams(id) ON DELETE CASCADE,
    athlete_id integer NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    UNIQUE (athlete_id, scrimmage_team_id)
  )`;
}
console.log("DONE.");
