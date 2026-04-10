import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { signToken } from "@/lib/auth";
import { verifyPassword, hashPassword } from "@/lib/password";

const MAX_ATTEMPTS = 10;
const WINDOW_MINS = 15;

async function checkRateLimit(ip) {
  try {
    // Clean up old entries and count recent attempts in one query
    const result = await sql`
      SELECT COUNT(*) as attempts FROM login_attempts
      WHERE ip = ${ip} AND attempted_at > NOW() - INTERVAL '15 minutes'
    `;
    // This will fail gracefully if the table doesn't exist yet
    const attempts = parseInt(result[0]?.attempts || 0);
    if (attempts >= MAX_ATTEMPTS) return false;
    await sql`INSERT INTO login_attempts (ip, attempted_at) VALUES (${ip}, NOW())`;
    return true;
  } catch {
    // If login_attempts table doesn't exist, fall back to allowing the request
    // (table creation is a one-time manual step in Neon)
    return true;
  }
}

export async function POST(request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    if (!(await checkRateLimit(ip))) {
      return NextResponse.json({ error: "Too many login attempts. Please wait 15 minutes." }, { status: 429 });
    }
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }
    const authUsers = await sql`SELECT * FROM auth_users WHERE email = ${email}`;
    if (!authUsers.length) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    const authUser = authUsers[0];
    const accounts = await sql`SELECT password FROM auth_accounts WHERE "userId" = ${authUser.id} AND provider = 'credentials'`;
    if (!accounts.length || !accounts[0].password) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    const storedHash = accounts[0].password;
    if (!(await verifyPassword(password, storedHash))) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    // Transparently upgrade legacy SHA256 hashes to bcrypt on successful login
    if (/^[a-f0-9]{64}$/.test(storedHash)) {
      const bcryptHash = await hashPassword(password);
      await sql`UPDATE auth_accounts SET password = ${bcryptHash} WHERE "userId" = ${authUser.id} AND provider = 'credentials'`;
    }
    const appUsers = await sql`SELECT * FROM users WHERE email = ${email}`;
    const appUser = appUsers[0];
    const role = appUser?.role || "association_evaluator";
    const token = await signToken({
      userId: authUser.id,
      email: authUser.email,
      name: authUser.name,
      role,
    });

    const orgRow = await sql`SELECT id FROM organizations WHERE contact_email = ${email} LIMIT 1`;
    const orgId = orgRow[0]?.id;

    let redirectTo = "/evaluator/dashboard";
    if (role === "super_admin") redirectTo = "/admin/god-mode";
    else if (role === "service_provider_admin") redirectTo = orgId ? `/service-provider/dashboard?org=${orgId}` : "/service-provider/dashboard";
    else if (role === "association_admin") redirectTo = orgId ? `/association/dashboard?org=${orgId}` : "/association/dashboard";
    else if (role === "director") redirectTo = "/director/dashboard";
    else if (role === "service_provider_evaluator") redirectTo = "/evaluator/dashboard";
    else if (role === "association_evaluator") redirectTo = "/evaluator/dashboard";
    else if (role === "volunteer") redirectTo = "/evaluator/dashboard";

    const response = NextResponse.json({
      success: true,
      user: { id: appUser?.id, email, name: authUser.name, role },
      redirectTo,
    });
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
    });
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
