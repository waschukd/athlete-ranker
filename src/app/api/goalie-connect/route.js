import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";

// GET ?token=... — public (token-gated, no session needed yet) read of a pending
// goalie-SP connection request, so the respond page can show who's asking before
// the visitor signs in.
export async function GET(request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
    const [req_] = await sql`
      SELECT r.status, r.invited_email, sp.name AS sp_name, a.name AS association_name
      FROM sp_connection_requests r
      JOIN organizations sp ON sp.id = r.service_provider_id
      JOIN organizations a ON a.id = r.association_id
      WHERE r.token = ${token}
    `;
    if (!req_) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 404 });
    return NextResponse.json({ request: req_ });
  } catch (e) {
    console.error("goalie-connect GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST { token, action: "approve" | "decline" } — requires the signed-in user to
// actually administer the invited association (email match alone isn't enough --
// authorizeOrgAccess confirms real org access, not just a matching address).
export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { token, action } = await request.json();
    if (!token || !["approve", "decline"].includes(action)) return NextResponse.json({ error: "token and a valid action are required" }, { status: 400 });

    const [req_] = await sql`
      SELECT r.*, sp.name AS sp_name, a.name AS association_name
      FROM sp_connection_requests r
      JOIN organizations sp ON sp.id = r.service_provider_id
      JOIN organizations a ON a.id = r.association_id
      WHERE r.token = ${token}
    `;
    if (!req_) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 404 });
    if (req_.status !== "pending") return NextResponse.json({ error: `This request was already ${req_.status}.` }, { status: 400 });

    if ((session.email || "").toLowerCase() !== req_.invited_email.toLowerCase()) {
      return NextResponse.json({ error: `This request was sent to ${req_.invited_email}. Sign in with that account to respond.` }, { status: 403 });
    }
    const auth = await authorizeOrgAccess(session, req_.association_id);
    if (!auth.authorized) return NextResponse.json({ error: "Your account doesn't administer this association." }, { status: 403 });

    if (action === "decline") {
      await sql`UPDATE sp_connection_requests SET status = 'declined', decided_at = NOW() WHERE id = ${req_.id}`;
      return NextResponse.json({ ok: true, outcome: "declined" });
    }

    const [existing] = await sql`SELECT id FROM sp_association_links WHERE service_provider_id = ${req_.service_provider_id} AND association_id = ${req_.association_id}`;
    if (existing) {
      await sql`UPDATE sp_association_links SET status = 'active', linked_at = NOW() WHERE id = ${existing.id}`;
    } else {
      await sql`INSERT INTO sp_association_links (service_provider_id, association_id, status) VALUES (${req_.service_provider_id}, ${req_.association_id}, 'active')`;
    }
    await sql`UPDATE organizations SET goalie_eval_mode = 'goalie_service_provider' WHERE id = ${req_.association_id}`;
    await sql`UPDATE sp_connection_requests SET status = 'approved', decided_at = NOW() WHERE id = ${req_.id}`;
    return NextResponse.json({ ok: true, outcome: "approved", sp_name: req_.sp_name });
  } catch (e) {
    console.error("goalie-connect POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
