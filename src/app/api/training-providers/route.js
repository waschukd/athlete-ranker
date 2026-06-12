import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgId = new URL(request.url).searchParams.get("org");
    if (!orgId) return NextResponse.json({ error: "org required" }, { status: 400 });
    const auth = await authorizeOrgAccess(session, orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    let providers = [];
    try {
      providers = await sql`
        SELECT id, area, name, blurb, contact, sort_order
        FROM training_providers WHERE organization_id = ${orgId}
        ORDER BY area, sort_order, id
      `;
    } catch { providers = []; } // table not migrated yet
    return NextResponse.json({ providers });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const orgId = body.organization_id;
    if (!orgId) return NextResponse.json({ error: "organization_id required" }, { status: 400 });
    const auth = await authorizeOrgAccess(session, orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const area = (body.area || "").trim();
    const name = (body.name || "").trim();
    if (!area || !name) return NextResponse.json({ error: "area and name required" }, { status: 400 });
    const row = await sql`
      INSERT INTO training_providers (organization_id, area, name, blurb, contact, sort_order)
      VALUES (${orgId}, ${area}, ${name}, ${body.blurb || null}, ${body.contact || null}, ${body.sort_order || 0})
      RETURNING id, area, name, blurb, contact, sort_order
    `;
    return NextResponse.json({ provider: row[0] });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const found = await sql`SELECT organization_id FROM training_providers WHERE id = ${id}`;
    if (!found.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const auth = await authorizeOrgAccess(session, found[0].organization_id);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await sql`DELETE FROM training_providers WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
