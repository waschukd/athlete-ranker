import sql from "@/lib/db";

// Whether a category identifies players to evaluators by a persistent HELMET
// STICKER number (up to 4 digits) instead of the per-session jersey number.
// Resolves the per-category override, else the association default, else false.
// Best-effort — returns false pre-migration so nothing breaks.
export async function resolveHelmetMode(catId) {
  if (!catId) return false;
  try {
    const r = await sql`
      SELECT COALESCE(ac.identify_by_helmet, o.identify_by_helmet, false) AS helmet
      FROM age_categories ac
      JOIN organizations o ON o.id = ac.organization_id
      WHERE ac.id = ${catId} LIMIT 1`;
    return !!r[0]?.helmet;
  } catch { return false; }
}
