import sql from "./db";

/**
 * Check if a user session has access to a specific age category.
 * Returns { authorized: true, orgId } or { authorized: false }.
 *
 * Access rules:
 *  - super_admin: always allowed
 *  - service_provider_admin: allowed if SP is linked to the category's association
 *  - association_admin: allowed if they admin the category's organization
 *  - director: allowed if assigned to this specific category
 *  - evaluator/volunteer: allowed if they have membership in the category's organization
 */
export async function authorizeCategoryAccess(session, catId) {
  if (!session?.email || !catId) return { authorized: false };

  // Super admin — always allowed
  if (session.role === "super_admin") {
    const cat = await sql`SELECT organization_id FROM age_categories WHERE id = ${catId}`;
    return cat.length ? { authorized: true, orgId: cat[0].organization_id } : { authorized: false };
  }

  // Get the category's organization
  const cat = await sql`SELECT organization_id FROM age_categories WHERE id = ${catId}`;
  if (!cat.length) return { authorized: false };
  const orgId = cat[0].organization_id;

  // Get the user's app ID
  const users = await sql`SELECT id FROM users WHERE email = ${session.email}`;
  if (!users.length) return { authorized: false };
  const userId = users[0].id;

  // Service provider admin — allowed if their SP is linked to the category's association
  if (session.role === "service_provider_admin") {
    const linked = await sql`
      SELECT sal.id FROM sp_association_links sal
      JOIN organizations o ON o.id = sal.service_provider_id
      WHERE o.contact_email = ${session.email}
        AND sal.association_id = ${orgId}
    `;
    if (linked.length) return { authorized: true, orgId };

    // Also check if they directly own this org (some SPs may have categories directly)
    const directOwner = await sql`
      SELECT id FROM organizations WHERE id = ${orgId} AND contact_email = ${session.email}
    `;
    if (directOwner.length) return { authorized: true, orgId };

    return { authorized: false };
  }

  // Association admin — allowed if they admin this category's organization
  if (session.role === "association_admin") {
    // Check via contact_email
    const owner = await sql`
      SELECT id FROM organizations WHERE id = ${orgId} AND contact_email = ${session.email}
    `;
    if (owner.length) return { authorized: true, orgId };

    // Check via user_organization_roles (for invited admins)
    const role = await sql`
      SELECT id FROM user_organization_roles
      WHERE user_id = ${userId} AND organization_id = ${orgId}
    `;
    if (role.length) return { authorized: true, orgId };

    return { authorized: false };
  }

  // Director — allowed if assigned to this specific category
  if (session.role === "director") {
    const assignment = await sql`
      SELECT id FROM director_assignments
      WHERE user_id = ${userId} AND age_category_id = ${catId} AND status = 'active'
    `;
    return assignment.length ? { authorized: true, orgId } : { authorized: false };
  }

  // Evaluator / Volunteer — allowed if they have membership in the category's organization
  if (["association_evaluator", "service_provider_evaluator", "volunteer"].includes(session.role)) {
    // Direct membership
    const membership = await sql`
      SELECT id FROM evaluator_memberships
      WHERE user_id = ${userId} AND organization_id = ${orgId} AND status = 'active'
    `;
    if (membership.length) return { authorized: true, orgId };

    // For SP evaluators, also check if their SP is linked to this association
    if (session.role === "service_provider_evaluator") {
      const spLink = await sql`
        SELECT sal.id FROM sp_association_links sal
        JOIN evaluator_memberships em ON em.organization_id = sal.service_provider_id
        WHERE em.user_id = ${userId} AND sal.association_id = ${orgId} AND em.status = 'active'
      `;
      if (spLink.length) return { authorized: true, orgId };
    }

    return { authorized: false };
  }

  return { authorized: false };
}

/**
 * Check if a user session has access to a specific organization.
 * Used by the organizations API to filter results.
 */
export async function authorizeOrgAccess(session, orgId) {
  if (!session?.email || !orgId) return { authorized: false };

  if (session.role === "super_admin") return { authorized: true };

  const users = await sql`SELECT id FROM users WHERE email = ${session.email}`;
  if (!users.length) return { authorized: false };
  const userId = users[0].id;

  // Direct org owner
  const owner = await sql`
    SELECT id FROM organizations WHERE id = ${orgId} AND contact_email = ${session.email}
  `;
  if (owner.length) return { authorized: true };

  // user_organization_roles
  const role = await sql`
    SELECT id FROM user_organization_roles WHERE user_id = ${userId} AND organization_id = ${orgId}
  `;
  if (role.length) return { authorized: true };

  // SP linked to association
  if (session.role === "service_provider_admin") {
    const linked = await sql`
      SELECT sal.id FROM sp_association_links sal
      JOIN organizations o ON o.id = sal.service_provider_id
      WHERE o.contact_email = ${session.email} AND sal.association_id = ${orgId}
    `;
    if (linked.length) return { authorized: true };
  }

  // Evaluator membership
  if (["association_evaluator", "service_provider_evaluator", "volunteer", "director"].includes(session.role)) {
    const membership = await sql`
      SELECT id FROM evaluator_memberships
      WHERE user_id = ${userId} AND organization_id = ${orgId} AND status = 'active'
    `;
    if (membership.length) return { authorized: true };
  }

  return { authorized: false };
}

/**
 * Get all organization IDs a user has access to (for filtering lists).
 */
export async function getAccessibleOrgIds(session) {
  if (!session?.email) return [];

  if (session.role === "super_admin") return null; // null = all orgs

  const users = await sql`SELECT id FROM users WHERE email = ${session.email}`;
  if (!users.length) return [];
  const userId = users[0].id;

  const orgIds = new Set();

  // Orgs where user is contact
  const owned = await sql`SELECT id FROM organizations WHERE contact_email = ${session.email}`;
  owned.forEach(o => orgIds.add(o.id));

  // Orgs via user_organization_roles
  const roles = await sql`SELECT organization_id FROM user_organization_roles WHERE user_id = ${userId}`;
  roles.forEach(r => orgIds.add(r.organization_id));

  // Orgs via evaluator_memberships
  const memberships = await sql`SELECT organization_id FROM evaluator_memberships WHERE user_id = ${userId} AND status = 'active'`;
  memberships.forEach(m => orgIds.add(m.organization_id));

  // For SP admin, include linked associations
  if (session.role === "service_provider_admin") {
    const spOrgs = [...orgIds];
    for (const spId of spOrgs) {
      const linked = await sql`SELECT association_id FROM sp_association_links WHERE service_provider_id = ${spId}`;
      linked.forEach(l => orgIds.add(l.association_id));
    }
  }

  // For directors, include orgs of their assigned categories
  if (session.role === "director") {
    const assignments = await sql`
      SELECT DISTINCT ac.organization_id FROM director_assignments da
      JOIN age_categories ac ON ac.id = da.age_category_id
      WHERE da.user_id = ${userId} AND da.status = 'active'
    `;
    assignments.forEach(a => orgIds.add(a.organization_id));
  }

  return [...orgIds];
}
