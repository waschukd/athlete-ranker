import sql from "@/lib/db";

// Per-recipient delivery log shared by every email type sent anywhere on the
// site (group assignment "ice time" emails, welcome/onboarding, paid reports,
// staff messages, invites...). One table so the Resend webhook
// (/api/webhooks/resend) only has to match by resend_id once, regardless of
// which email type it was. age_category_id/session_number/group_number stay
// null for types that aren't category- or session-scoped (staff messages,
// org-level invites) -- those instead carry organization_id and/or
// recipient_user_id.
export async function ensureEmailLogTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS group_email_log (
      id SERIAL PRIMARY KEY,
      age_category_id INTEGER,
      organization_id INTEGER,
      session_number INTEGER,
      group_number INTEGER,
      athlete_id INTEGER,
      athlete_name TEXT,
      recipient_user_id INTEGER,
      recipient_email TEXT NOT NULL,
      resend_id TEXT,
      status TEXT NOT NULL DEFAULT 'sent',
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS group_email_log_resend_idx ON group_email_log (resend_id)`;
  await sql`CREATE INDEX IF NOT EXISTS group_email_log_cat_sess_idx ON group_email_log (age_category_id, session_number)`;
  // Older deployments created this table with session_number/age_category_id
  // NOT NULL and no email_type/organization_id/recipient_user_id columns, back
  // when it only tracked group-assignment emails.
  await sql`ALTER TABLE group_email_log ALTER COLUMN session_number DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE group_email_log ALTER COLUMN age_category_id DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE group_email_log ADD COLUMN IF NOT EXISTS email_type TEXT NOT NULL DEFAULT 'session'`.catch(() => {});
  await sql`ALTER TABLE group_email_log ADD COLUMN IF NOT EXISTS organization_id INTEGER`.catch(() => {});
  await sql`ALTER TABLE group_email_log ADD COLUMN IF NOT EXISTS recipient_user_id INTEGER`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS group_email_log_cat_type_idx ON group_email_log (age_category_id, email_type)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS group_email_log_org_type_idx ON group_email_log (organization_id, email_type)`.catch(() => {});
}

export async function logEmailSend({ catId = null, orgId = null, emailType, sessionNumber = null, groupNumber = null, athleteId = null, athleteName = null, recipientUserId = null, to, resendId = null, status, error = null }) {
  await sql`
    INSERT INTO group_email_log (age_category_id, organization_id, email_type, session_number, group_number, athlete_id, athlete_name, recipient_user_id, recipient_email, resend_id, status, error)
    VALUES (${catId}, ${orgId}, ${emailType}, ${sessionNumber}, ${groupNumber}, ${athleteId}, ${athleteName}, ${recipientUserId}, ${to}, ${resendId}, ${status}, ${error})
  `;
}

// Flat per-recipient status list for a non-session-scoped email type (welcome,
// report, staff message...). Scope by category OR by organization depending
// on what the email type is keyed on. Best-effort: an uncreated table just
// reads as no history yet.
export async function getEmailStatuses({ catId = null, orgId = null, emailType }) {
  try {
    const statuses = catId
      ? await sql`
          SELECT athlete_id, athlete_name, recipient_user_id, recipient_email, status, error, updated_at
          FROM group_email_log
          WHERE age_category_id = ${catId} AND email_type = ${emailType}
          ORDER BY updated_at DESC
        `
      : await sql`
          SELECT athlete_id, athlete_name, recipient_user_id, recipient_email, status, error, updated_at
          FROM group_email_log
          WHERE organization_id = ${orgId} AND email_type = ${emailType}
          ORDER BY updated_at DESC
        `;
    const counts = statuses.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    return { statuses, counts };
  } catch {
    return { statuses: [], counts: {} };
  }
}
