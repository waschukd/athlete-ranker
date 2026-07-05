import { NextResponse } from "next/server";
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

// Public lookup so the signup page can tailor wording. Handles a per-invite token
// (a direct SP invite — pre-authorized, no code) OR a shared join code (self-serve).
export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const invite = params.get("invite");
    if (invite) {
      const rows = await sql`
        SELECT ei.email, ei.role, o.name as org_name
        FROM evaluator_invitations ei JOIN organizations o ON o.id = ei.organization_id
        WHERE ei.invite_token = ${invite} AND ei.status = 'pending'
          AND (ei.expires_at IS NULL OR ei.expires_at > NOW())`;
      if (!rows.length) return NextResponse.json({ valid: false });
      return NextResponse.json({ valid: true, invited: true, email: rows[0].email, org_name: rows[0].org_name, role: rows[0].role, is_tester: rows[0].role === "service_provider_tester" });
    }
    const code = params.get("code");
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
    const { allowed } = await checkAndRecord({ endpoint: "evaluator_register", identifier: clientIp(request), max: 8, windowMins: 60 });
    if (!allowed) return NextResponse.json({ error: "Too many attempts, please wait a moment." }, { status: 429 });

    const { name, email: bodyEmail, password, code, invite } = await request.json();
    if (!name || !password) return NextResponse.json({ error: "Name and password required" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

    // Resolve org + role + email + whether this is a pre-authorized invite.
    let orgId, orgType, orgName, role, email, viaInvite = false, invitationId = null, joinCodeId = null;

    if (invite) {
      const inv = await sql`
        SELECT ei.*, o.name as org_name, o.type as org_type
        FROM evaluator_invitations ei JOIN organizations o ON o.id = ei.organization_id
        WHERE ei.invite_token = ${invite} AND ei.status = 'pending'
          AND (ei.expires_at IS NULL OR ei.expires_at > NOW())`;
      if (!inv.length) return NextResponse.json({ error: "This invitation is invalid or has expired. Ask your organization to re-send it." }, { status: 400 });
      const i = inv[0];
      orgId = i.organization_id; orgType = i.org_type; orgName = i.org_name;
      role = i.role || (orgType === "service_provider" ? "service_provider_evaluator" : "association_evaluator");
      email = i.email;          // locked to the invited address
      viaInvite = true; invitationId = i.id;
    } else {
      if (!code || !bodyEmail) return NextResponse.json({ error: "A join code and email are required" }, { status: 400 });
      email = bodyEmail;
      const jc = await sql`
        SELECT ejc.*, o.name as org_name, o.type as org_type, o.id as org_id
        FROM evaluator_join_codes ejc JOIN organizations o ON o.id = ejc.organization_id
        WHERE UPPER(ejc.code) = UPPER(${code.trim()})
          AND (ejc.expires_at IS NULL OR ejc.expires_at > NOW()) AND ejc.uses < ejc.max_uses`;
      if (!jc.length) return NextResponse.json({ error: "Invalid or expired join code. Contact your organization for a valid code." }, { status: 400 });
      orgId = jc[0].org_id; orgType = jc[0].org_type; orgName = jc[0].org_name; joinCodeId = jc[0].id;
      role = jc[0].role === "service_provider_tester" ? "service_provider_tester"
        : orgType === "service_provider" ? "service_provider_evaluator" : "association_evaluator";
    }

    const isTester = role === "service_provider_tester";
    const noun = isTester ? "tester" : "evaluator";

    // Account must not already exist.
    const existing = await sql`SELECT id FROM auth_users WHERE email = ${email}`;
    if (existing.length) return NextResponse.json({ error: "An account with this email already exists. Just sign in." }, { status: 400 });

    // Unique evaluator id.
    let evaluatorId = generateEvaluatorId(), attempts = 0;
    while (attempts < 10) { const taken = await sql`SELECT id FROM users WHERE evaluator_id = ${evaluatorId}`; if (!taken.length) break; evaluatorId = generateEvaluatorId(); attempts++; }

    const [authUser] = await sql`INSERT INTO auth_users (email, name, "emailVerified") VALUES (${email}, ${name}, NOW()) RETURNING *`;
    await sql`INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password) VALUES (${authUser.id}, 'credentials', 'credentials', ${email}, ${await hashPassword(password)})`;
    const [appUser] = await sql`INSERT INTO users (email, name, role, evaluator_id) VALUES (${email}, ${name}, ${role}, ${evaluatorId}) RETURNING *`;

    // Invited → ACTIVE immediately (the SP already chose them). Code → PENDING approval.
    const status = viaInvite ? "active" : "pending";
    await sql`
      INSERT INTO evaluator_memberships (user_id, organization_id, role, status, joined_via, pending, is_tester, is_evaluator)
      VALUES (${appUser.id}, ${orgId}, ${role}, ${status}, ${viaInvite ? "invite" : "join_code"}, ${!viaInvite}, ${isTester}, ${!isTester})
      ON CONFLICT (user_id, organization_id) DO UPDATE SET
        status = CASE WHEN ${viaInvite} OR evaluator_memberships.status = 'active' THEN 'active' ELSE 'pending' END,
        pending = CASE WHEN ${viaInvite} OR evaluator_memberships.status = 'active' THEN false ELSE true END,
        is_tester = evaluator_memberships.is_tester OR EXCLUDED.is_tester,
        is_evaluator = evaluator_memberships.is_evaluator OR EXCLUDED.is_evaluator`;

    if (viaInvite) {
      await sql`UPDATE evaluator_invitations SET status = 'accepted', accepted_at = NOW() WHERE id = ${invitationId}`;
      await sendEmail(email, `You're in — welcome to ${orgName}`,
        `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color:#111;">You're all set!</h2>
          <p style="color:#555;">Hi ${name}, your ${noun} account with <strong>${orgName}</strong> is active — no approval needed since you were invited directly.</p>
          <p style="color:#555;">Sign in to start signing up for ${isTester ? "testing" : "evaluation"} sessions.</p>
          <a href="${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/account/signin" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#0b5cd6;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Sign In →</a>
        </div>`);
      return NextResponse.json({ success: true, active: true, is_tester: isTester, evaluator_id: evaluatorId, org_name: orgName,
        message: `You're in! Your ${noun} account with ${orgName} is active — sign in to get started.` });
    }

    // Self-serve (code) → pending approval: increment code, notify admins.
    await sql`UPDATE evaluator_join_codes SET uses = uses + 1 WHERE id = ${joinCodeId}`;
    const admins = await sql`
      SELECT DISTINCT u.email, u.name FROM users u WHERE u.email IN (
        SELECT contact_email FROM organizations WHERE id = ${orgId}
        UNION
        SELECT o.contact_email FROM organizations o JOIN sp_association_links sal ON sal.service_provider_id = o.id WHERE sal.association_id = ${orgId})`;
    const dashboardUrl = orgType === "service_provider"
      ? `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/service-provider/dashboard`
      : `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/association/dashboard?org=${orgId}`;
    for (const admin of admins) {
      await sendEmail(admin.email, `New ${noun} pending approval — ${name}`,
        `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color:#111;">New ${noun} signup</h2>
          <p style="color:#555;"><strong>${name}</strong> (${email}) has signed up to join <strong>${orgName}</strong> as a ${noun}.</p>
          <p style="color:#555;">Their ID is: <strong style="font-family: monospace; background:#f0f0f0; padding:2px 6px; border-radius:4px;">${evaluatorId}</strong></p>
          <p style="color:#555;">Please log in to approve or deny their access.</p>
          <a href="${dashboardUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#0b5cd6;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Review Now →</a>
        </div>`);
    }
    await sendEmail(email, `Welcome to Sideline Star — pending approval`,
      `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color:#111;">You're almost in!</h2>
        <p style="color:#555;">Hi ${name}, your ${noun} account has been created and is pending approval from <strong>${orgName}</strong>.</p>
        <p style="color:#555;">Your ID is: <strong style="font-family: monospace; background:#f0f0f0; padding:2px 6px; border-radius:4px;">${evaluatorId}</strong></p>
        <p style="color:#555;">You'll receive another email once you've been approved.</p>
      </div>`);

    return NextResponse.json({ success: true, is_tester: isTester, evaluator_id: evaluatorId, org_name: orgName,
      message: `Account created! Pending approval from ${orgName}. You'll be notified by email once approved.` });
  } catch (error) {
    console.error("Evaluator register error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
