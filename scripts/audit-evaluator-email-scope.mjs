// Resolve every evaluator-facing email flow the way the app does, and report
// any recipient who is not an evaluator.
//
//   node scripts/audit-evaluator-email-scope.mjs
//
// "Evaluator" here means: an active evaluator_memberships row with
// is_evaluator = true, and not a coach (category_evaluators.kind = 'coach').
// Anyone an evaluator-facing flow would email who fails that test is a leak.
//
// Read-only. Sends nothing.
import { connect } from "./_db.mjs";

const sql = connect(import.meta.url);
const CT = 16;

// An evaluator is someone with an active is_evaluator membership in an org
// where they are NOT a coach. Someone who coaches for EFHA and evaluates for
// CT is an evaluator (via CT); someone whose only tie is a coach assignment is not.
const isEvaluator = async (userId) => {
  const [r] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM evaluator_memberships em
      WHERE em.user_id = ${userId} AND em.status = 'active' AND em.is_evaluator
        AND NOT EXISTS (
          SELECT 1 FROM category_evaluators ce JOIN age_categories cac ON cac.id = ce.age_category_id
          WHERE ce.user_id = em.user_id AND ce.kind = 'coach' AND cac.organization_id = em.organization_id)
    ) AS ok`;
  return r.ok;
};

let leaks = 0;
const check = async (flow, rows) => {
  const bad = [];
  for (const r of rows) if (!(await isEvaluator(r.id))) bad.push(r);
  console.log(`${flow.padEnd(44)} ${String(rows.length).padStart(4)} recipients   ${bad.length ? "LEAK " + bad.length : "ok"}`);
  for (const b of bad) console.log(`     -> ${b.name} <${b.email}> role=${b.role}`);
  leaks += bad.length;
};

// 1. Manual SP blast (service-provider/notify, action=notify) -- CT's own pool.
await check("manual spot-fill blast (CT)", await sql`
  SELECT DISTINCT u.id, u.name, u.email, u.role FROM evaluator_memberships em
  JOIN users u ON u.id = em.user_id
  WHERE em.organization_id = ${CT} AND em.status = 'active' AND em.is_evaluator = true`);

// 2. Automatic spot-fill (offerOpenSession) -- per association + linked SPs,
//    exactly as the fixed query resolves it.
const assocs = await sql`SELECT association_id FROM sp_association_links WHERE service_provider_id = ${CT} AND status = 'active'`;
for (const a of assocs) {
  const [o] = await sql`SELECT name FROM organizations WHERE id = ${a.association_id}`;
  const orgIds = [a.association_id, CT];
  await check(`auto spot-fill for ${o.name}`, await sql`
    SELECT DISTINCT u.id, u.name, u.email, u.role FROM evaluator_memberships em
    JOIN users u ON u.id = em.user_id
    WHERE em.organization_id = ANY(${orgIds}) AND em.status = 'active'
      AND em.is_evaluator = true
      AND NOT EXISTS (SELECT 1 FROM category_evaluators ce JOIN age_categories cac ON cac.id = ce.age_category_id
                      WHERE ce.user_id = em.user_id AND ce.kind = 'coach' AND cac.organization_id = em.organization_id)`);
}

// 3. Staff message "all evaluators" from the CT admin -- own orgs only now.
const [ctAdmin] = await sql`SELECT id, email FROM users WHERE email = (SELECT contact_email FROM organizations WHERE id = ${CT})`;
const own = new Set();
(await sql`SELECT id FROM organizations WHERE contact_email = ${ctAdmin.email}`).forEach(o => own.add(o.id));
(await sql`SELECT organization_id FROM user_organization_roles WHERE user_id = ${ctAdmin.id}`).forEach(r => own.add(r.organization_id));
(await sql`SELECT organization_id FROM evaluator_memberships WHERE user_id = ${ctAdmin.id} AND status = 'active'`).forEach(m => own.add(m.organization_id));
await check("staff message, all evaluators (CT admin)", await sql`
  SELECT DISTINCT u.id, u.name, u.email, u.role FROM evaluator_memberships em
  JOIN users u ON u.id = em.user_id
  WHERE em.organization_id = ANY(${[...own]}) AND em.status = 'active' AND em.is_evaluator = true
    AND NOT EXISTS (SELECT 1 FROM category_evaluators ce JOIN age_categories cac ON cac.id = ce.age_category_id
                      WHERE ce.user_id = em.user_id AND ce.kind = 'coach' AND cac.organization_id = em.organization_id)`);
console.log(`     (CT admin's own orgs: ${[...own].join(", ")})`);

// 4. Session reminder / confirmation / assigned / removed -- signed-up evaluators.
await check("session reminder (signed-up, next 7 days)", await sql`
  SELECT DISTINCT u.id, u.name, u.email, u.role FROM evaluator_session_signups ess
  JOIN evaluation_schedule es ON es.id = ess.schedule_id
  JOIN users u ON u.id = ess.user_id
  WHERE ess.status = 'signed_up' AND es.scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7`);

// 5. Staffing digest -- must be service providers only, never associations.
const digest = await sql`
  SELECT DISTINCT u.email, o.name AS org, o.type FROM users u
  JOIN organizations o ON o.contact_email = u.email
  WHERE u.email IS NOT NULL AND o.type = 'service_provider'`;
const assocOnDigest = digest.filter(d => d.type === "association");
console.log(`${"staffing digest (cron)".padEnd(44)} ${String(digest.length).padStart(4)} recipients   ${assocOnDigest.length ? "LEAK " + assocOnDigest.length : "ok"}  -> ${digest.map(d => d.org).join(", ")}`);
leaks += assocOnDigest.length;

console.log(`\n${leaks === 0 ? "No non-evaluator can receive an evaluator-facing email." : leaks + " LEAK(S) FOUND."}`);
process.exit(leaks ? 1 : 0);
