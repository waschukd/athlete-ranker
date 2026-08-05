import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";

// The signed-in user's association org id — for self-healing the association
// dashboard when it's loaded without an ?org param (bookmark, direct nav, a login
// path that didn't attach it). Resolves by contact_email (the original owner) OR an
// association-admin role linked via user_organization_roles (an invited co-admin).
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.email) return NextResponse.json({ orgId: null });
    const [owner] = await sql`SELECT id FROM organizations WHERE contact_email = ${session.email} AND type = 'association' LIMIT 1`;
    if (owner) return NextResponse.json({ orgId: owner.id });
    const uid = await getAppUserId(session);
    if (!uid) return NextResponse.json({ orgId: null });
    const [linked] = await sql`
      SELECT uor.organization_id AS id FROM user_organization_roles uor
      JOIN organizations o ON o.id = uor.organization_id
      WHERE uor.user_id = ${uid} AND o.type = 'association'
      ORDER BY uor.organization_id LIMIT 1`;
    return NextResponse.json({ orgId: linked?.id || null });
  } catch (e) {
    console.error("my-association error:", e);
    return NextResponse.json({ orgId: null });
  }
}
