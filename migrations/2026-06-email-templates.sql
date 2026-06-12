-- Per-organization overrides for parent-facing email copy (welcome, etc.), so
-- associations whose evaluations run differently can word their own messaging.
-- Body supports {{merge_fields}}. Falls back to the built-in template when no
-- override exists. Idempotent.

CREATE TABLE IF NOT EXISTS email_templates (
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_key    TEXT NOT NULL,
  subject         TEXT,
  body_html       TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (organization_id, template_key)
);
