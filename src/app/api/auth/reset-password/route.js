import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { hashPassword } from "@/lib/password";

// Tokens are 256-bit random hex so brute force is impractical, but
// defence-in-depth: cap submissions per IP so an attacker can't run
// a slow guessing campaign against the namespace.
const MAX_BY_IP = 10;
const WINDOW_MINS = 15;
const ENDPOINT = "reset";

async function ipOverLimit(ip) {
  try {
    const r = await sql`
      SELECT COUNT(*)::int AS c FROM auth_rate_limit
      WHERE endpoint = ${ENDPOINT} AND ip = ${ip}
        AND attempted_at > NOW() - INTERVAL '15 minutes'
    `;
    return (r[0]?.c || 0) >= MAX_BY_IP;
  } catch (err) {
    console.error("[reset-password] rate-limit query failed, allowing:", err?.message || err);
    return false;
  }
}

async function recordAttempt(ip) {
  try {
    await sql`
      INSERT INTO auth_rate_limit (endpoint, ip, attempted_at)
      VALUES (${ENDPOINT}, ${ip}, NOW())
    `;
  } catch (err) {
    console.error("[reset-password] failed to record rate-limit row:", err?.message || err);
  }
}

export async function POST(request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";

    if (await ipOverLimit(ip)) {
      return NextResponse.json(
        { error: "Too many reset attempts from this network. Please wait 15 minutes." },
        { status: 429 },
      );
    }

    const { token, password } = await request.json();
    if (!token || !password) {
      await recordAttempt(ip);
      return NextResponse.json({ error: "Token and password required" }, { status: 400 });
    }
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

    // Find valid token
    const tokens = await sql`
      SELECT * FROM password_reset_tokens
      WHERE token = ${token}
        AND expires_at > NOW()
        AND (used = false OR used IS NULL)
    `;
    if (!tokens.length) {
      await recordAttempt(ip);
      return NextResponse.json({ error: "Invalid or expired reset link. Please request a new one." }, { status: 400 });
    }

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
