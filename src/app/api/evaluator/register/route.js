import { NextResponse } from "next/server";
import { emailEvaluatorPendingApproval } from "@/lib/email";
import sql from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { checkAndRecord, clientIp } from "@/lib/rateLimit";

function generateEvaluatorId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "EVL-";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "noreply@sidelinestar.com", to, subject, html }),
  });
}

// Public code lookup so the signup page can present tester vs evaluator wording
// before the user submits. Returns nothing sensitive — just the org name + role.
export async function GET(request) {
  try {
    const code = new URL(request.url).searchParams.get("code");
    if (!code) return NextResponse.json({ valid: false });
    const rows = await sql`
      SELECT o.name as org_name, ejc.role
      FROM evaluator_join_codes ejc JOIN organizations o ON o.id = ejc.organization_id
      WHERE UPPER(ejc.code) = UPPER(${code.trim()})
        AND (ejc.expires_at IS NULL OR ejc.expires_at > NOW()) AND ejc.uses < ejc.max_uses`;
    if (!rows.length) return NextResponse.json({ valid: false });
    return NextResponse.json({ valid: true, org_name: rows[0].org_name, role: rows[0].role, is_tester: rows[0].role === "service_provider_tester" });
  } catch {
    return NextResponse.json({ valid: false });
  }
}

export async function POST(request) {
  try {
    // Throttle signups by IP — stops account-creation / outbound-email spam.
    const { allowed } = await checkAndRecord({
      endpoint: "evaluator_register",
      identifier: clientIp(request),
      max: 8,
      windowMins: 60,
    });
    if (!allowed) {
      return NextResponse.json({ error: "Too many attempts, please wait a moment." }, { status: 429 });
    }

    const { name, email, password, code } = await request.json();

    if (!name || !email || !password || !code) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Validate join code
    const joinCodes = await sql`
      SELECT ejc.*, o.name as org_name, o.type as org_type, o.id as org_id
      FROM evaluator_join_codes ejc
      JOIN organizations o ON o.id = ejc.organization_id
      WHERE UPPER(ejc.code) = UPPER(${code.trim()})
        AND (ejc.expires_at IS NULL OR ejc.expires_at > NOW())
        AND ejc.uses < ejc.max_uses
    `;

    if (!joinCodes.length) {
      return NextResponse.json({ error: "Invalid or expired join code. Contact your organization for a valid code." }, { status: 400 });
    }

    const joinCode = joinCodes[0];

    // Check if email already exists
    const existing = await sql`SELECT id FROM auth_users WHERE email = ${email}`;
    if (existing.length) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
    }

    // Generate unique evaluator ID
    let evaluatorId = generateEvaluatorId();
    let attempts = 0;
    while (attempts < 10) {
      const taken = await sql`SELECT id FROM users WHERE evaluator_id = ${evaluatorId}`;
      if (!taken.length) break;
      evaluatorId = generateEvaluatorId();
      attempts++;
    }

    // Create auth user
    const [authUser] = await sql`
      INSERT INTO auth_users (email, name, "emailVerified")
      VALUES (${email}, ${name}, NOW())
      RETURNING *
    `;

    // Create auth account
    await sql`
      INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
      VALUES (${authUser.id}, 'credentials', 'credentials', ${email}, ${await hashPassword(password)})
    `;

    // Determine role from the CODE's role (tester codes create testers), falling
    // back to org type for evaluator codes.
    const isTester = joinCode.role === "service_provider_tester";
    const noun = isTester ? "tester" : "evaluator";
    const role = isTester ? "service_provider_tester"
      : joinCode.org_type === "service_provider" ? "service_provider_evaluator"
      : "association_evaluator";

    // Create app user
    const [appUser] = await sql`
      INSERT INTO users (email, name, role, evaluator_id)
      VALUES (${email}, ${name}, ${role}, ${evaluatorId})
      RETURNING *
    `;

    // Create membership — PENDING approval. Capability rides on flags.
    await sql`
      INSERT INTO evaluator_memberships (user_id, organization_id, role, status, joined_via, pending, is_tester, is_evaluator)
      VALUES (${appUser.id}, ${joinCode.org_id}, ${role}, 'pending', 'join_code', true, ${isTester}, ${!isTester})
      ON CONFLICT (user_id, organization_id) DO UPDATE SET status = 'pending', pending = true,
        is_tester = evaluator_memberships.is_tester OR EXCLUDED.is_tester,
        is_evaluator = evaluator_memberships.is_evaluator OR EXCLUDED.is_evaluator
    `;

    // Increment code uses
    await sql`UPDATE evaluator_join_codes SET uses = uses + 1 WHERE id = ${joinCode.id}`;

    // Notify org admins — check both direct org owners and SP admins linked to this association
    const admins = await sql`
      SELECT DISTINCT u.email, u.name FROM users u WHERE u.email IN (
        SELECT contact_email FROM organizations WHERE id = ${joinCode.org_id}
        UNION
        SELECT o.contact_email FROM organizations o
        JOIN sp_association_links sal ON sal.service_provider_id = o.id
        WHERE sal.association_id = ${joinCode.org_id}
      )
    `;

    const dashboardUrl = joinCode.org_type === "service_provider"
      ? `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/service-provider/dashboard`
      : `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/association/dashboard?org=${joinCode.org_id}`;

    for (const admin of admins) {
      await sendEmail(
        admin.email,
        `New ${noun} pending approval — ${name}`,
        `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #111;">New ${noun} signup</h2>
          <p style="color: #555;"><strong>${name}</strong> (${email}) has signed up to join <strong>${joinCode.org_name}</strong> as a ${noun}.</p>
          <p style="color: #555;">Their ID is: <strong style="font-family: monospace; background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${evaluatorId}</strong></p>
          <p style="color: #555;">Please log in to approve or deny their access.</p>
          <a href="${dashboardUrl}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #0b5cd6; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
            Review Now →
          </a>
        </div>`
      );
    }

    // Send confirmation to evaluator
    await sendEmail(
      email,
      `Welcome to Sideline Star — pending approval`,
      `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #111;">You're almost in!</h2>
        <p style="color: #555;">Hi ${name}, your ${noun} account has been created and is pending approval from <strong>${joinCode.org_name}</strong>.</p>
        <p style="color: #555;">Your ID is: <strong style="font-family: monospace; background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${evaluatorId}</strong></p>
        <p style="color: #555;">You'll receive another email once you've been approved.</p>
      </div>`
    );

    return NextResponse.json({
      success: true,
      message: `Account created! Pending approval from ${joinCode.org_name}. You'll be notified by email once approved.`,
      evaluator_id: evaluatorId,
      org_name: joinCode.org_name,
      role,
      is_tester: isTester,
    });

  } catch (error) {
    console.error("Evaluator register error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
