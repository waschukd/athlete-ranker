import sql from "@/lib/db";

// The service provider's own admins -- the people who staff sessions and
// need to hear when an evaluator or tester drops one.
//
// The query this replaces was hand-copied in three routes and matched on
// users.role IN ('service_provider_admin', 'association_admin') across every
// org the cancelling evaluator belonged to. Two leaks fell out of that:
//
//   - An evaluator on the SP's roster whose GLOBAL role is association_admin
//     (they run an association's tryouts, and also evaluate for the SP)
//     matched as an "SP admin". Every evaluator and tester cancellation the
//     SP ever had went to one such person from day one, and to a second the
//     day he was made a KC North admin.
//   - Expanding to the evaluator's own orgs meant an association's admins
//     could be copied on the SP's staffing alerts whenever the evaluator
//     also belonged to that association.
//
// Recipient now = active membership in a service-provider org from the given
// set, and a service_provider_admin role. Association orgs in the set are
// ignored; association admins are never staffing recipients.
export async function spAdminRecipients(orgIds) {
  const ids = [...new Set((orgIds || []).map(Number).filter(Number.isFinite))];
  if (!ids.length) return [];
  return sql`
    SELECT DISTINCT u.email, u.name
    FROM evaluator_memberships em
    JOIN users u ON u.id = em.user_id
    JOIN organizations o ON o.id = em.organization_id
    WHERE em.status = 'active'
      AND u.role = 'service_provider_admin'
      AND o.type = 'service_provider'
      AND em.organization_id = ANY(${ids})
  `;
}

// The SP org ids that staff an association's sessions (active links), plus
// an explicit service_provider_id when the schedule row carries one.
export async function spOrgIdsFor({ associationOrgId = null, serviceProviderId = null } = {}) {
  const rows = associationOrgId
    ? await sql`SELECT service_provider_id FROM sp_association_links WHERE association_id = ${associationOrgId} AND status = 'active'`
    : [];
  const ids = rows.map(r => r.service_provider_id);
  if (serviceProviderId) ids.push(serviceProviderId);
  return ids;
}
