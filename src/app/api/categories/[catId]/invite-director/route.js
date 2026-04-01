import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createHash } from "node:crypto";

function hashPassword(p) {
  return createHash("sha256").update(p).digest("hex");
}

async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "noreply@athleteranker.com", to, subject, html }),
  });
}

export async function GET(request, { params }) {
  // Get existing directors for this category
  const { catId } = params;
  const directors = await sql`
    SELECT u.id, u.name, u.email, da.status, da.created_at
    FROM director_assignments da
    JOIN users u ON u.id = da.user_id
    WHERE da.age_category_id = ${catId}
    ORDER BY da.created_at DESC
  `;
  return NextResponse.json({ directors });
}

export async function POST(request, { params }) {
  try {
    const { catId } = params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { email, name } = await request.json();
    if (!email || !name) return NextResponse.json({ error: "Name and email required" }, { status: 400 });

    // Get category + org info
    const catInfo = await sql`
      SELECT ac.*, o.name as org_name, o.id as org_id
      FROM age_categories ac
      JOIN organizations o ON o.id = ac.organization_id
      WHERE ac.id = ${catId}
    `;
    if (!catInfo.length) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    const cat = catInfo[0];

    // Check if user already exists
    let appUser = await sql`SELECT id FROM users WHERE email = ${email}`;

    if (!appUser.length) {
      // Create new director account with temp password
      const tempPassword = Math.random().toString(36).slice(-8) + "!A1";

      const [authUser] = await sql`
        INSERT INTO auth_users (email, name, "emailVerified")
        VALUES (${email}, ${name}, NOW())
        ON CONFLICT (email) DO UPDATE SET name = ${name}
        RETURNING *
      `;
      await sql`
        INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
        VALUES (${authUser.id}, 'credentials', 'credentials', ${email}, ${hashPassword(tempPassword)})
        ON CONFLICT DO NOTHING
      `;
      const [newUser] = await sql`
        INSERT INTO users (email, name, role)
        VALUES (${email}, ${name}, 'director')
        ON CONFLICT (email) DO UPDATE SET role = 'director'
        RETURNING *
      `;
      appUser = [newUser];

      // Send invite email with temp password
      const loginUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/account/signin`;
      await sendEmail(email, `You've been invited as a Director — ${cat.name} at ${cat.org_name}`,
        `<!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
            <tr><td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                
                <!-- Header -->
                <tr>
                  <td style="background:linear-gradient(135deg,#1A6BFF,#4D8FFF);padding:32px 40px;text-align:center;">
                    <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">AthleteRanker</div>
                    <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">Athlete Evaluation Platform</div>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:40px;">
                    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">You're invited as a Director</h1>
                    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                      Hi <strong style="color:#111827;">${name}</strong>, you've been assigned as a director for <strong style="color:#111827;">${cat.name}</strong> at <strong style="color:#111827;">${cat.org_name}</strong>.
                    </p>

                    <!-- Credentials box -->
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
                            <code style="font-size:14px;font-weight:700;color:#1A6BFF;background:#fff7f4;border:1px solid #fed7c3;padding:3px 8px;border-radius:6px;">${tempPassword}</code>
                          </td>
                        </tr>
                      </table>
                    </div>

                    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Please sign in and update your password when prompted.</p>

                    <!-- CTA Button -->
                    <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#1A6BFF,#4D8FFF);color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.01em;">
                      Sign In to AthleteRanker →
                    </a>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
                    <p style="margin:0;font-size:12px;color:#9ca3af;">© AthleteRanker · You received this because you were invited by ${cat.org_name}</p>
                  </td>
                </tr>

              </table>
            </td></tr>
          </table>
        </body>
        </html>`
      );
    } else {
      // Existing user — just notify
      const dashUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/director/dashboard`;
      await sendEmail(email, `Director Assignment — ${cat.name} at ${cat.org_name}`,
        `<!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
            <tr><td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <tr>
                  <td style="background:linear-gradient(135deg,#1A6BFF,#4D8FFF);padding:32px 40px;text-align:center;">
                    <div style="font-size:24px;font-weight:800;color:#ffffff;">AthleteRanker</div>
                    <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">Athlete Evaluation Platform</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:40px;">
                    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">New Director Assignment</h1>
                    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                      Hi <strong style="color:#111827;">${name}</strong>, you've been assigned as director for <strong style="color:#111827;">${cat.name}</strong> at <strong style="color:#111827;">${cat.org_name}</strong>.
                    </p>
                    <a href="${dashUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#1A6BFF,#4D8FFF);color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">
                      View Dashboard →
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
                    <p style="margin:0;font-size:12px;color:#9ca3af;">© AthleteRanker · You received this because you were invited by ${cat.org_name}</p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>`
      );
    }

    // Assign to category
    await sql`
      INSERT INTO director_assignments (user_id, age_category_id, organization_id, status)
      VALUES (${appUser[0].id}, ${catId}, ${cat.org_id}, 'active')
      ON CONFLICT (user_id, age_category_id) DO UPDATE SET status = 'active'
    `;

    return NextResponse.json({ success: true, message: `${name} has been assigned as director and notified by email.` });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { catId } = params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    await sql`DELETE FROM director_assignments WHERE user_id = ${userId} AND age_category_id = ${catId}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
