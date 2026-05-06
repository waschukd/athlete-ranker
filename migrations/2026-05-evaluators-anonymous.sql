-- Adds a per-age-category "keep player names hidden from evaluators" flag.
-- Default TRUE (anonymous) because that's the typical evaluation policy:
-- evaluators score on jersey + team color so identity bias doesn't creep
-- in. Associations can opt out per category if they want names visible.
--
-- Apply by piping into psql against the Neon connection string, or pasting
-- into the Neon SQL editor:
--
--   psql "$NEON_DATABASE_URL" -f migrations/2026-05-evaluators-anonymous.sql

ALTER TABLE age_categories
  ADD COLUMN IF NOT EXISTS evaluators_anonymous BOOLEAN NOT NULL DEFAULT TRUE;
