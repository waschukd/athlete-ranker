import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import { getEmailTemplate, setEmailTemplate, clearEmailTemplate } from "@/lib/emailTemplates";
import { TEMPLATE_KEYS } from "@/lib/emailTemplateDefaults";

// template_key is free text in the DB, so an unknown key would silently write a
// row nothing ever reads. Only accept keys that have a built-in counterpart.
const validKey = k => TEMPLATE_KEYS.includes(k);

// authorizeOrgAccess alone also admits plain evaluators/directors -- rewriting
// the automated emails sent to every parent needs the stronger admin check.
const TEMPLATE_EDIT_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin", "goalie_service_provider_admin"]);

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
  if (!TEMPLATE_EDIT_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const orgId = body.organization_id;
  const key = body.key || "welcome";
  if (!orgId) return NextResponse.json({ error: "organization_id required" }, { status: 400 });
  if (!validKey(key)) return NextResponse.json({ error: `Unknown template "${key}"` }, { status: 400 });
  const auth = await authorizeOrgAccess(session, orgId);
  if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await setEmailTemplate(orgId, key, (body.subject || "").trim(), (body.body_html || "").trim());
  return NextResponse.json({ ok: true });
}

// Drops the org's override so resolveTemplate falls back to the built-in
// wording -- "Restore default wording" in the editor.
export async function DELETE(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!TEMPLATE_EDIT_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const orgId = url.searchParams.get("org");
  const key = url.searchParams.get("key") || "welcome";
  if (!orgId) return NextResponse.json({ error: "org required" }, { status: 400 });
  if (!validKey(key)) return NextResponse.json({ error: `Unknown template "${key}"` }, { status: 400 });
  const auth = await authorizeOrgAccess(session, orgId);
  if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await clearEmailTemplate(orgId, key);
  return NextResponse.json({ ok: true });
}
