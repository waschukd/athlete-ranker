import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const auth = await authorizeOrgAccess(session, params.orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const orgs = await sql`SELECT * FROM organizations WHERE id = ${params.orgId}`;
    if (!orgs.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const spLink = await sql`
      SELECT o.id as sp_id, o.name as sp_name
      FROM sp_association_links sal
      JOIN organizations o ON o.id = sal.service_provider_id
      WHERE sal.association_id = ${params.orgId} AND sal.status = 'active'
      LIMIT 1
    `;
    return NextResponse.json({ organization: orgs[0], service_provider: spLink[0] || null });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const auth = await authorizeOrgAccess(session, params.orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const { name, contact_email, contact_name, contact_phone, address } = body;
    const result = await sql`
      UPDATE organizations SET
        name = COALESCE(${name}, name),
        contact_email = COALESCE(${contact_email}, contact_email),
        contact_name = COALESCE(${contact_name}, contact_name),
        contact_phone = COALESCE(${contact_phone}, contact_phone),
        address = COALESCE(${address}, address),
        updated_at = NOW()
      WHERE id = ${params.orgId} RETURNING *
    `;
    return NextResponse.json({ organization: result[0] });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
