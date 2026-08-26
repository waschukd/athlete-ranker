import { randomBytes } from "node:crypto";
import sql from "@/lib/db";
import { emailOrgInvite, emailDirectorInvite } from "@/lib/email";
import { ensureEmailLogTable, logEmailSend } from "@/lib/emailLog";

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
  await ensureEmailLogTable();
  await logEmailSend({
    orgId: organizationId, emailType: "org_admin_invite", athleteName: name, to: email,
    resendId: result?.id || null, status: result?.ok ? "sent" : "failed",
    error: result?.ok ? null : (result?.error || "send failed").toString().slice(0, 500),
  });

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

// Same pattern for directors, who are scoped to specific age_categories rather
// than a whole org -- one pending invite per (email, org) accumulates categories
// across re-invites (e.g. single-category invite-director called twice, or
// followed by a bulk invite) rather than losing whichever set wasn't most recent.
export async function createAndSendDirectorInvite({ organizationId, email, name, orgName, categories }) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const categoryIds = categories.map(c => c.id);

  const [row] = await sql`
    INSERT INTO director_invites (organization_id, email, name, category_ids, token, expires_at, status)
    VALUES (${organizationId}, ${email}, ${name || null}, ${categoryIds}, ${token}, ${expiresAt}, 'pending')
    ON CONFLICT (email, organization_id) DO UPDATE SET
      name = ${name || null},
      category_ids = ARRAY(SELECT DISTINCT unnest(director_invites.category_ids || ${categoryIds}::int[])),
      token = ${token}, expires_at = ${expiresAt}, status = 'pending', created_at = NOW()
    RETURNING category_ids
  `;

  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";
  const url = `${base}/director/accept-invite?token=${token}`;

  // Merged category_ids can include ones from an earlier, still-pending
  // invite that this call didn't pass in -- fetch their names so the email
  // (and accept-invite page) lists everything the link will actually grant.
  const mergedIds = row.category_ids;
  const cats = mergedIds.length === categoryIds.length && mergedIds.every(id => categoryIds.includes(id))
    ? categories
    : await sql`SELECT id, name FROM age_categories WHERE id = ANY(${mergedIds})`;

  const result = await emailDirectorInvite({ name, email, orgName, categoryNames: cats.map(c => c.name), inviteUrl: url });
  await ensureEmailLogTable();
  await logEmailSend({
    orgId: organizationId, catId: categoryIds[0] || null, emailType: "director_invite", athleteName: name, to: email,
    resendId: result?.id || null, status: result?.ok ? "sent" : "failed",
    error: result?.ok ? null : (result?.error || "send failed").toString().slice(0, 500),
  });

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
