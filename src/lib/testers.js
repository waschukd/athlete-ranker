// SP Testers — capability plumbing (Phase 1 foundation).
//
// Testers and evaluators are separate pools. Because a person can hold only ONE
// evaluator_memberships row per org (unique user_id+organization_id), capability is
// carried by two flags on that row: is_tester / is_evaluator (a person can have
// either or both). Capability is ALWAYS derived from active memberships here —
// never from the JWT role alone — so the "no evaluator membership → no evaluator
// data" guarantee is enforced server-side wherever this is called.
import sql from "@/lib/db";
import { getAppUserId } from "@/lib/auth";

// What the logged-in person can actually do, from their active SP memberships.
// Returns { userId, isTester, isEvaluator, testerOrgIds, evaluatorOrgIds, spOrgIds }.
export async function getSpCapabilities(session) {
  const userId = await getAppUserId(session);
  const empty = { userId: null, isTester: false, isEvaluator: false, testerOrgIds: [], evaluatorOrgIds: [], spOrgIds: [] };
  if (!userId) return empty;
  // No org-type filter: an is_evaluator membership lives directly on the
  // ASSOCIATION's own org for a direct/coach evaluator (never an SP org), while
  // is_tester only ever lives on an SP org in practice (testers are always
  // added through an SP flow) -- so scoping to service_provider/
  // goalie_service_provider org types here silently dropped every direct
  // association evaluator's is_evaluator flag, leaving them stuck on "My
  // Sessions (0) / Available (0)" since the dashboard gates both queries on it.
  const rows = await sql`
    SELECT em.organization_id, em.is_tester, em.is_evaluator
    FROM evaluator_memberships em
    WHERE em.user_id = ${userId} AND em.status = 'active'`;
  const testerOrgIds = [...new Set(rows.filter(r => r.is_tester).map(r => r.organization_id))];
  const evaluatorOrgIds = [...new Set(rows.filter(r => r.is_evaluator).map(r => r.organization_id))];
  return {
    userId,
    isTester: testerOrgIds.length > 0,
    isEvaluator: evaluatorOrgIds.length > 0,
    testerOrgIds,
    evaluatorOrgIds,
    spOrgIds: [...new Set(rows.map(r => r.organization_id))],
  };
}
