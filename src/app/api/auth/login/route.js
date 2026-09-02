import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { signToken } from "@/lib/auth";
import { verifyPassword, hashPassword } from "@/lib/password";

// Rate limit policy:
// - Per IP:    20 failures / 15 min  (catches a single source pounding away)
// - Per email:  5 failures / 15 min  (catches distributed attacks against
//                                     a known account, where the attacker
//                                     is rotating IPs)
// Successes are NOT counted, so a legitimate user logging in from
// multiple devices doesn't burn through the budget.
//
// Both limits are checked BEFORE we try the password; failures are
// recorded only AFTER an invalid-credentials outcome.
const MAX_FAILS_BY_IP = 20;
const MAX_FAILS_BY_EMAIL = 5;
const WINDOW_MINS = 15;

async function checkRateLimit(ip, email) {
  try {
    const ipFails = await sql`
      SELECT COUNT(*)::int AS c FROM login_attempts
      WHERE ip = ${ip} AND attempted_at > NOW() - INTERVAL '15 minutes'
    `;
    if ((ipFails[0]?.c || 0) >= MAX_FAILS_BY_IP) {
      return { allowed: false, reason: "ip" };
    }
    if (email) {
      const emailFails = await sql`
        SELECT COUNT(*)::int AS c FROM login_attempts
        WHERE email = ${email} AND attempted_at > NOW() - INTERVAL '15 minutes'
      `;
      if ((emailFails[0]?.c || 0) >= MAX_FAILS_BY_EMAIL) {
        return { allowed: false, reason: "email" };
      }
    }
    return { allowed: true };
  } catch (err) {
    // Table missing or DB hiccup: log loudly and fail-open. Better to
    // accept logins than lock everyone out of the product, but ops
    // should see this in the logs and fix it fast.
    console.error("[login] rate-limit table query failed, allowing request:", err?.message || err);
    return { allowed: true };
  }
}

async function recordFailure(ip, email) {
  try {
    await sql`INSERT INTO login_attempts (ip, email, attempted_at) VALUES (${ip}, ${email || null}, NOW())`;
  } catch (err) {
    console.error("[login] failed to record login_attempts row:", err?.message || err);
  }
}

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  let email;
  try {
    const body = await request.json();
    // Normalized once, used everywhere below -- email is case-insensitive in
    // practice (Gmail and friends don't distinguish), so both the auth lookups
    // and the per-email rate-limit bucket need to agree on one case or a typed
    // "Foo@x.com" vs stored "foo@x.com" either locks out a real login (the bug
    // that prompted this) or lets an attacker dodge the 5-failure cap by
    // varying case on each attempt.
    email = (body.email || "").trim().toLowerCase();
    const { password } = body;

    const gate = await checkRateLimit(ip, email);
    if (!gate.allowed) {
      return NextResponse.json(
        { error: "Too many failed login attempts. Please wait 15 minutes." },
        { status: 429 },
      );
    }

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    // Real incident: a tester's login attempts recorded as
    // "Ryannjperrett@gmail.com" (phone keyboards auto-capitalize a field's
    // first letter) against a stored "ryannjperrett@gmail.com" -- an exact
    // match failed even though it was the right account and right password.
    // Email is case-insensitive everywhere else (Gmail, RFC in practice), so
    // compare that way here too rather than trusting every caller to have
    // typed/stored it in matching case.
    const authUsers = await sql`SELECT * FROM auth_users WHERE LOWER(email) = LOWER(${email})`;
    if (!authUsers.length) {
      await recordFailure(ip, email);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    const authUser = authUsers[0];

    // A user can end up with more than one credentials row (e.g. re-invited
    // before their app-role row existed yet, so the invite flow treated them
    // as brand new and minted a second one) -- check every row rather than
    // assuming accounts[0] is the one holding the current password.
    const accounts = await sql`SELECT password FROM auth_accounts WHERE "userId" = ${authUser.id} AND provider = 'credentials' AND password IS NOT NULL`;
    if (!accounts.length) {
      await recordFailure(ip, email);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    let storedHash = null;
    for (const acct of accounts) {
      if (await verifyPassword(password, acct.password)) { storedHash = acct.password; break; }
    }
    if (!storedHash) {
      await recordFailure(ip, email);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // ── Successful login from here down ────────────────────────────

    // Transparently upgrade legacy SHA256 hashes to bcrypt on successful login
    if (/^[a-f0-9]{64}$/.test(storedHash)) {
      const bcryptHash = await hashPassword(password);
      await sql`UPDATE auth_accounts SET password = ${bcryptHash} WHERE "userId" = ${authUser.id} AND provider = 'credentials'`;
    }
    const appUsers = await sql`SELECT * FROM users WHERE LOWER(email) = LOWER(${email})`;
    const appUser = appUsers[0];
    const role = appUser?.role || "association_evaluator";
    const token = await signToken({
      userId: authUser.id,
      email: authUser.email,
      name: authUser.name,
      role,
    });

    // Resolve the admin's org for the post-login redirect. contact_email covers the
    // ORIGINAL owner; an invited co-admin (linked via user_organization_roles, e.g.
    // Mike invites Brian to KC North) is NOT the contact_email, so fall back to their
    // org role. Without this they'd land on /association/dashboard with no ?org and
    // see an empty page on every login after the first (the invite-accept redirect).
    const orgRow = await sql`SELECT id FROM organizations WHERE LOWER(contact_email) = LOWER(${email}) LIMIT 1`;
    let orgId = orgRow[0]?.id;
    if (!orgId && appUser?.id && (role === "association_admin" || role === "service_provider_admin" || role === "goalie_service_provider_admin")) {
      const wantType = role === "association_admin" ? "association" : role === "goalie_service_provider_admin" ? "goalie_service_provider" : "service_provider";
      const uor = await sql`
        SELECT uor.organization_id FROM user_organization_roles uor
        JOIN organizations o ON o.id = uor.organization_id
        WHERE uor.user_id = ${appUser.id} AND o.type = ${wantType}
        ORDER BY uor.organization_id LIMIT 1`;
      orgId = uor[0]?.organization_id;
    }

    let redirectTo = "/evaluator/dashboard";
    if (role === "super_admin") redirectTo = "/admin/god-mode";
    else if (role === "service_provider_admin") redirectTo = orgId ? `/service-provider/dashboard?org=${orgId}` : "/service-provider/dashboard";
    else if (role === "goalie_service_provider_admin") redirectTo = orgId ? `/goalie-provider/dashboard?org=${orgId}` : "/goalie-provider/dashboard";
    else if (role === "association_admin") redirectTo = orgId ? `/association/dashboard?org=${orgId}` : "/association/dashboard";
    else if (role === "director") redirectTo = "/director/dashboard";
    else if (role === "service_provider_evaluator") redirectTo = "/evaluator/dashboard";
    else if (role === "association_evaluator") redirectTo = "/evaluator/dashboard";
    else if (role === "volunteer") redirectTo = "/checkin";

    const response = NextResponse.json({
      success: true,
      user: { id: appUser?.id, email: authUser.email, name: authUser.name, role },
      redirectTo,
    });
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
