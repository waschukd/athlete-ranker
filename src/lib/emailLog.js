import sql from "@/lib/db";

// Per-recipient delivery log shared by every parent-facing email type (group
// assignment "ice time" emails, welcome/onboarding, paid reports). One table
// so the Resend webhook (/api/webhooks/resend) only has to match by resend_id
// once, regardless of which email type it was. session_number/group_number
// stay null for types that aren't session-scoped (welcome, report).
export async function ensureEmailLogTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS group_email_log (
      id SERIAL PRIMARY KEY,
      age_category_id INTEGER NOT NULL,
      session_number INTEGER,
      group_number INTEGER,
      athlete_id INTEGER,
      athlete_name TEXT,
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
  // Older deployments created this table with session_number NOT NULL and no
  // email_type column, back when it only tracked group-assignment emails.
  await sql`ALTER TABLE group_email_log ALTER COLUMN session_number DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE group_email_log ADD COLUMN IF NOT EXISTS email_type TEXT NOT NULL DEFAULT 'session'`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS group_email_log_cat_type_idx ON group_email_log (age_category_id, email_type)`.catch(() => {});
}

export async function logEmailSend({ catId, emailType, sessionNumber = null, groupNumber = null, athleteId = null, athleteName = null, to, resendId = null, status, error = null }) {
  await sql`
    INSERT INTO group_email_log (age_category_id, email_type, session_number, group_number, athlete_id, athlete_name, recipient_email, resend_id, status, error)
    VALUES (${catId}, ${emailType}, ${sessionNumber}, ${groupNumber}, ${athleteId}, ${athleteName}, ${to}, ${resendId}, ${status}, ${error})
  `;
}

// Flat per-recipient status list for a non-session-scoped email type (welcome,
// report). Best-effort: an uncreated table just reads as no history yet.
export async function getEmailStatuses(catId, emailType) {
  try {
    const statuses = await sql`
      SELECT athlete_id, athlete_name, recipient_email, status, error, updated_at
      FROM group_email_log
      WHERE age_category_id = ${catId} AND email_type = ${emailType}
      ORDER BY updated_at DESC
    `;
    const counts = statuses.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    return { statuses, counts };
  } catch {
    return { statuses: [], counts: {} };
  }
}
