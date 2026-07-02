// SP Testers — capability plumbing (Phase 1 foundation).
//
// Testers and evaluators are separate pools, both stored in evaluator_memberships
// under a service-provider org, distinguished by role. A person can hold either or
// both. Capability is ALWAYS derived from active memberships here — never from the
// JWT role alone — so the "no evaluator membership → no evaluator data" guarantee
// is enforced server-side wherever this is called.
import sql from "@/lib/db";
import { getAppUserId } from "@/lib/auth";

export const TESTER_ROLE = "service_provider_tester";
export const SP_EVALUATOR_ROLE = "service_provider_evaluator";

// What the logged-in person can actually do, from their active SP memberships.
// Returns { userId, isTester, isEvaluator, testerOrgIds, evaluatorOrgIds, spOrgIds }.
export async function getSpCapabilities(session) {
  const userId = await getAppUserId(session);
  const empty = { userId: null, isTester: false, isEvaluator: false, testerOrgIds: [], evaluatorOrgIds: [], spOrgIds: [] };
  if (!userId) return empty;
  const rows = await sql`
    SELECT em.organization_id, em.role
    FROM evaluator_memberships em
    JOIN organizations o ON o.id = em.organization_id
    WHERE em.user_id = ${userId} AND em.status = 'active'
      AND o.type IN ('service_provider', 'goalie_service_provider')`;
  const testerOrgIds = [...new Set(rows.filter(r => r.role === TESTER_ROLE).map(r => r.organization_id))];
  const evaluatorOrgIds = [...new Set(rows.filter(r => r.role === SP_EVALUATOR_ROLE).map(r => r.organization_id))];
  return {
    userId,
    isTester: testerOrgIds.length > 0,
    isEvaluator: evaluatorOrgIds.length > 0,
    testerOrgIds,
    evaluatorOrgIds,
    spOrgIds: [...new Set(rows.map(r => r.organization_id))],
  };
}

// Guard for tester-only endpoints: the caller must hold an active tester membership
// (optionally in a specific SP org). Returns { ok, userId, reason }.
export async function requireTester(session, orgId = null) {
  const cap = await getSpCapabilities(session);
  if (!cap.isTester) return { ok: false, reason: "not_a_tester", userId: cap.userId };
  if (orgId != null && !cap.testerOrgIds.includes(Number(orgId))) return { ok: false, reason: "wrong_org", userId: cap.userId };
  return { ok: true, userId: cap.userId, capabilities: cap };
}
