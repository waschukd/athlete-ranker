import { requireSuperAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  try {
    const adminUser = await requireSuperAdmin(); if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const joinRequests = await sql`
      SELECT ejr.*, u.name as user_name, u.email as user_email, o.name as organization_name
      FROM evaluator_join_requests ejr
      LEFT JOIN users u ON u.id = ejr.user_id
      LEFT JOIN organizations o ON o.id = ejr.organization_id
      ORDER BY ejr.created_at DESC
    `;

    const invitations = await sql`
      SELECT ei.*, o.name as organization_name, u.name as invited_by_name
      FROM evaluator_invitations ei
      LEFT JOIN organizations o ON o.id = ei.organization_id
      LEFT JOIN users u ON u.id = ei.invited_by_user_id
      ORDER BY ei.created_at DESC
    `;

    const stats = await sql`
      SELECT
        (SELECT COUNT(*) FROM evaluator_join_requests WHERE status = 'pending') as pending_requests,
        (SELECT COUNT(*) FROM evaluator_join_requests WHERE status = 'approved') as approved_requests,
        (SELECT COUNT(*) FROM evaluator_join_requests WHERE status = 'denied') as denied_requests,
        (SELECT COUNT(*) FROM evaluator_invitations WHERE status = 'pending') as pending_invites,
        (SELECT COUNT(*) FROM evaluator_invitations WHERE status = 'accepted') as accepted_invites,
        (SELECT COUNT(*) FROM evaluator_invitations WHERE status = 'expired') as expired_invites
    `;

    return NextResponse.json({ joinRequests, invitations, stats: stats[0] });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const adminUser = await requireSuperAdmin(); if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { request_id, action } = await request.json();
    const status = action === "approve" ? "approved" : "denied";
    await sql`UPDATE evaluator_join_requests SET status = ${status}, reviewed_at = NOW() WHERE id = ${request_id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
