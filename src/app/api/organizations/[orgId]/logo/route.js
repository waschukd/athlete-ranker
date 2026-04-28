// Upload (or remove) an organization's logo.
//
// v1 stores the image as a base64 data URL directly in
// organizations.logo_url. This avoids needing a separate object store
// (Vercel Blob, S3, etc.) for the demo; it's fine up to ~2 MB per logo
// and a few dozen orgs. Switch to Vercel Blob later if/when scale demands.

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const WRITE_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin"]);

async function authorize(session, orgId) {
  if (!session) return { ok: false, status: 401, error: "Unauthorized" };
  if (!WRITE_ROLES.has(session.role)) return { ok: false, status: 403, error: "Forbidden" };
  const auth = await authorizeOrgAccess(session, orgId);
  if (!auth.authorized) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true };
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    const auth = await authorize(session, params.orgId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const formData = await request.formData();
    const file = formData.get("logo");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Must be PNG, JPG, WebP, GIF, or SVG" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large (max 2 MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

    const result = await sql`
      UPDATE organizations
      SET logo_url = ${dataUrl}
      WHERE id = ${params.orgId}
      RETURNING id, name, logo_url
    `;
    if (!result.length) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    return NextResponse.json({ success: true, organization: result[0] });
  } catch (error) {
    console.error("Logo upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getSession();
    const auth = await authorize(session, params.orgId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    await sql`UPDATE organizations SET logo_url = NULL WHERE id = ${params.orgId}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logo delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
