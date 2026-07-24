import sql from "@/lib/db";

// Who can work an association's sessions, and who leads it.
//
// The wrinkle: evaluators and testers are members of the SERVICE PROVIDER, not
// the associations it serves — so eligibility for association X's sessions comes
// from X's own members (in-house) plus the members of any SP actively serving X.
// A "lead of X", by contrast, is a designation ON X specifically, so it survives
// even though the person's working membership lives on the SP.

// Org ids whose active memberships supply people to this association.
export async function memberSourceOrgIds(associationOrgId) {
  const sps = await sql`
    SELECT service_provider_id AS id FROM sp_association_links
    WHERE association_id = ${associationOrgId} AND status = 'active'`;
  return [associationOrgId, ...sps.map(s => s.id)];
}

// Everyone eligible to work this association's sessions, deduped by user, with
// capability flags OR'd across their rows. is_lead is true only when they hold a
// lead designation ON THIS association (not merely a lead of the SP elsewhere).
export async function eligiblePeople(associationOrgId) {
  const orgIds = await memberSourceOrgIds(associationOrgId);
  return sql`
    SELECT em.user_id, u.name, u.email,
           bool_or(em.is_evaluator) AS is_evaluator,
           bool_or(em.is_tester) AS is_tester,
           bool_or(em.is_lead AND em.organization_id = ${associationOrgId}) AS is_lead
    FROM evaluator_memberships em
    JOIN users u ON u.id = em.user_id
    WHERE em.organization_id = ANY(${orgIds}) AND em.status = 'active'
    GROUP BY em.user_id, u.name, u.email
    ORDER BY u.name`;
}

// Is this user eligible to work the association, and in what capacities?
export async function eligibilityOf(associationOrgId, userId) {
  const orgIds = await memberSourceOrgIds(associationOrgId);
  const r = await sql`
    SELECT bool_or(is_evaluator) AS evaluator, bool_or(is_tester) AS tester
    FROM evaluator_memberships
    WHERE user_id = ${userId} AND organization_id = ANY(${orgIds}) AND status = 'active'`;
  return { evaluator: r[0]?.evaluator || false, tester: r[0]?.tester || false };
}

// Promote/demote a lead of an association. Because an SP evaluator has no row on
// the association, promotion UPSERTS a designation row there; demotion drops a
// designation row we created but only clears the flag on a pre-existing (in-house)
// row, so we never delete someone's real membership.
export async function setLead(associationOrgId, userId, isLead) {
  const [existing] = await sql`
    SELECT id, joined_via FROM evaluator_memberships
    WHERE user_id = ${userId} AND organization_id = ${associationOrgId} AND status = 'active'`;

  if (isLead) {
    if (existing) {
      await sql`UPDATE evaluator_memberships SET is_lead = true WHERE id = ${existing.id}`;
    } else {
      await sql`INSERT INTO evaluator_memberships (user_id, organization_id, role, is_evaluator, is_tester, is_lead, status, joined_via)
                VALUES (${userId}, ${associationOrgId}, 'lead', true, false, true, 'active', 'lead_designation')`;
    }
    return true;
  }

  if (!existing) return false;
  if (existing.joined_via === "lead_designation") {
    await sql`DELETE FROM evaluator_memberships WHERE id = ${existing.id}`;
  } else {
    await sql`UPDATE evaluator_memberships SET is_lead = false WHERE id = ${existing.id}`;
  }
  return true;
}
