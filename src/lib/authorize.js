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

  // Service provider admin — allowed if an SP they administer is linked to the
  // category's association. "Administer" = the SP's contact_email OR an
  // additional admin via user_organization_roles (e.g. someone invited as a
  // second SP admin). Without the user_organization_roles arm, only the original
  // contact could reach client data.
  if (session.role === "service_provider_admin") {
    const linked = await sql`
      SELECT 1 FROM sp_association_links sal
      JOIN organizations sp ON sp.id = sal.service_provider_id AND sp.type = 'service_provider'
      WHERE sal.association_id = ${orgId} AND sal.status = 'active'
        AND (
          sp.contact_email = ${session.email}
          OR EXISTS (SELECT 1 FROM user_organization_roles uor WHERE uor.organization_id = sp.id AND uor.user_id = ${userId})
        )
    `;
    if (linked.length) return { authorized: true, orgId };

    // Or they directly own / have a role on the category's org itself
    const directOwner = await sql`SELECT id FROM organizations WHERE id = ${orgId} AND contact_email = ${session.email}`;
    if (directOwner.length) return { authorized: true, orgId };
    const directRole = await sql`SELECT id FROM user_organization_roles WHERE organization_id = ${orgId} AND user_id = ${userId}`;
    if (directRole.length) return { authorized: true, orgId };

    return { authorized: false };
  }

  // Goalie service provider admin — allowed for a category whose association is
  // actively linked to a goalie SP they administer. The scoring screen scopes
  // their roster to goalies (kind='goalie'), so this grants goalie-eval access
  // for their linked associations without touching skater scoping.
  if (session.role === "goalie_service_provider_admin") {
    const linked = await sql`
      SELECT 1 FROM sp_association_links sal
      JOIN organizations sp ON sp.id = sal.service_provider_id AND sp.type = 'goalie_service_provider'
      WHERE sal.association_id = ${orgId} AND sal.status = 'active'
        AND (
          sp.contact_email = ${session.email}
          OR EXISTS (SELECT 1 FROM user_organization_roles uor WHERE uor.organization_id = sp.id AND uor.user_id = ${userId})
        )
    `;
    if (linked.length) return { authorized: true, orgId };
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

  // Evaluator — allowed if they have membership in the category's organization.
  // Volunteers are intentionally excluded: their only access is the separate
  // check-in flow (checkin-token path), never authenticated category access.
  if (["association_evaluator", "service_provider_evaluator"].includes(session.role)) {
    // Direct membership
    const membership = await sql`
      SELECT id FROM evaluator_memberships
      WHERE user_id = ${userId} AND organization_id = ${orgId} AND status = 'active'
    `;
    if (membership.length) return { authorized: true, orgId };

    // For SP evaluators, also check if their SP is linked to this association.
    // Restrict to SKATER service providers — a goalie SP's evaluators resolve to
    // the same 'service_provider_evaluator' role but must NEVER reach skater
    // category data. (Goalie evaluators score goalies via the check-in flow,
    // which scopes the roster to goalies.)
    if (session.role === "service_provider_evaluator") {
      const spLink = await sql`
        SELECT sal.id FROM sp_association_links sal
        JOIN evaluator_memberships em ON em.organization_id = sal.service_provider_id
        JOIN organizations sp ON sp.id = sal.service_provider_id AND sp.type = 'service_provider'
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

  // SP linked to association — recognise the SP via contact_email OR an
  // additional admin's user_organization_roles row.
  if (session.role === "service_provider_admin") {
    const linked = await sql`
      SELECT 1 FROM sp_association_links sal
      JOIN organizations sp ON sp.id = sal.service_provider_id AND sp.type = 'service_provider'
      WHERE sal.association_id = ${orgId} AND sal.status = 'active'
        AND (
          sp.contact_email = ${session.email}
          OR EXISTS (SELECT 1 FROM user_organization_roles uor WHERE uor.organization_id = sp.id AND uor.user_id = ${userId})
        )
    `;
    if (linked.length) return { authorized: true };
  }

  // Goalie SP linked to association — same as a skater SP (org-level access to
  // their client associations); the view is scoped to goalies downstream.
  if (session.role === "goalie_service_provider_admin") {
    const linked = await sql`
      SELECT 1 FROM sp_association_links sal
      JOIN organizations sp ON sp.id = sal.service_provider_id AND sp.type = 'goalie_service_provider'
      WHERE sal.association_id = ${orgId} AND sal.status = 'active'
        AND (
          sp.contact_email = ${session.email}
          OR EXISTS (SELECT 1 FROM user_organization_roles uor WHERE uor.organization_id = sp.id AND uor.user_id = ${userId})
        )
    `;
    if (linked.length) return { authorized: true };
  }

  // Evaluator membership
  if (["association_evaluator", "service_provider_evaluator", "director"].includes(session.role)) {
    const membership = await sql`
      SELECT id FROM evaluator_memberships
      WHERE user_id = ${userId} AND organization_id = ${orgId} AND status = 'active'
    `;
    if (membership.length) return { authorized: true };
  }

  return { authorized: false };
}

/**
 * Can this user manage WHO evaluates a session for an association — see the
 * roster, add someone, take a spot from someone, promote a lead?
 *
 * Rules (owner's call):
 *  - super_admin           → always (the safety net)
 *  - lead of the assoc     → always for their association (SP-served or not)
 *  - SP admin              → for any association their SP actively serves
 *  - association_admin      → ONLY when the association runs in-house
 *                            (no active service provider). If an SP serves them,
 *                            the SP handles evaluators and the association is
 *                            locked out.
 *
 * Returns { authorized, reason, isLead, spServed }.
 */
export async function canManageSessionAssignments(session, orgId) {
  if (!session?.email || !orgId) return { authorized: false, reason: "no_session" };
  if (session.role === "super_admin") return { authorized: true, reason: "super_admin" };

  const users = await sql`SELECT id FROM users WHERE email = ${session.email}`;
  if (!users.length) return { authorized: false, reason: "no_user" };
  const userId = users[0].id;

  // Is this association served by an active service provider?
  const sp = await sql`
    SELECT sal.service_provider_id AS sp_id, o.contact_email
    FROM sp_association_links sal
    JOIN organizations o ON o.id = sal.service_provider_id
    WHERE sal.association_id = ${orgId} AND sal.status = 'active'
  `;
  const spServed = sp.length > 0;

  // Lead of THIS association — authority regardless of who runs the evals.
  const lead = await sql`
    SELECT 1 FROM evaluator_memberships
    WHERE user_id = ${userId} AND organization_id = ${orgId}
      AND status = 'active' AND is_lead = true
  `;
  if (lead.length) return { authorized: true, reason: "lead", isLead: true, spServed };

  // SP admin of a provider that serves this association.
  const spAdmin = sp.some(row =>
    row.contact_email === session.email,
  ) || (spServed && await (async () => {
    const r = await sql`
      SELECT 1 FROM user_organization_roles uor
      WHERE uor.user_id = ${userId} AND uor.organization_id = ANY(${sp.map(s => s.sp_id)})
    `;
    return r.length > 0;
  })());
  if (spAdmin) return { authorized: true, reason: "sp_admin", spServed };

  // Association admin — in-house only. Locked out the moment an SP serves them.
  if (!spServed) {
    const owner = await sql`SELECT 1 FROM organizations WHERE id = ${orgId} AND contact_email = ${session.email}`;
    if (owner.length) return { authorized: true, reason: "assoc_admin_inhouse", spServed };
    const role = await sql`SELECT 1 FROM user_organization_roles WHERE user_id = ${userId} AND organization_id = ${orgId}`;
    if (role.length) return { authorized: true, reason: "assoc_admin_inhouse", spServed };
  }

  return { authorized: false, reason: spServed ? "sp_served_locked" : "not_authorized", spServed };
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

  // For either SP type, include linked client associations.
  if (session.role === "service_provider_admin" || session.role === "goalie_service_provider_admin") {
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

/**
 * Check if a user session can view a specific evaluator's full record.
 * Used by /api/service-provider/evaluator/[evalId] which exposes session
 * history, flags, ratings, and hours — sensitive data only admins of an
 * org the evaluator belongs to should see.
 *
 * Access rules:
 *  - super_admin: always allowed
 *  - service_provider_admin / association_admin: allowed if caller's
 *    accessible org set intersects the evaluator's org set (where the
 *    evaluator's orgs come from active evaluator_memberships or active
 *    director_assignments via age_categories.organization_id)
 *  - everyone else: denied
 */
export async function canViewEvaluator(session, evalId) {
  if (!session?.email || !evalId) return false;

  if (session.role === "super_admin") return true;

  if (!["service_provider_admin", "goalie_service_provider_admin", "association_admin"].includes(session.role)) {
    return false;
  }

  const memberships = await sql`
    SELECT organization_id FROM evaluator_memberships
    WHERE user_id = ${evalId} AND status = 'active'
  `;
  const directorOrgs = await sql`
    SELECT DISTINCT ac.organization_id
    FROM director_assignments da
    JOIN age_categories ac ON ac.id = da.age_category_id
    WHERE da.user_id = ${evalId} AND da.status = 'active'
  `;
  const evalOrgIds = new Set([
    ...memberships.map(m => m.organization_id),
    ...directorOrgs.map(d => d.organization_id),
  ]);
  if (evalOrgIds.size === 0) return false;

  const callerOrgIds = await getAccessibleOrgIds(session);
  if (callerOrgIds === null) return true; // super_admin fallback
  return callerOrgIds.some(id => evalOrgIds.has(id));
}
