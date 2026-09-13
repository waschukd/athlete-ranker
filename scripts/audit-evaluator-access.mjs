// Two ways a real evaluator ends up unable to open their own session:
//
//   1. A coach row (category_evaluators.kind='coach') on ANY category of an
//      org scopes their entire visibility for that org to those categories.
//      A CT evaluator who also coaches one EFHA team loses every other EFHA
//      session she is signed up for.
//
//   2. A tester flag (is_tester) on an SP membership makes the dashboard hide
//      any evaluation session overlapping that SP's testing events. A tester
//      promoted to evaluator keeps the flag by design, and then loses her
//      sessions on every day CT is testing somewhere.
//
//   node scripts/audit-evaluator-access.mjs
//
// Read-only. Lists who is exposed, with the sessions actually at risk.
import { connect } from "./_db.mjs";
const sql = connect(import.meta.url);

const coachScoped = await sql`
  SELECT DISTINCT u.id, u.name, u.email, o.name AS org,
    STRING_AGG(DISTINCT c.name, ', ') AS coach_of,
    (SELECT COUNT(*)::int FROM evaluator_session_signups s JOIN evaluation_schedule es ON es.id=s.schedule_id
       JOIN age_categories c2 ON c2.id=es.age_category_id
     WHERE s.user_id=u.id AND s.status='signed_up' AND es.scheduled_date >= CURRENT_DATE
       AND c2.organization_id=o.id AND c2.id NOT IN (SELECT age_category_id FROM category_evaluators WHERE user_id=u.id)) AS hidden_signups
  FROM category_evaluators ce JOIN users u ON u.id=ce.user_id
  JOIN age_categories c ON c.id=ce.age_category_id JOIN organizations o ON o.id=c.organization_id
  JOIN evaluator_memberships em ON em.user_id=u.id AND em.status='active' AND em.is_evaluator
  WHERE ce.kind='coach' GROUP BY u.id, u.name, u.email, o.id, o.name ORDER BY u.name`;
console.log(`COACH ROWS on evaluators (${coachScoped.length}):`);
for (const r of coachScoped) console.log(`  ${r.name} <${r.email}> coaches ${r.org} ${r.coach_of} -- ${r.hidden_signups} upcoming signup(s) in that org they cannot see`);
if (!coachScoped.length) console.log("  none");

const dual = await sql`
  SELECT u.id, u.name, u.email, em.organization_id AS sp,
    (SELECT COUNT(*)::int FROM evaluator_session_signups s JOIN evaluation_schedule sch ON sch.id=s.schedule_id
     WHERE s.user_id=u.id AND s.status='signed_up' AND sch.scheduled_date >= CURRENT_DATE
       AND EXISTS (SELECT 1 FROM evaluation_schedule tes LEFT JOIN category_sessions tcs ON tcs.age_category_id=tes.age_category_id AND tcs.session_number=tes.session_number
                   LEFT JOIN age_categories tac ON tac.id=tes.age_category_id
                   WHERE tes.scheduled_date=sch.scheduled_date AND tes.status='scheduled' AND sch.start_time < tes.end_time AND tes.start_time < sch.end_time
                     AND (tes.service_provider_id=em.organization_id OR (tcs.session_type='testing' AND tac.organization_id IN (SELECT association_id FROM sp_association_links WHERE service_provider_id=em.organization_id AND status='active'))))) AS conflicting
  FROM evaluator_memberships em JOIN users u ON u.id=em.user_id
  WHERE em.status='active' AND em.is_evaluator AND em.is_tester ORDER BY u.name`;
console.log(`\nDUAL tester+evaluator (${dual.length}):`);
for (const r of dual) console.log(`  ${r.name} <${r.email}> -- ${r.conflicting} upcoming evaluation signup(s) overlapping a testing event${r.conflicting ? "  <-- was hidden before today's fix" : ""}`);
if (!dual.length) console.log("  none");
