import sql from "@/lib/db";

// Per-category evaluator "kind": 'standard' | 'coach' | 'goalie'.
// All reads are best-effort — if the category_evaluators table isn't migrated yet
// they return safe defaults so nothing breaks pre-migration.

export async function getCoachUserIds(catId) {
  const ids = new Set();
  // Explicit per-category coach designations.
  try {
    const rows = await sql`
      SELECT user_id FROM category_evaluators
      WHERE age_category_id = ${catId} AND kind = 'coach' AND user_id IS NOT NULL
    `;
    for (const r of rows) ids.add(r.user_id);
  } catch { /* table not migrated yet */ }
  // Implicit: for an SP-SERVED association, the association's OWN evaluators (members
  // of the association org — not the SP's pool) count as COACHES. Their scores blend
  // into the comparison view but never touch the official (SP) ranking.
  try {
    const rows = await sql`
      SELECT DISTINCT em.user_id
      FROM age_categories ac
      JOIN sp_association_links sal ON sal.association_id = ac.organization_id AND sal.status = 'active'
      JOIN evaluator_memberships em ON em.organization_id = ac.organization_id AND em.status = 'active'
      WHERE ac.id = ${catId} AND em.user_id IS NOT NULL
        -- An explicit per-category designation wins: someone marked as the goalie
        -- (or standard) evaluator is OFFICIAL, not swept up as an implicit coach.
        -- This is exactly the goalie-SP case — Jamie is the designated goalie
        -- evaluator, so his scores must count toward the official ranking.
        AND em.user_id NOT IN (
          SELECT user_id FROM category_evaluators
          WHERE age_category_id = ${catId} AND kind <> 'coach' AND user_id IS NOT NULL
        )
    `;
    for (const r of rows) ids.add(r.user_id);
  } catch { /* no link / pre-migration */ }
  return [...ids];
}

// Resolve a user's kind for a category. Binds a pending email-only invite to this
// user the first time they appear, so a designation made before they signed up
// takes effect on their first access.
export async function resolveEvaluatorKind(catId, userId, email) {
  if (!catId || !userId) return "standard";
  try {
    if (email) {
      await sql`
        UPDATE category_evaluators SET user_id = ${userId}
        WHERE age_category_id = ${catId} AND user_id IS NULL AND lower(email) = lower(${email})
      `;
    }
    const rows = await sql`
      SELECT kind FROM category_evaluators
      WHERE age_category_id = ${catId} AND user_id = ${userId} LIMIT 1
    `;
    if (rows[0]?.kind) return rows[0].kind;
    // Fallback: a member of a goalie service provider that's linked to this
    // category's association is implicitly a GOALIE evaluator — so a goalie SP can
    // bring its own evaluators without the association hand-designating each one.
    // This only ever scopes them TO goalies (more restrictive), never to skaters.
    const g = await sql`
      SELECT 1 FROM evaluator_memberships em
      JOIN organizations o ON o.id = em.organization_id AND o.type = 'goalie_service_provider'
      JOIN sp_association_links sal ON sal.service_provider_id = o.id AND sal.status = 'active'
      JOIN age_categories ac ON ac.organization_id = sal.association_id
      WHERE em.user_id = ${userId} AND em.status = 'active' AND ac.id = ${catId}
      LIMIT 1
    `;
    if (g.length) return "goalie";
    // The goalie SP's ADMIN (owns the goalie SP via contact_email or a role row)
    // is also a goalie evaluator for the associations it serves — so a solo goalie
    // SP like ATC can score its own trials without a separate evaluator membership.
    const a = await sql`
      SELECT 1 FROM organizations o
      JOIN sp_association_links sal ON sal.service_provider_id = o.id AND sal.status = 'active'
      JOIN age_categories ac ON ac.organization_id = sal.association_id AND ac.id = ${catId}
      WHERE o.type = 'goalie_service_provider'
        AND (o.contact_email = ${email} OR EXISTS (SELECT 1 FROM user_organization_roles uor WHERE uor.organization_id = o.id AND uor.user_id = ${userId}))
      LIMIT 1
    `;
    if (a.length) return "goalie";
    return "standard";
  } catch { return "standard"; }
}
