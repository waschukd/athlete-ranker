import { NextResponse } from "next/server";
import { emailEvaluatorPendingApproval } from "@/lib/email";
import { createHash, randomBytes } from "node:crypto";
import sql from "@/lib/db";

function hashPassword(p) {
  return createHash("sha256").update(p).digest("hex");
}

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
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "noreply@athleteranker.com", to, subject, html }),
  });
}

export async function POST(request) {
  try {
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
      VALUES (${authUser.id}, 'credentials', 'credentials', ${email}, ${hashPassword(password)})
    `;

    // Determine role based on org type
    const role = joinCode.org_type === "service_provider"
      ? "service_provider_evaluator"
      : "association_evaluator";

    // Create app user
    const [appUser] = await sql`
      INSERT INTO users (email, name, role, evaluator_id)
      VALUES (${email}, ${name}, ${role}, ${evaluatorId})
      RETURNING *
    `;

    // Create membership — PENDING approval
    await sql`
      INSERT INTO evaluator_memberships (user_id, organization_id, role, status, joined_via, pending)
      VALUES (${appUser.id}, ${joinCode.org_id}, ${role}, 'pending', 'join_code', true)
      ON CONFLICT (user_id, organization_id) DO UPDATE SET status = 'pending', pending = true
    `;

    // Increment code uses
    await sql`UPDATE evaluator_join_codes SET uses = uses + 1 WHERE id = ${joinCode.id}`;

    // Notify org admins
    const admins = await sql`
      SELECT u.email, u.name
      FROM users u
      WHERE u.role IN ('service_provider_admin', 'association_admin')
        AND u.id IN (
          SELECT user_id FROM evaluator_memberships
          WHERE organization_id = ${joinCode.org_id} AND status = 'active'
        )
    `;

    const dashboardUrl = joinCode.org_type === "service_provider"
      ? `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/service-provider/dashboard`
      : `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/association/dashboard?org=${joinCode.org_id}`;

    for (const admin of admins) {
      await sendEmail(
        admin.email,
        `New evaluator pending approval — ${name}`,
        `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #111;">New evaluator signup</h2>
          <p style="color: #555;"><strong>${name}</strong> (${email}) has signed up to join <strong>${joinCode.org_name}</strong> as an evaluator.</p>
          <p style="color: #555;">Their evaluator ID is: <strong style="font-family: monospace; background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${evaluatorId}</strong></p>
          <p style="color: #555;">Please log in to approve or deny their access.</p>
          <a href="${dashboardUrl}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #1A6BFF; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
            Review Now →
          </a>
        </div>`
      );
    }

    // Send confirmation to evaluator
    await sendEmail(
      email,
      `Welcome to Athlete Ranker — pending approval`,
      `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #111;">You're almost in!</h2>
        <p style="color: #555;">Hi ${name}, your account has been created and is pending approval from <strong>${joinCode.org_name}</strong>.</p>
        <p style="color: #555;">Your evaluator ID is: <strong style="font-family: monospace; background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${evaluatorId}</strong></p>
        <p style="color: #555;">You'll receive another email once you've been approved.</p>
      </div>`
    );

    return NextResponse.json({
      success: true,
      message: `Account created! Pending approval from ${joinCode.org_name}. You'll be notified by email once approved.`,
      evaluator_id: evaluatorId,
      org_name: joinCode.org_name,
    });

  } catch (error) {
    console.error("Evaluator register error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
