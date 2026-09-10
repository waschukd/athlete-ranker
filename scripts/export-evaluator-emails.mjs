// CSV of every evaluator's email.
//
//   node scripts/export-evaluator-emails.mjs
//   node scripts/export-evaluator-emails.mjs --out "C:/Users/dan/Desktop/evaluators.csv"
//   node scripts/export-evaluator-emails.mjs --include-inactive
//
// Membership carries two independent flags, is_evaluator and is_tester, so
// "evaluator" is not a role name to match on -- it is is_evaluator = true.
// Someone who is BOTH is still an evaluator and belongs on this list; only the
// tester-only people are left off.
//
// One row per person, not per membership: an evaluator working three
// associations is one contact, with the orgs listed in a single column. A CSV
// with the same address three times is a mail-merge that emails them three
// times.
import { connect } from "./_db.mjs";
import { writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";

const sql = connect(import.meta.url);
const arg = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
// Desktop is OneDrive-redirected on this machine, so resolve it rather than
// assuming %USERPROFILE%\Desktop, which does not exist here.
const DESKTOP = existsSync(`${homedir()}/OneDrive/Desktop`) ? `${homedir()}/OneDrive/Desktop` : `${homedir()}/Desktop`;
const OUT = arg("--out") || `${DESKTOP}/sideline-star-evaluators.csv`;
// Removed people and dead memberships are off by default -- this list exists to
// be emailed, and a suspended evaluator was suspended for a reason.
const INCLUDE_INACTIVE = process.argv.includes("--include-inactive");
// Demo/seed accounts are real rows in a real org, so nothing about the data
// marks them as fake -- but a list meant for emailing must not carry them.
const INCLUDE_DEMO = process.argv.includes("--include-demo");

const rows = await sql`
  SELECT u.id, u.name, u.email, u.phone, u.role, u.is_suspended,
         BOOL_OR(em.is_evaluator) AS is_evaluator,
         BOOL_OR(em.is_tester)    AS is_tester,
         BOOL_OR(em.is_lead)      AS is_lead,
         STRING_AGG(DISTINCT o.name, '; ' ORDER BY o.name) AS orgs,
         MIN(em.created_at)       AS joined,
         (SELECT COUNT(*)::int FROM category_scores cs WHERE cs.evaluator_id = u.id) AS scores,
         (SELECT COUNT(*)::int FROM evaluator_session_signups s
            WHERE s.user_id = u.id AND s.status = 'signed_up') AS upcoming
  FROM users u
  JOIN evaluator_memberships em ON em.user_id = u.id
  JOIN organizations o ON o.id = em.organization_id
  WHERE em.is_evaluator = true
    ${INCLUDE_INACTIVE ? sql`` : sql`AND em.status = 'active' AND COALESCE(u.is_suspended, false) = false`}
    ${INCLUDE_DEMO ? sql`` : sql`AND o.name NOT ILIKE '%demo%' AND u.email NOT ILIKE '%@ctdemo.%' AND u.email NOT ILIKE '%example%'`}
  GROUP BY u.id, u.name, u.email, u.phone, u.role, u.is_suspended
  HAVING u.email IS NOT NULL AND u.email <> ''
  ORDER BY LOWER(SPLIT_PART(TRIM(u.name), ' ', -1)), LOWER(u.name)`;

const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const header = ["Name", "Email", "Phone", "Organizations", "Also Tester", "Lead", "Scores Recorded", "Upcoming Sessions"];
const csv = [header.map(q).join(",")]
  .concat(rows.map(r => [
    r.name, r.email, r.phone || "", r.orgs,
    r.is_tester ? "Yes" : "", r.is_lead ? "Yes" : "",
    r.scores, r.upcoming,
  ].map(q).join(",")))
  .join("\r\n") + "\r\n"; // CRLF so Excel opens it cleanly

writeFileSync(OUT, "\uFEFF" + csv, "utf8"); // BOM: Excel mangles accented names without it

const dual = rows.filter(r => r.is_tester).length;
console.log(`${rows.length} evaluators written to ${OUT}`);
console.log(`  of those, ${dual} also hold a tester role (kept, per the dual-role rule)`);

const testerOnly = await sql`
  SELECT COUNT(DISTINCT u.id)::int AS n FROM users u
  JOIN evaluator_memberships em ON em.user_id = u.id
  WHERE em.is_tester = true AND em.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM evaluator_memberships e2
                    WHERE e2.user_id = u.id AND e2.is_evaluator = true AND e2.status = 'active')`;
console.log(`  ${testerOnly[0].n} tester-only people excluded`);
if (!INCLUDE_DEMO) console.log(`  demo/seed accounts excluded -- use --include-demo to keep them`);

if (!INCLUDE_INACTIVE) {
  const [skipped] = await sql`
    SELECT COUNT(DISTINCT u.id)::int AS n FROM users u
    JOIN evaluator_memberships em ON em.user_id = u.id
    WHERE em.is_evaluator = true AND (em.status <> 'active' OR COALESCE(u.is_suspended, false) = true)
      AND NOT EXISTS (SELECT 1 FROM evaluator_memberships e3
                      WHERE e3.user_id = u.id AND e3.is_evaluator = true AND e3.status = 'active')`;
  if (skipped.n) console.log(`  ${skipped.n} removed/suspended evaluator(s) excluded -- use --include-inactive to keep them`);
}
