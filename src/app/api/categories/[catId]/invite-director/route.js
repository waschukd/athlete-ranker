import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { sendEmail } from "@/lib/email";
import { createAndSendDirectorInvite } from "@/lib/invites";

// Guard against bad route params (e.g. "/api/categories/null/...") reaching an
// integer column — parse to a positive int or treat as missing.
const intId = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; };

// authorizeCategoryAccess alone also admits plain evaluators (and directors
// themselves) -- inviting someone into an active director role needs the
// stronger "is this person an admin" check, matching what the client already
// hides this action behind (canManage = role === "association" only).
const DIRECTOR_INVITE_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin"]);

export async function GET(request, { params }) {
  // Get existing directors for this category
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const catId = intId(params.catId);
    if (!catId) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const directors = await sql`
      SELECT u.id, u.name, u.email, da.status, da.created_at
      FROM director_assignments da
      JOIN users u ON u.id = da.user_id
      WHERE da.age_category_id = ${catId}
      ORDER BY da.created_at DESC
    `;
    return NextResponse.json({ directors });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const catId = intId(params.catId);
    if (!catId) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!DIRECTOR_INVITE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Accept either a single { name, email } or a batch { directors: [...] }.
    const body = await request.json();
    const list = Array.isArray(body.directors) ? body.directors : [{ name: body.name, email: body.email }];
    const seen = new Set();
    const dedup = [];
    for (const d of list) {
      const name = String(d?.name || "").trim();
      const email = String(d?.email || "").trim().toLowerCase();
      if (name && email && !seen.has(email)) { seen.add(email); dedup.push({ name, email }); }
    }
    if (!dedup.length) return NextResponse.json({ error: "Name and email required" }, { status: 400 });

    // Get category + org info
    const catInfo = await sql`
      SELECT ac.*, o.name as org_name, o.id as org_id
      FROM age_categories ac
      JOIN organizations o ON o.id = ac.organization_id
      WHERE ac.id = ${catId}
    `;
    if (!catInfo.length) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    const cat = catInfo[0];

    // Invite (or re-assign) one director. A brand new person gets the same
    // click-a-link-set-your-password flow as an org admin invite -- no temp
    // password ever changes hands, and the category assignment lands once
    // they actually accept (mirrors admin_invites/accept-invite exactly).
    // Someone who already has a working login just gets notified and
    // assigned immediately -- there's nothing for them to "accept".
    async function inviteOne(name, email) {
      const appUser = await sql`SELECT id FROM users WHERE email = ${email}`;

      if (!appUser.length) {
        await createAndSendDirectorInvite({
          organizationId: cat.org_id, email, name, orgName: cat.org_name,
          categories: [{ id: catId, name: cat.name }],
        });
        return { ok: true };
      }

      const dashUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com"}/director/dashboard`;
      await sendEmail(email, `Director Assignment — ${cat.name} at ${cat.org_name}`,
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
                    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                      Hi <strong style="color:#111827;">${name}</strong>, you've been assigned as director for <strong style="color:#111827;">${cat.name}</strong> at <strong style="color:#111827;">${cat.org_name}</strong>.
                    </p>
                    <a href="${dashUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#0b5cd6,#3b82f6);color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">
                      View Dashboard →
                    </a>
                    <p style="margin:16px 0 0;font-size:13px;color:#374151;">Or open this link directly: <a href="${dashUrl}" style="color:#0b5cd6;text-decoration:underline;font-weight:600;word-break:break-all;">${dashUrl}</a></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
                    <p style="margin:0;font-size:12px;color:#9ca3af;">© Sideline Star · You received this because you were invited by ${cat.org_name}</p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>`
      );

      await sql`
        INSERT INTO director_assignments (user_id, age_category_id, organization_id, status)
        VALUES (${appUser[0].id}, ${catId}, ${cat.org_id}, 'active')
        ON CONFLICT (user_id, age_category_id) DO UPDATE SET status = 'active'
      `;
      return { ok: true };
    }

    const results = [];
    for (const d of dedup) {
      try {
        await inviteOne(d.name, d.email);
        results.push({ email: d.email, name: d.name, ok: true });
      } catch (e) {
        console.error("Invite director failed for " + d.email + ":", e?.message || e);
        results.push({ email: d.email, name: d.name, ok: false, error: e?.message || "failed" });
      }
    }
    const invited = results.filter(r => r.ok).length;
    const failed = results.length - invited;
    const message = failed
      ? `${invited} invited${failed ? `, ${failed} failed` : ""}.`
      : `${invited} director${invited === 1 ? "" : "s"} invited and notified by email.`;
    return NextResponse.json({ success: invited > 0, invited, failed, results, message });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const catId = intId(params.catId);
    if (!catId) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Same admin-only gate as POST -- revoking a director's assignment isn't
    // something a fellow director (self-authorized for this category) or an
    // evaluator should be able to do.
    if (!DIRECTOR_INVITE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const userId = intId(searchParams.get("user_id"));
    if (!userId) return NextResponse.json({ error: "Invalid user" }, { status: 400 });
    await sql`DELETE FROM director_assignments WHERE user_id = ${userId} AND age_category_id = ${catId}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
