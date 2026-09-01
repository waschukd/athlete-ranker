import sql from "@/lib/db";

// The category's actively-assigned directors. This exact query used to be
// hand-copied in 4 places (scheduleNotify.js x2, cut/route.js, cron/route.js)
// -- a schema change (e.g. a new status value, a renamed column) would have
// needed to land in all 4 to actually take effect everywhere. One source now.
export async function getCategoryDirectors(catId) {
  return sql`
    SELECT DISTINCT u.email, u.name FROM director_assignments da
    JOIN users u ON u.id = da.user_id
    WHERE da.age_category_id = ${catId} AND da.status = 'active'
  `;
}

// Users with a role on this organization. `onlyRole` narrows to a specific
// role (e.g. "association_admin"); omitted, it returns everyone with any role
// on the org -- callers intentionally differ on this (notifySessionChange
// wants the broader set, notifyTestingResultsUploaded/cut want just admins),
// so this stays a parameter rather than a fixed filter.
export async function getOrgRoleUsers(orgId, { onlyRole } = {}) {
  return onlyRole
    ? sql`
        SELECT u.email, u.name FROM user_organization_roles uor
        JOIN users u ON u.id = uor.user_id
        WHERE uor.organization_id = ${orgId} AND uor.role = ${onlyRole}
      `
    : sql`
        SELECT u.email, u.name FROM user_organization_roles uor
        JOIN users u ON u.id = uor.user_id
        WHERE uor.organization_id = ${orgId}
      `;
}
