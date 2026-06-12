import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import { getEmailTemplate, setEmailTemplate } from "@/lib/emailTemplates";

export async function GET(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const orgId = url.searchParams.get("org");
  const key = url.searchParams.get("key") || "welcome";
  if (!orgId) return NextResponse.json({ error: "org required" }, { status: 400 });
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
  const auth = await authorizeOrgAccess(session, orgId);
  if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await setEmailTemplate(orgId, key, (body.subject || "").trim(), (body.body_html || "").trim());
  return NextResponse.json({ ok: true });
}
