// Move an evaluator from one organization to another.
//
//   node scripts/move-evaluator-org.mjs --user 228 --to 16            (dry run)
//   node scripts/move-evaluator-org.mjs --user 228 --to 16 --commit
//
// Daniel Basterash was invited by EFHA and the invite created his account as an
// association_evaluator of EFHA. He actually evaluates for Competitive Thread,
// so the evaluator dashboard showed him EFHA's sessions and none of CT's --
// reported as "he cannot see the sessions".
//
// Session visibility comes from evaluator_memberships (active + is_evaluator)
// plus the service-provider -> association links, so moving the membership is
// what fixes it; users.role is updated to match so the rest of the app agrees.
//
// Past sign-ups and recorded scores are NOT touched. They are that person's
// history, they belong to the sessions they were actually at, and scores are
// keyed by evaluator_id regardless of which org the evaluator belongs to now.
import { connect } from "./_db.mjs";

const sql = connect(import.meta.url);
const arg = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
const COMMIT = process.argv.includes("--commit");
const USER_ID = parseInt(arg("--user"));
const TO_ORG = parseInt(arg("--to"));
if (!USER_ID || !TO_ORG) { console.error("Usage: --user <id> --to <orgId> [--commit]"); process.exit(1); }

const ROLE_FOR = {
  16: "service_provider_evaluator", // Competitive Thread (a service provider)
};

const [user] = await sql`SELECT id, name, email, role FROM users WHERE id = ${USER_ID}`;
if (!user) { console.error(`No user ${USER_ID}`); process.exit(1); }
const [org] = await sql`SELECT id, name, type FROM organizations WHERE id = ${TO_ORG}`;
if (!org) { console.error(`No organization ${TO_ORG}`); process.exit(1); }

// An SP evaluator and an association evaluator are different roles; pick from
// the destination org rather than assuming, so this is reusable.
const newRole = ROLE_FOR[TO_ORG]
  || (String(org.type || "").includes("service_provider") ? "service_provider_evaluator" : "association_evaluator");

console.log(`${user.name} <${user.email}>`);
console.log(`  role:  ${user.role}  ->  ${newRole}`);

const mems = await sql`
  SELECT em.id, em.organization_id, em.role, em.status, em.is_evaluator, em.is_tester, em.is_lead, o.name AS org
  FROM evaluator_memberships em JOIN organizations o ON o.id = em.organization_id
  WHERE em.user_id = ${USER_ID}`;
console.log(`  memberships now: ${mems.map(m => `${m.org}(${m.organization_id}) ${m.status}`).join(", ") || "none"}`);
console.log(`  memberships after: ${org.name}(${org.id}) active`);

const existing = mems.find(m => m.organization_id === TO_ORG);
if (existing) console.log(`  (already a member of ${org.name} -- will reactivate rather than duplicate)`);

const keep = await sql`
  SELECT (SELECT COUNT(*)::int FROM evaluator_session_signups WHERE user_id = ${USER_ID}) AS signups,
         (SELECT COUNT(*)::int FROM category_scores WHERE evaluator_id = ${USER_ID}) AS scores`;
console.log(`  untouched: ${keep[0].signups} past sign-up(s), ${keep[0].scores} recorded score(s)`);

// A category-level assignment is scoped to the old org and would be dead weight.
const catEvals = await sql`
  SELECT ce.id, c.name AS cat, o.name AS org
  FROM category_evaluators ce JOIN age_categories c ON c.id = ce.age_category_id
  JOIN organizations o ON o.id = c.organization_id
  WHERE ce.user_id = ${USER_ID} OR ce.email = ${user.email}`;
if (catEvals.length) console.log(`  category assignments to clear: ${catEvals.map(c => `${c.org}/${c.cat}`).join(", ")}`);

if (!COMMIT) { console.log("\nDRY RUN -- re-run with --commit."); process.exit(0); }

await sql`UPDATE users SET role = ${newRole} WHERE id = ${USER_ID}`;

if (existing) {
  await sql`UPDATE evaluator_memberships SET status = 'active', is_evaluator = true, role = ${newRole}
            WHERE id = ${existing.id}`;
  await sql`DELETE FROM evaluator_memberships WHERE user_id = ${USER_ID} AND organization_id <> ${TO_ORG}`;
} else {
  // Reuse a membership row if there is exactly one, so nothing else pointing at
  // it is orphaned; otherwise insert fresh.
  if (mems.length === 1) {
    await sql`UPDATE evaluator_memberships
              SET organization_id = ${TO_ORG}, role = ${newRole}, status = 'active', is_evaluator = true
              WHERE id = ${mems[0].id}`;
  } else {
    await sql`DELETE FROM evaluator_memberships WHERE user_id = ${USER_ID}`;
    await sql`INSERT INTO evaluator_memberships (user_id, organization_id, role, status, is_evaluator)
              VALUES (${USER_ID}, ${TO_ORG}, ${newRole}, 'active', true)`;
  }
}

for (const ce of catEvals) await sql`DELETE FROM category_evaluators WHERE id = ${ce.id}`;

const after = await sql`
  SELECT em.organization_id, em.role, em.status, em.is_evaluator, o.name AS org
  FROM evaluator_memberships em JOIN organizations o ON o.id = em.organization_id
  WHERE em.user_id = ${USER_ID}`;
const [u2] = await sql`SELECT role FROM users WHERE id = ${USER_ID}`;
console.log(`\nrole now: ${u2.role}`);
console.log(`memberships now: ${after.map(m => `${m.org}(${m.organization_id}) ${m.status} evaluator=${m.is_evaluator}`).join(", ")}`);
