import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import { FROM } from "@/lib/email";
import { createAndSendDirectorInvite } from "@/lib/invites";

// Invite one director across MANY categories at once (e.g. "everyone who
// oversees AA" or "everyone who oversees House") — the per-category
// invite-director route only assigns one category per call, so an association
// splitting into streams would otherwise repeat the same invite N times.

const intId = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; };

// authorizeOrgAccess alone also admits plain evaluators via membership --
// inviting someone into an active director role needs the stronger admin check.
const DIRECTOR_INVITE_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin"]);

async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
}

export async function POST(request, { params }) {
  try {
    const orgId = intId(params.orgId);
    if (!orgId) return NextResponse.json({ error: "Invalid organization" }, { status: 400 });
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!DIRECTOR_INVITE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const auth = await authorizeOrgAccess(session, orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const categoryIds = Array.isArray(body.category_ids) ? [...new Set(body.category_ids.map(intId).filter(Boolean))] : [];
    if (!name || !email) return NextResponse.json({ error: "Name and email required" }, { status: 400 });
    if (!categoryIds.length) return NextResponse.json({ error: "Select at least one category" }, { status: 400 });

    const cats = await sql`
      SELECT ac.id, ac.name, o.name AS org_name
      FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id
      WHERE ac.id = ANY(${categoryIds}) AND ac.organization_id = ${orgId}
      ORDER BY ac.name
    `;
    if (!cats.length) return NextResponse.json({ error: "No matching categories in this organization" }, { status: 400 });
    const orgName = cats[0].org_name;

    const appUser = await sql`SELECT id FROM users WHERE email = ${email}`;
    const isNew = !appUser.length;

    // A brand new person gets the same click-a-link-set-your-password flow as
    // an org admin invite -- no temp password ever changes hands, and the
    // category assignments land once they actually accept. Someone who
    // already has a working login just gets notified and assigned now.
    if (isNew) {
      await createAndSendDirectorInvite({ organizationId: orgId, email, name, orgName, categories: cats });
      return NextResponse.json({
        success: true,
        assigned: cats.length,
        message: `Invite sent to ${email} for ${cats.length} categor${cats.length === 1 ? "y" : "ies"} — they'll be assigned once they accept.`,
      });
    }

    const dashUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com"}/director/dashboard`;
    await sendEmail(email, `Director Assignment — ${orgName}`,
      `<!DOCTYPE html>
      <html>
      <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
          <tr><td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:linear-gradient(135deg,#0b5cd6,#3b82f6);padding:32px 40px;text-align:center;">
                  <div style="font-size:24px;font-weight:800;color:#ffffff;">Sideline Star</div>
                  <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">Athlete Evaluation Platform</div>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">New Director Assignment</h1>
                  <p style="margin:0 0 16px;font-size:15px;color:#6b7280;line-height:1.6;">
                    Hi <strong style="color:#111827;">${name}</strong>, you've been assigned as director for <strong style="color:#111827;">${cats.length}</strong> categor${cats.length === 1 ? "y" : "ies"} at <strong style="color:#111827;">${orgName}</strong>:
                  </p>
                  <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#374151;line-height:1.8;">
                    ${cats.map(c => `<li>${c.name}</li>`).join("")}
                  </ul>
                  <a href="${dashUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#0b5cd6,#3b82f6);color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">
                    View Dashboard →
                  </a>
                  <p style="margin:16px 0 0;font-size:13px;color:#374151;">Or open this link directly: <a href="${dashUrl}" style="color:#0b5cd6;text-decoration:underline;font-weight:600;word-break:break-all;">${dashUrl}</a></p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;">© Sideline Star · You received this because you were invited by ${orgName}</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>`
    );

    for (const cat of cats) {
      await sql`
        INSERT INTO director_assignments (user_id, age_category_id, organization_id, status)
        VALUES (${appUser[0].id}, ${cat.id}, ${orgId}, 'active')
        ON CONFLICT (user_id, age_category_id) DO UPDATE SET status = 'active'
      `;
    }

    return NextResponse.json({
      success: true,
      assigned: cats.length,
      message: `${name} assigned as director to ${cats.length} categor${cats.length === 1 ? "y" : "ies"} and notified by email.`,
    });
  } catch (error) {
    console.error("Bulk invite director error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
