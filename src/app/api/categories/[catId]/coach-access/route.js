import { getSession, getAppUserId } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { NextResponse } from "next/server";
import sql from "@/lib/db";

// Whether an association's own admin/director can manage coach & goalie
// evaluators on this specific category (age_categories.coach_evaluators_
// enabled) is exclusively the serving SP's call, per category -- never the
// association's own to opt into, never inherited from other categories in
// the same association, and never set automatically. Only real SP-tier
// accounts may flip it; association-side roles never reach this route even
// though they're allowed to view the category's other settings.
const SP_TIER_ROLES = new Set(["service_provider_admin", "goalie_service_provider_admin", "super_admin"]);

export async function PATCH(request, { params }) {
  try {
    const { catId } = params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!SP_TIER_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const enabled = !!body.enabled;

    const [before] = await sql`SELECT coach_evaluators_enabled, name FROM age_categories WHERE id = ${catId}`;
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await sql`UPDATE age_categories SET coach_evaluators_enabled = ${enabled} WHERE id = ${catId}`;

    const editorId = await getAppUserId(session);
    await sql`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_changed, old_value, new_value, notes, age_category_id)
      VALUES (${editorId}, 'coach_access_change', 'age_category', ${catId}, 'coach_evaluators_enabled',
        ${String(!!before.coach_evaluators_enabled)}, ${String(enabled)},
        ${JSON.stringify({ category_name: before.name, editor_role: session.role })}, ${catId})
    `.catch(() => {});

    return NextResponse.json({ success: true, coach_evaluators_enabled: enabled });
  } catch (e) {
    console.error("coach-access PATCH error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
