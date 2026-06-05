import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getAccessibleOrgIds } from "@/lib/authorize";
import { appUserId, createNotification } from "@/lib/notify";
import { sendEmail, emailWrapper } from "@/lib/email";

const ADMIN_ROLES = new Set(["super_admin", "service_provider_admin", "association_admin", "director"]);
const EVAL_ROLES = new Set(["association_evaluator", "service_provider_evaluator"]);

// GET: the current user's inbox + sent items.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = await appUserId(session);
    if (!userId) return NextResponse.json({ inbox: [], sent: [], unread: 0 });

    try {
      const inbox = await sql`
        SELECT m.*, fu.name AS from_user_name FROM messages m
        LEFT JOIN users fu ON fu.id = m.from_user_id
        WHERE m.to_user_id = ${userId}
        ORDER BY m.created_at DESC LIMIT 100
      `;
      const sent = await sql`
        SELECT m.*, tu.name AS to_user_name FROM messages m
        LEFT JOIN users tu ON tu.id = m.to_user_id
        WHERE m.from_user_id = ${userId}
        ORDER BY m.created_at DESC LIMIT 100
      `;
      const unread = inbox.filter(m => !m.read_at).length;
      return NextResponse.json({ inbox, sent, unread });
    } catch {
      return NextResponse.json({ inbox: [], sent: [], unread: 0 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: send a message.
//  Admins/SP:  { subject, body, to_user_ids?: [], to_all_pool?: bool }  → to evaluators in their pool
//  Evaluator:  { subject, body }                                        → to the admins of their org(s)
// Also: { mark_read: id } to mark one inbox message read.
export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = await appUserId(session);
    if (!userId) return NextResponse.json({ error: "No user" }, { status: 400 });

    const bodyJson = await request.json().catch(() => ({}));

    if (bodyJson.mark_read) {
      try { await sql`UPDATE messages SET read_at = NOW() WHERE id = ${bodyJson.mark_read} AND to_user_id = ${userId}`; } catch {}
      return NextResponse.json({ success: true });
    }

    const subject = (bodyJson.subject || "").trim() || "Message";
    const text = (bodyJson.body || "").trim();
    if (!text) return NextResponse.json({ error: "Message body required" }, { status: 400 });

    // Resolve recipients + context org based on sender role
    let recipientIds = [];
    let orgId = null;

    if (ADMIN_ROLES.has(session.role)) {
      const accessible = await getAccessibleOrgIds(session);
      const orgFilter = accessible === null ? null : accessible;
      orgId = orgFilter && orgFilter.length ? orgFilter[0] : null;
      const pool = orgFilter === null
        ? await sql`SELECT DISTINCT em.user_id FROM evaluator_memberships em JOIN users u ON u.id = em.user_id WHERE em.status='active' AND u.role = ANY(${[...EVAL_ROLES]})`
        : await sql`SELECT DISTINCT em.user_id FROM evaluator_memberships em JOIN users u ON u.id = em.user_id WHERE em.organization_id = ANY(${orgFilter}) AND em.status='active' AND u.role = ANY(${[...EVAL_ROLES]})`;
      const allowed = new Set(pool.map(p => p.user_id));
      if (bodyJson.to_all_pool) {
        recipientIds = [...allowed];
      } else if (Array.isArray(bodyJson.to_user_ids)) {
        recipientIds = bodyJson.to_user_ids.map(Number).filter(id => allowed.has(id));
      }
    } else if (EVAL_ROLES.has(session.role)) {
      // Evaluator → admins of their org(s)
      const myOrgs = await sql`SELECT DISTINCT organization_id FROM evaluator_memberships WHERE user_id = ${userId} AND status='active'`;
      const orgIds = myOrgs.map(o => o.organization_id);
      if (orgIds.length) {
        orgId = orgIds[0];
        const roleAdmins = await sql`SELECT DISTINCT user_id FROM user_organization_roles WHERE organization_id = ANY(${orgIds})`;
        const contactAdmins = await sql`
          SELECT u.id AS user_id FROM organizations o JOIN users u ON u.email = o.contact_email WHERE o.id = ANY(${orgIds})
        `;
        recipientIds = [...new Set([...roleAdmins.map(r => r.user_id), ...contactAdmins.map(c => c.user_id)])];
      }
    } else {
      return NextResponse.json({ error: "Not allowed to send messages" }, { status: 403 });
    }

    recipientIds = [...new Set(recipientIds.filter(id => id && id !== userId))];
    if (!recipientIds.length) return NextResponse.json({ error: "No valid recipients" }, { status: 400 });

    const fromName = session.name || session.email;
    const recipients = await sql`SELECT id, email, name FROM users WHERE id = ANY(${recipientIds})`;

    const orgRow = orgId ? await sql`SELECT name FROM organizations WHERE id = ${orgId}` : [];
    const orgName = orgRow[0]?.name || "";

    let sent = 0;
    for (const r of recipients) {
      try {
        await sql`
          INSERT INTO messages (organization_id, from_user_id, from_name, to_user_id, subject, body)
          VALUES (${orgId}, ${userId}, ${fromName}, ${r.id}, ${subject}, ${text})
        `;
      } catch (e) {
        // messages table not migrated — abort with a clear error
        return NextResponse.json({ error: "Messaging is not available yet (pending migration)." }, { status: 503 });
      }
      await createNotification(r.id, {
        type: "message",
        title: `New message from ${fromName}`,
        body: subject,
        link: EVAL_ROLES.has(session.role) ? "/service-provider/dashboard" : "/evaluator/dashboard",
      });
      const html = emailWrapper(`
        <h2 style="margin:0 0 6px;font-family:'Archivo','Hanken Grotesk',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#101113;">${subject}</h2>
        <p style="margin:0 0 6px;font-size:12px;color:#9aa0aa;">From ${fromName}${orgName ? ` · ${orgName}` : ""}</p>
        <div style="background:#fbfbf9;border:1px solid #ededeb;border-radius:10px;padding:16px 20px;margin:14px 0;font-size:14px;color:#101113;line-height:1.6;white-space:pre-wrap;">${text.replace(/</g, "&lt;")}</div>
        <p style="font-size:12px;color:#9aa0aa;margin:0;">Reply from your Sideline Star dashboard.</p>
      `);
      await sendEmail(r.email, `Message from ${fromName} — Sideline Star`, html);
      sent++;
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error("Messages POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
