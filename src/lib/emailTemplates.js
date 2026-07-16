import sql from "@/lib/db";
import { DEFAULT_TEMPLATES, renderTemplate } from "@/lib/emailTemplateDefaults";

// Re-exported so existing server callers keep importing from one place, and so
// the wording lives in exactly one module (emailTemplateDefaults, client-safe).
export { renderTemplate, DEFAULT_TEMPLATES };

// Per-org email copy overrides. Returns null when not set (caller falls back to
// the built-in template). Safe if the table isn't migrated yet.
export async function getEmailTemplate(orgId, key) {
  if (!orgId) return null;
  try {
    const r = await sql`SELECT subject, body_html FROM email_templates WHERE organization_id = ${orgId} AND template_key = ${key}`;
    return r.length ? r[0] : null;
  } catch { return null; }
}

// The org's override if they've written one, otherwise the built-in wording.
// isDefault lets the editor show "you're looking at the default" vs "your copy".
export async function resolveTemplate(orgId, key) {
  const base = DEFAULT_TEMPLATES[key] || { subject: "", body: "" };
  const override = await getEmailTemplate(orgId, key);
  const hasOverride = !!(override && (override.subject || override.body_html));
  return {
    subject: (hasOverride && override.subject) || base.subject || "",
    body: (hasOverride && override.body_html) || base.body || "",
    isDefault: !hasOverride,
  };
}

export async function setEmailTemplate(orgId, key, subject, bodyHtml) {
  await sql`
    CREATE TABLE IF NOT EXISTS email_templates (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      subject TEXT,
      body_html TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (organization_id, template_key)
    )
  `;
  await sql`
    INSERT INTO email_templates (organization_id, template_key, subject, body_html, updated_at)
    VALUES (${orgId}, ${key}, ${subject}, ${bodyHtml}, NOW())
    ON CONFLICT (organization_id, template_key) DO UPDATE
      SET subject = EXCLUDED.subject, body_html = EXCLUDED.body_html, updated_at = NOW()
  `;
}

// Clearing an override drops the row so resolveTemplate falls back to default.
export async function clearEmailTemplate(orgId, key) {
  try {
    await sql`DELETE FROM email_templates WHERE organization_id = ${orgId} AND template_key = ${key}`;
  } catch { /* table may not exist yet — nothing to clear */ }
}
