// Turn on "a blank Session N Group # cell means NOT in session N" for one org.
//
//   node scripts/enable-blank-group-excludes.mjs --org "Beaumont"          (dry run)
//   node scripts/enable-blank-group-excludes.mjs --org "Beaumont" --commit
//   node scripts/enable-blank-group-excludes.mjs --org "Beaumont" --off --commit
//
// Default upload behaviour: a player whose Session 1 Group # is blank gets
// auto-placed into session 1's smallest group anyway. BAHA U15 runs only BC
// players in session 1 (two groups) and brings the NBC players in from session
// 2 -- there was no way to express "not in session 1" through the file, and
// 87 of 88 landed in one group.
//
// Per-org flag, off everywhere else, so no other association's upload changes.
import { connect } from "./_db.mjs";

const sql = connect(import.meta.url);
const arg = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
const COMMIT = process.argv.includes("--commit");
const OFF = process.argv.includes("--off");
const NAME = arg("--org");
if (!NAME) { console.error('Usage: --org "<name fragment>" [--off] [--commit]'); process.exit(1); }

await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS blank_group_excludes BOOLEAN NOT NULL DEFAULT false`;

const orgs = await sql`SELECT id, name, blank_group_excludes FROM organizations WHERE name ILIKE ${"%" + NAME + "%"} ORDER BY name`;
if (!orgs.length) { console.error(`No organization matching "${NAME}"`); process.exit(1); }
if (orgs.length > 1) { console.error(`"${NAME}" matches ${orgs.length} orgs -- be more specific:`); orgs.forEach(o => console.error(`   ${o.id}  ${o.name}`)); process.exit(1); }
const org = orgs[0];
console.log(`${org.name} (org ${org.id})`);
console.log(`  blank_group_excludes: ${org.blank_group_excludes}  ->  ${!OFF}`);
const others = await sql`SELECT name FROM organizations WHERE blank_group_excludes = true AND id <> ${org.id}`;
console.log(`  other orgs with it on: ${others.map(o => o.name).join(", ") || "none"}`);

if (!COMMIT) { console.log("\nDRY RUN -- re-run with --commit."); process.exit(0); }
await sql`UPDATE organizations SET blank_group_excludes = ${!OFF} WHERE id = ${org.id}`;
console.log(`\nblank_group_excludes is now ${!OFF} for ${org.name}.`);
