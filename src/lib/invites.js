import { randomBytes } from "node:crypto";
import sql from "@/lib/db";
import { emailOrgInvite } from "@/lib/email";

// Single source of truth for "invite someone to manage an org" — used by both the
// org-create flow (SP New Client / God Mode) and the standalone Invite-Admin action.
// Creates/refreshes a pending admin_invites token, emails the /accept-invite link
// (where the invitee sets their own password — no temp password), and returns the
// delivery status plus the URL so the caller can show a copyable fallback if email
// is not configured or fails.
export async function createAndSendOrgInvite({ organizationId, email, name, orgName, orgType }) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await sql`
    INSERT INTO admin_invites (organization_id, email, name, token, expires_at, status)
    VALUES (${organizationId}, ${email}, ${name || null}, ${token}, ${expiresAt}, 'pending')
    ON CONFLICT (email, organization_id) DO UPDATE SET
      token = ${token}, expires_at = ${expiresAt}, status = 'pending', created_at = NOW()
  `;

  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";
  const url = `${base}/accept-invite?token=${token}`;

  const result = await emailOrgInvite({ name, email, orgName, orgType, inviteUrl: url });

  return {
    sent: !!result?.ok,
    url,
    message: result?.ok
      ? `Invite sent to ${email}`
      : result?.skipped
        ? "Email isn't configured — copy the invite link below to share it manually."
        : `Couldn't send the email (${result?.error || "unknown error"}) — copy the invite link below to share it manually.`,
  };
}
