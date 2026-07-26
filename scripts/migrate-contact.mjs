// Contact/non-contact schema — see migrations/2026-07-contact-noncontact.sql.
//   node scripts/migrate-contact.mjs            # dry run
//   node scripts/migrate-contact.mjs --commit   # apply
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const has = async (t, c) => (await sql`SELECT 1 FROM information_schema.columns WHERE table_name=${t} AND column_name=${c}`).length > 0;

const WANT = [["athletes", "non_contact"], ["age_categories", "contact_groups"], ["age_categories", "non_contact_groups"]];
const plan = [];
for (const [t, c] of WANT) if (!(await has(t, c))) plan.push(`${t}.${c}`);
console.log(plan.length ? "WILL ADD:\n  - " + plan.join("\n  - ") : "Nothing to do — already migrated.");
if (!plan.length) process.exit(0);
if (!COMMIT) { console.log("\nDRY RUN — re-run with --commit."); process.exit(0); }

await sql`ALTER TABLE athletes ADD COLUMN IF NOT EXISTS non_contact BOOLEAN NOT NULL DEFAULT false`;
await sql`ALTER TABLE age_categories ADD COLUMN IF NOT EXISTS contact_groups INTEGER`;
await sql`ALTER TABLE age_categories ADD COLUMN IF NOT EXISTS non_contact_groups INTEGER`;

const left = [];
for (const [t, c] of WANT) if (!(await has(t, c))) left.push(`${t}.${c}`);
console.log(left.length ? `\n❌ STILL MISSING: ${left.join(", ")}` : "\nDONE — all columns present.");
