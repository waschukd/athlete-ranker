import sql from "@/lib/db";
import { getAppUserId } from "@/lib/auth";

// Central audit-trail writer. Every data/setup change an evaluator, director,
// association, or service provider makes should go through here so the entry is
// reliably attributed to the person (user_id), the org, and the category — the
// three dimensions the SP/Association audit views scope and filter on.
//
// Integrity feature, so this is AWAITED (unlike fire-and-forget analytics) — but
// it never throws into the caller: a logging hiccup must not fail the real action.
//
// Pass EITHER a `session` (we resolve the app user id) or an explicit `userId`.
// If `orgId` is omitted but `catId` is given, the org is derived from the category.
export async function logAudit({
  session = null, userId = null, orgId = null, catId = null,
  action, entityType = null, entityId = null,
  field = null, oldValue = null, newValue = null, notes = null,
}) {
  try {
    if (!action) return;
    let uid = userId;
    if (uid == null && session) uid = await getAppUserId(session);

    let org = orgId;
    if (org == null && catId != null) {
      const [c] = await sql`SELECT organization_id FROM age_categories WHERE id = ${catId}`;
      org = c?.organization_id ?? null;
    }
    const notesStr = notes == null ? null : (typeof notes === "string" ? notes : JSON.stringify(notes));

    await sql`
      INSERT INTO audit_log (age_category_id, organization_id, user_id, action, entity_type, entity_id, field_changed, old_value, new_value, notes)
      VALUES (${catId}, ${org}, ${uid}, ${action}, ${entityType}, ${entityId}, ${field},
        ${oldValue == null ? null : String(oldValue)}, ${newValue == null ? null : String(newValue)}, ${notesStr})
    `;
  } catch (e) {
    if (process.env.NODE_ENV !== "test") console.warn("[audit] write failed", action, e?.message);
  }
}
