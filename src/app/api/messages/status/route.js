import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getAccessibleOrgIds } from "@/lib/authorize";
import { appUserId } from "@/lib/notify";
import { getEmailStatuses, ensureEmailLogTable, logEmailSend } from "@/lib/emailLog";
import { sendEmail, emailWrapper, esc } from "@/lib/email";

const ADMIN_ROLES = new Set(["super_admin", "service_provider_admin", "association_admin", "director"]);

// Delivery status for the org-wide "message my staff" broadcast -- same org
// resolution POST /api/messages uses (the caller's first accessible org).
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ADMIN_ROLES.has(session.role)) return NextResponse.json({ statuses: [], counts: {} });
    const userId = await appUserId(session);
    if (!userId) return NextResponse.json({ statuses: [], counts: {} });

    const accessible = await getAccessibleOrgIds(session);
    const orgId = accessible === null ? null : (accessible[0] || null);
    if (!orgId && accessible !== null) return NextResponse.json({ statuses: [], counts: {} });

    if (accessible === null) {
      // super_admin with no single org context -- nothing meaningful to scope to.
      return NextResponse.json({ statuses: [], counts: {} });
    }

    const { statuses, counts } = await getEmailStatuses({ orgId, emailType: "staff_message" });
    return NextResponse.json({ statuses, counts });
  } catch (e) {
    console.error("messages status GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Resend the most recent message this admin sent to one specific recipient --
// same subject/body, a fresh email + log row (never re-sends to anyone else).
export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ADMIN_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const userId = await appUserId(session);
    if (!userId) return NextResponse.json({ error: "No user" }, { status: 400 });

    const { recipient_user_id } = await request.json().catch(() => ({}));
    if (!recipient_user_id) return NextResponse.json({ error: "recipient_user_id required" }, { status: 400 });

    const [latest] = await sql`
      SELECT m.subject, m.body, m.organization_id, u.email, u.name
      FROM messages m JOIN users u ON u.id = m.to_user_id
      WHERE m.from_user_id = ${userId} AND m.to_user_id = ${recipient_user_id}
      ORDER BY m.created_at DESC LIMIT 1
    `;
    if (!latest) return NextResponse.json({ error: "No prior message to this recipient" }, { status: 404 });

    const fromName = session.name || session.email;
    const orgRow = latest.organization_id ? await sql`SELECT name FROM organizations WHERE id = ${latest.organization_id}` : [];
    const orgName = orgRow[0]?.name || "";
    const html = emailWrapper(`
      <h2 style="margin:0 0 6px;font-family:'Archivo','Hanken Grotesk',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#101113;">${esc(latest.subject || "Message")}</h2>
      <p style="margin:0 0 6px;font-size:12px;color:#9aa0aa;">From ${esc(fromName)}${orgName ? ` · ${esc(orgName)}` : ""}</p>
      <div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:10px;padding:16px 20px;margin:14px 0;font-size:14px;color:#101113;line-height:1.6;white-space:pre-wrap;">${esc(latest.body || "")}</div>
      <p style="font-size:12px;color:#9aa0aa;margin:0;">Reply from your Sideline Star dashboard.</p>
    `);
    const res = await sendEmail(latest.email, `Message from ${fromName} — Sideline Star`, html);
    await ensureEmailLogTable();
    await logEmailSend({
      orgId: latest.organization_id, emailType: "staff_message", recipientUserId: recipient_user_id, athleteName: latest.name, to: latest.email,
      resendId: res.id || null, status: res.ok ? "sent" : "failed",
      error: res.ok ? null : (res.error || "send failed").toString().slice(0, 500),
    });
    return NextResponse.json({ success: true, ok: res.ok });
  } catch (e) {
    console.error("messages status POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
