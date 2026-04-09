import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { signToken } from "@/lib/auth";
import { verifyPassword, hashPassword } from "@/lib/password";

const loginAttempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + WINDOW_MS; }
  entry.count++;
  loginAttempts.set(ip, entry);
  return entry.count <= MAX_ATTEMPTS;
}

export async function POST(request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    if (!checkRateLimit(ip)) {
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
    return NextResponse.json({ error: "Login failed: " + error.message }, { status: 500 });
  }
}
