import sql from "@/lib/db";

// One goalie evaluation template per org (organizations.goalie_template JSONB).
// Owned by whoever evaluates goalies for an association (in-house = the
// association; SP-served = that provider). This module resolves ownership and
// MATERIALIZES the template into each category's goalie_config + goalie
// scoring_categories, so the ranking/scoring engine is untouched.

export const DEFAULT_GOALIE_TEMPLATE = {
  scale: 10,
  increment: 1,
  players_eval_goalies: false,
  // A Goalie Skills session then 3 scrimmages.
  sessions: [
    { session_number: 1, name: "Goalie Session 1", session_type: "goalie_skills", weight_percentage: 40 },
    { session_number: 2, name: "Goalie Session 2", session_type: "scrimmage", weight_percentage: 20 },
    { session_number: 3, name: "Goalie Session 3", session_type: "scrimmage", weight_percentage: 20 },
    { session_number: 4, name: "Goalie Session 4", session_type: "scrimmage", weight_percentage: 20 },
  ],
  // Scrimmage categories (applies_to='goalies').
  categories: [
    { name: "Skating / Balance / Agility" },
    { name: "Positioning / Angles / Net Coverage" },
    { name: "Feet / Hands / Stick / Rebounds" },
    { name: "Anticipation / Reading the Play" },
  ],
  // Goalie skills / drill categories (applies_to='goalie_skills').
  skills_categories: [
    { name: "Mobility" },
    { name: "Rebound Control" },
    { name: "Positioning & Awareness" },
    { name: "Battle & Compete" },
  ],
};

function normalize(t) {
  if (!t || typeof t !== "object") return { ...DEFAULT_GOALIE_TEMPLATE };
  return {
    scale: t.scale ?? DEFAULT_GOALIE_TEMPLATE.scale,
    increment: t.increment ?? DEFAULT_GOALIE_TEMPLATE.increment,
    players_eval_goalies: !!t.players_eval_goalies,
    sessions: Array.isArray(t.sessions) && t.sessions.length ? t.sessions : DEFAULT_GOALIE_TEMPLATE.sessions,
    categories: Array.isArray(t.categories) && t.categories.length ? t.categories : DEFAULT_GOALIE_TEMPLATE.categories,
    skills_categories: Array.isArray(t.skills_categories) && t.skills_categories.length ? t.skills_categories : DEFAULT_GOALIE_TEMPLATE.skills_categories,
  };
}

// Which org owns the goalie template for this association?
export async function resolveGoalieTemplateOrg(assocOrgId) {
  const rows = await sql`SELECT goalie_eval_mode FROM organizations WHERE id = ${assocOrgId}`;
  const mode = rows[0]?.goalie_eval_mode || "association";
  if (mode === "association") return { ownerId: assocOrgId, mode };
  const spType = mode === "goalie_service_provider" ? "goalie_service_provider" : "service_provider";
  const link = await sql`
    SELECT sp.id FROM sp_association_links sal
    JOIN organizations sp ON sp.id = sal.service_provider_id AND sp.type = ${spType}
    WHERE sal.association_id = ${assocOrgId} AND sal.status = 'active' LIMIT 1`;
  return { ownerId: link[0]?.id || assocOrgId, mode };
}

// The template stored ON an org (falls back to defaults). Resilient pre-migration.
export async function getGoalieTemplate(orgId) {
  try {
    const rows = await sql`SELECT goalie_template FROM organizations WHERE id = ${orgId}`;
    return normalize(rows[0]?.goalie_template);
  } catch { return { ...DEFAULT_GOALIE_TEMPLATE }; }
}

// The template an association actually evaluates on (its owner's).
export async function getEffectiveGoalieTemplate(assocOrgId) {
  const { ownerId, mode } = await resolveGoalieTemplateOrg(assocOrgId);
  const template = await getGoalieTemplate(ownerId);
  return { template, ownerId, mode, editableByAssociation: mode === "association" };
}

export async function saveGoalieTemplate(orgId, template) {
  const merged = normalize(template);
  await sql`UPDATE organizations SET goalie_template = ${JSON.stringify(merged)}::jsonb WHERE id = ${orgId}`;
  return merged;
}

// Materialize a template into one category (goalie_config + goalie scoring_categories).
export async function applyTemplateToCategory(catId, template) {
  const t = normalize(template);
  const goalie_config = { scale: t.scale, increment: t.increment, sessions: t.sessions };
  await sql`
    UPDATE age_categories SET
      evaluates_goalies = true,
      players_eval_goalies = ${!!t.players_eval_goalies},
      goalie_config = ${JSON.stringify(goalie_config)}::jsonb
    WHERE id = ${catId}`;
  await sql`DELETE FROM scoring_categories WHERE age_category_id = ${catId} AND applies_to IN ('goalies','goalie_skills')`;
  for (let i = 0; i < t.categories.length; i++) {
    if (!t.categories[i]?.name) continue;
    await sql`INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to) VALUES (${catId}, ${t.categories[i].name}, ${100 + i}, 'goalies')`;
  }
  for (let i = 0; i < t.skills_categories.length; i++) {
    if (!t.skills_categories[i]?.name) continue;
    await sql`INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to) VALUES (${catId}, ${t.skills_categories[i].name}, ${120 + i}, 'goalie_skills')`;
  }
}

// Apply the owning org's template to every category in an association.
export async function applyGoalieTemplate(assocOrgId) {
  const { template } = await getEffectiveGoalieTemplate(assocOrgId);
  const cats = await sql`SELECT id FROM age_categories WHERE organization_id = ${assocOrgId}`;
  for (const c of cats) await applyTemplateToCategory(c.id, template);
  return cats.length;
}

// Every association whose goalie template resolves to this SP (by mode + type).
export async function associationsOwnedBySp(spId) {
  const spRows = await sql`SELECT type FROM organizations WHERE id = ${spId}`;
  const type = spRows[0]?.type;
  if (type !== "service_provider" && type !== "goalie_service_provider") return [];
  const mode = type === "goalie_service_provider" ? "goalie_service_provider" : "service_provider";
  const rows = await sql`
    SELECT a.id FROM sp_association_links sal
    JOIN organizations a ON a.id = sal.association_id
    WHERE sal.service_provider_id = ${spId} AND sal.status = 'active'
      AND COALESCE(a.goalie_eval_mode, 'association') = ${mode}`;
  return rows.map(r => r.id);
}

// Push an SP's template out to all the associations it owns goalies for.
export async function propagateSpGoalieTemplate(spId) {
  const ids = await associationsOwnedBySp(spId);
  for (const id of ids) await applyGoalieTemplate(id);
  return ids.length;
}
