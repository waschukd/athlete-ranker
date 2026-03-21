import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import sql from "@/lib/db";
import { sendEmail } from "@/lib/email";

export async function POST(request) {
  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

    // Always return success to prevent email enumeration
    const users = await sql`SELECT * FROM auth_users WHERE email = ${email}`;
    if (!users.length) {
      return NextResponse.json({ success: true });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token — upsert by email
    await sql`
      INSERT INTO password_reset_tokens (email, token, expires_at)
      VALUES (${email}, ${token}, ${expiresAt})
      ON CONFLICT (email) DO UPDATE SET token = ${token}, expires_at = ${expiresAt}, used = false
    `.catch(async () => {
      // Table might not have unique constraint — delete and insert
      await sql`DELETE FROM password_reset_tokens WHERE email = ${email}`;
      await sql`INSERT INTO password_reset_tokens (email, token, expires_at) VALUES (${email}, ${token}, ${expiresAt})`;
    });

    const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/account/reset-password?token=${token}`;

    await sendEmail(email, "Reset your AthleteRanker password", `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;">
        <div style="background:linear-gradient(135deg,#FF6B35,#F7931E);padding:28px 40px;text-align:center;border-radius:12px 12px 0 0;">
          <div style="font-size:22px;font-weight:800;color:#fff;">AthleteRanker</div>
        </div>
        <div style="background:#fff;padding:36px 40px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
          <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111;">Reset your password</h2>
          <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Click the button below to set a new password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">Reset Password →</a>
          <p style="color:#9ca3af;font-size:12px;margin:24px 0 0;">If you didn't request this, ignore this email. Your password won't change.</p>
        </div>
      </div>
    `);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
