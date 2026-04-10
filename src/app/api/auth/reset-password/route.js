import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { hashPassword } from "@/lib/password";

export async function POST(request) {
  try {
    const { token, password } = await request.json();
    if (!token || !password) return NextResponse.json({ error: "Token and password required" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

    // Find valid token
    const tokens = await sql`
      SELECT * FROM password_reset_tokens
      WHERE token = ${token}
        AND expires_at > NOW()
        AND (used = false OR used IS NULL)
    `;
    if (!tokens.length) return NextResponse.json({ error: "Invalid or expired reset link. Please request a new one." }, { status: 400 });

    const { email } = tokens[0];
    const hashedPassword = await hashPassword(password);

    // Update password
    const authUser = await sql`SELECT id FROM auth_users WHERE email = ${email}`;
    if (!authUser.length) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await sql`
      UPDATE auth_accounts SET password = ${hashedPassword}
      WHERE "userId" = ${authUser[0].id} AND provider = 'credentials'
    `;

    // Mark token as used
    await sql`UPDATE password_reset_tokens SET used = true WHERE token = ${token}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
