import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import { hashPassword } from "@/lib/password";
import { FROM } from "@/lib/email";

// Invite one director across MANY categories at once (e.g. "everyone who
// oversees AA" or "everyone who oversees House") — the per-category
// invite-director route only assigns one category per call, so an association
// splitting into streams would otherwise repeat the same invite N times.

const intId = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; };

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
    const catNames = cats.map(c => c.name);

    let appUser = await sql`SELECT id FROM users WHERE email = ${email}`;
    const isNew = !appUser.length;

    if (isNew) {
      const tempPassword = Math.random().toString(36).slice(-8) + "!A1";
      const [authUser] = await sql`
        INSERT INTO auth_users (email, name, "emailVerified")
        VALUES (${email}, ${name}, NOW())
        ON CONFLICT (email) DO UPDATE SET name = ${name}
        RETURNING *
      `;
      await sql`
        INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
        VALUES (${authUser.id}, 'credentials', 'credentials', ${email}, ${await hashPassword(tempPassword)})
        ON CONFLICT DO NOTHING
      `;
      const [newUser] = await sql`
        INSERT INTO users (email, name, role)
        VALUES (${email}, ${name}, 'director')
        ON CONFLICT (email) DO UPDATE SET role = 'director'
        RETURNING *
      `;
      appUser = [newUser];

      const loginUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com"}/account/signin`;
      await sendEmail(email, `You've been invited as a Director — ${orgName}`,
        `<!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
            <tr><td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <tr>
                  <td style="background:linear-gradient(135deg,#0b5cd6,#3b82f6);padding:32px 40px;text-align:center;">
                    <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Sideline Star</div>
                    <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">Athlete Evaluation Platform</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:40px;">
                    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">You're invited as a Director</h1>
                    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;line-height:1.6;">
                      Hi <strong style="color:#111827;">${name}</strong>, you've been assigned as director for <strong style="color:#111827;">${catNames.length}</strong> categor${catNames.length === 1 ? "y" : "ies"} at <strong style="color:#111827;">${orgName}</strong>:
                    </p>
                    <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#374151;line-height:1.8;">
                      ${catNames.map(n => `<li>${n}</li>`).join("")}
                    </ul>
                    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
                      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;margin-bottom:12px;">Your Login Credentials</div>
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding:6px 0;font-size:14px;color:#6b7280;width:120px;">Email</td>
                          <td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;">${email}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;font-size:14px;color:#6b7280;">Temp Password</td>
                          <td style="padding:6px 0;">
                            <code style="font-size:14px;font-weight:700;color:#0b5cd6;background:#fff7f4;border:1px solid #fed7c3;padding:3px 8px;border-radius:6px;">${tempPassword}</code>
                          </td>
                        </tr>
                      </table>
                    </div>
                    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Please sign in and update your password when prompted.</p>
                    <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#0b5cd6,#3b82f6);color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.01em;">
                      Sign In to Sideline Star →
                    </a>
                    <p style="margin:16px 0 0;font-size:13px;color:#374151;">Or open this link directly: <a href="${loginUrl}" style="color:#0b5cd6;text-decoration:underline;font-weight:600;word-break:break-all;">${loginUrl}</a></p>
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
    } else {
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
                      Hi <strong style="color:#111827;">${name}</strong>, you've been assigned as director for <strong style="color:#111827;">${catNames.length}</strong> categor${catNames.length === 1 ? "y" : "ies"} at <strong style="color:#111827;">${orgName}</strong>:
                    </p>
                    <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#374151;line-height:1.8;">
                      ${catNames.map(n => `<li>${n}</li>`).join("")}
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
    }

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
