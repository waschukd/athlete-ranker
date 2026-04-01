import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import sql from "@/lib/db";

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { organization_id, email, name } = await request.json();

    if (!organization_id || !email) {
      return NextResponse.json({ error: "Organization and email required" }, { status: 400 });
    }

    // Get org details
    const orgs = await sql`SELECT * FROM organizations WHERE id = ${organization_id}`;
    if (!orgs.length) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    const org = orgs[0];

    // Generate invite token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Save invite to DB
    await sql`
      INSERT INTO admin_invites (organization_id, email, name, token, expires_at, status)
      VALUES (${organization_id}, ${email}, ${name || null}, ${token}, ${expiresAt}, 'pending')
      ON CONFLICT (email, organization_id) DO UPDATE SET
        token = ${token}, expires_at = ${expiresAt}, status = 'pending', created_at = NOW()
    `;

    const inviteUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/accept-invite?token=${token}`;

    // Send email via Resend if API key is set
    if (process.env.RESEND_API_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "noreply@sidelinestar.com",
          to: email,
          subject: `You've been invited to manage ${org.name} on Sideline Star`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <div style="text-align: center; margin-bottom: 32px;">
                <div style="display: inline-flex; width: 48px; height: 48px; background: linear-gradient(135deg, #1A6BFF, #4D8FFF); border-radius: 12px; align-items: center; justify-content: center; margin-bottom: 16px;">
                  <span style="color: white; font-size: 20px;">⚡</span>
                </div>
                <h1 style="font-size: 24px; font-weight: 700; color: #111; margin: 0;">You're invited!</h1>
              </div>

              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                Hi ${name || "there"},
              </p>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                You've been invited to manage <strong>${org.name}</strong> on Sideline Star — the platform for running hockey evaluations and tryouts.
              </p>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1A6BFF, #4D8FFF); color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px;">
                  Accept Invitation →
                </a>
              </div>

              <p style="color: #888; font-size: 13px; text-align: center;">
                This link expires in 7 days. If you didn't expect this invitation, you can ignore it.
              </p>

              <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
              <p style="color: #aaa; font-size: 12px; text-align: center;">Sideline Star · Athlete Evaluation Platform</p>
            </div>
          `,
        }),
      });
    }

    return NextResponse.json({
      success: true,
      inviteUrl,
      message: process.env.RESEND_API_KEY
        ? `Invitation sent to ${email}`
        : `Email not configured — use this link: ${inviteUrl}`,
    });
  } catch (error) {
    console.error("Invite error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
