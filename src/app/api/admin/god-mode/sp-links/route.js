import { requireSuperAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { emailSPLinkedToAssociation } from "@/lib/email";

export async function GET() {
  try {
    const adminUser = await requireSuperAdmin(); if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const links = await sql`
      SELECT 
        sal.id,
        sal.service_provider_id as sp_id,
        sal.association_id as assoc_id,
        sal.status,
        sal.linked_at,
        sp.name as sp_name, 
        a.name as assoc_name,
        a.name as association_name
      FROM sp_association_links sal
      JOIN organizations sp ON sp.id = sal.service_provider_id
      JOIN organizations a ON a.id = sal.association_id
      ORDER BY sp.name, a.name
    `;
    const serviceProviders = await sql`
      SELECT id, name FROM organizations WHERE type = 'service_provider' ORDER BY name
    `;
    const associations = await sql`
      SELECT id, name FROM organizations WHERE type = 'association' ORDER BY name
    `;
    return NextResponse.json({ links, serviceProviders, associations });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const adminUser = await requireSuperAdmin(); if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { service_provider_id, association_id, action } = await request.json();

    if (action === "unlink") {
      await sql`DELETE FROM sp_association_links WHERE service_provider_id = ${service_provider_id} AND association_id = ${association_id}`;
      return NextResponse.json({ success: true });
    }

    // Check if link already exists
    const existing = await sql`
      SELECT id FROM sp_association_links 
      WHERE service_provider_id = ${service_provider_id} AND association_id = ${association_id}
    `;
    if (existing.length) return NextResponse.json({ success: true, message: "Already linked" });

    await sql`
      INSERT INTO sp_association_links (service_provider_id, association_id, status)
      VALUES (${service_provider_id}, ${association_id}, 'active')
    `;

    // Notify SP admin
    try {
      const spAdmin = await sql`
        SELECT u.email, u.name, o.name as org_name 
        FROM users u 
        JOIN organizations o ON o.contact_email = u.email
        WHERE o.id = ${service_provider_id} LIMIT 1
      `;
      const assoc = await sql`SELECT name FROM organizations WHERE id = ${association_id}`;
      if (spAdmin.length) {
        await emailSPLinkedToAssociation({
          spAdminEmail: spAdmin[0].email,
          spAdminName: spAdmin[0].name,
          spName: spAdmin[0].org_name,
          assocName: assoc[0]?.name,
        });
      }
    } catch(e) { console.error("SP link email failed:", e); }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
