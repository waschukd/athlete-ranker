import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import { getEmailTemplate, setEmailTemplate, clearEmailTemplate } from "@/lib/emailTemplates";
import { TEMPLATE_KEYS } from "@/lib/emailTemplateDefaults";

// template_key is free text in the DB, so an unknown key would silently write a
// row nothing ever reads. Only accept keys that have a built-in counterpart.
const validKey = k => TEMPLATE_KEYS.includes(k);

// authorizeOrgAccess alone also admits plain evaluators -- rewriting the
// automated emails sent to every parent needs the stronger admin check.
const TEMPLATE_EDIT_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin", "goalie_service_provider_admin"]);

// Directors write this copy in practice -- an association's elite/age-group
// directors are the ones who own the release wording, not necessarily whoever
// holds the association_admin login. They are admitted for an org they actually
// direct, proven by an active director_assignment.
//
// authorizeOrgAccess cannot answer that on its own: it only recognises a
// director through an evaluator_memberships row, which is about EVALUATING and
// which plenty of real directors simply do not have. Checked here rather than
// by widening authorizeOrgAccess, which 23 other endpoints rely on.
//
// Note this is still org-wide by nature -- a template applies to every division
// in the association, so a director editing one changes the wording for
// divisions they do not run. That is accepted deliberately: associations want
// one consistent letter, which is the whole point of a shared template.
async function directsOrg(session, orgId) {
  if (session.role !== "director") return false;
  const [u] = await sql`SELECT id FROM users WHERE email = ${session.email}`;
  if (!u) return false;
  const rows = await sql`
    SELECT 1 FROM director_assignments
    WHERE user_id = ${u.id} AND organization_id = ${orgId} AND status = 'active' LIMIT 1`;
  return rows.length > 0;
}

// May this session edit (or reset) this org's template copy?
async function canEditTemplates(session, orgId) {
  if (TEMPLATE_EDIT_ROLES.has(session.role)) {
    const auth = await authorizeOrgAccess(session, orgId);
    return !!auth.authorized;
  }
  return directsOrg(session, orgId);
}

export async function GET(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const orgId = url.searchParams.get("org");
  const key = url.searchParams.get("key") || "welcome";
  if (!orgId) return NextResponse.json({ error: "org required" }, { status: 400 });
  if (!validKey(key)) return NextResponse.json({ error: `Unknown template "${key}"` }, { status: 400 });
  const auth = await authorizeOrgAccess(session, orgId);
  if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const tpl = await getEmailTemplate(orgId, key);
  return NextResponse.json({ template: tpl });
}

export async function PUT(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const orgId = body.organization_id;
  const key = body.key || "welcome";
  if (!orgId) return NextResponse.json({ error: "organization_id required" }, { status: 400 });
  if (!validKey(key)) return NextResponse.json({ error: `Unknown template "${key}"` }, { status: 400 });
  if (!(await canEditTemplates(session, orgId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await setEmailTemplate(orgId, key, (body.subject || "").trim(), (body.body_html || "").trim());
  return NextResponse.json({ ok: true });
}

// Drops the org's override so resolveTemplate falls back to the built-in
// wording -- "Restore default wording" in the editor.
export async function DELETE(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const orgId = url.searchParams.get("org");
  const key = url.searchParams.get("key") || "welcome";
  if (!orgId) return NextResponse.json({ error: "org required" }, { status: 400 });
  if (!validKey(key)) return NextResponse.json({ error: `Unknown template "${key}"` }, { status: 400 });
  if (!(await canEditTemplates(session, orgId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await clearEmailTemplate(orgId, key);
  return NextResponse.json({ ok: true });
}
