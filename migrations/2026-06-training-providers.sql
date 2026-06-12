-- Association-curated local training providers shown in the parent report's
-- "Where to put in the work" section, grouped by development area (Skating,
-- Puck Skills, etc.). Curated per organization (association); the report only
-- renders them when present. Idempotent.

CREATE TABLE IF NOT EXISTS training_providers (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  area            TEXT NOT NULL,
  name            TEXT NOT NULL,
  blurb           TEXT,
  contact         TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_providers_org
  ON training_providers (organization_id, area, sort_order, id);
