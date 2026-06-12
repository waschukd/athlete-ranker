import sql from "@/lib/db";

// Per-org email copy overrides. Returns null when not set (caller falls back to
// the built-in template). Safe if the table isn't migrated yet.
export async function getEmailTemplate(orgId, key) {
  if (!orgId) return null;
  try {
    const r = await sql`SELECT subject, body_html FROM email_templates WHERE organization_id = ${orgId} AND template_key = ${key}`;
    return r.length ? r[0] : null;
  } catch { return null; }
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

// {{player_name}} / {{ org_name }} style merge. Unknown fields become "".
export function renderTemplate(str, vars) {
  return (str || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
}

// Merge fields available to association-authored templates.
export const TEMPLATE_FIELDS = {
  welcome: ["player_name", "org_name", "category_name", "sp_name"],
};
