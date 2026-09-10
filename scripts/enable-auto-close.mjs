// Turn on automatic session closing for one organization.
//
//   node scripts/enable-auto-close.mjs --org "Confederation"          (dry run)
//   node scripts/enable-auto-close.mjs --org "Confederation" --commit
//   node scripts/enable-auto-close.mjs --org "Confederation" --off --commit
//
// Confederation uses Sideline Star for scheduling only -- CT staffs the skates
// but no scores are ever entered. Their evaluators could not close a session,
// because "Save & Close" requires every checked-in athlete to be scored or
// excused, and with no data there is nothing to satisfy it. Sessions therefore
// sat open forever.
//
// This is a per-org flag rather than a hardcoded id so it stays visible in the
// data and can be turned off without a deploy. It is OFF everywhere else: an
// association that actually scores must never have a session closed out from
// under an evaluator who is still working.
import { connect } from "./_db.mjs";

const sql = connect(import.meta.url);
const arg = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
const COMMIT = process.argv.includes("--commit");
const OFF = process.argv.includes("--off");
const NAME = arg("--org");
if (!NAME) { console.error('Usage: --org "<name fragment>" [--off] [--commit]'); process.exit(1); }

await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS auto_close_sessions BOOLEAN NOT NULL DEFAULT false`;

const orgs = await sql`SELECT id, name, auto_close_sessions FROM organizations WHERE name ILIKE ${"%" + NAME + "%"} ORDER BY name`;
if (!orgs.length) { console.error(`No organization matching "${NAME}"`); process.exit(1); }
if (orgs.length > 1) {
  console.error(`"${NAME}" matches ${orgs.length} organizations -- be more specific:`);
  orgs.forEach(o => console.error(`   ${o.id}  ${o.name}`));
  process.exit(1);
}
const org = orgs[0];
console.log(`${org.name} (org ${org.id})`);
console.log(`  auto_close_sessions: ${org.auto_close_sessions}  ->  ${!OFF}`);

// What the very first run would close, so a surprise backfill is visible first.
const pending = await sql`
  SELECT COUNT(*)::int AS n FROM evaluator_session_signups ess
  JOIN evaluation_schedule es ON es.id = ess.schedule_id
  JOIN age_categories ac ON ac.id = es.age_category_id
  WHERE ac.organization_id = ${org.id}
    AND ess.closed_at IS NULL AND ess.status = 'signed_up' AND es.status = 'scheduled'
    AND (es.scheduled_date + COALESCE(es.end_time, es.start_time)) AT TIME ZONE 'America/Edmonton' <= NOW()`;
console.log(`  sign-ups the first run would close: ${pending[0].n}`);

const others = await sql`SELECT name FROM organizations WHERE auto_close_sessions = true AND id <> ${org.id}`;
console.log(`  other orgs with auto-close on: ${others.map(o => o.name).join(", ") || "none"}`);

if (!COMMIT) { console.log("\nDRY RUN -- re-run with --commit."); process.exit(0); }

await sql`UPDATE organizations SET auto_close_sessions = ${!OFF} WHERE id = ${org.id}`;
const [after] = await sql`SELECT auto_close_sessions FROM organizations WHERE id = ${org.id}`;
console.log(`\nauto_close_sessions is now ${after.auto_close_sessions} for ${org.name}.`);
