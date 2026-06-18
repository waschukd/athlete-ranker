import sql from "@/lib/db";

// Per-category evaluator "kind": 'standard' | 'coach' | 'goalie'.
// All reads are best-effort — if the category_evaluators table isn't migrated yet
// they return safe defaults so nothing breaks pre-migration.

export async function getCoachUserIds(catId) {
  try {
    const rows = await sql`
      SELECT user_id FROM category_evaluators
      WHERE age_category_id = ${catId} AND kind = 'coach' AND user_id IS NOT NULL
    `;
    return rows.map(r => r.user_id);
  } catch { return []; }
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
    return "standard";
  } catch { return "standard"; }
}
