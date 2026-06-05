-- Coach & Goalie evaluators: a per-category "kind" for an evaluator.
-- Apply in the Neon SQL editor before/with the feat/coach-goalie-evaluators branch.
-- Idempotent.
--
-- kind:
--   'standard' — normal evaluator; scores count toward the official ranking.
--   'coach'    — scores are tracked but EXCLUDED from the official ranking; shown
--                as a separate parallel "coaches' ranking" for side-by-side compare.
--   'goalie'   — restricted to goalies only (server-side); scores count toward the
--                goalie ranking. For an outside goalie crew.
--
-- A row may be created by EMAIL before the person has an account (invite); user_id
-- is bound on first access. Multiple coaches and multiple goalies per category are
-- supported (just multiple rows).

CREATE TABLE IF NOT EXISTS category_evaluators (
  id              SERIAL PRIMARY KEY,
  age_category_id INTEGER NOT NULL,
  user_id         INTEGER,
  email           TEXT,
  kind            TEXT NOT NULL DEFAULT 'standard',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- One designation per user per category
CREATE UNIQUE INDEX IF NOT EXISTS uq_catev_user
  ON category_evaluators(age_category_id, user_id) WHERE user_id IS NOT NULL;
-- One pending (email-only) designation per email per category
CREATE UNIQUE INDEX IF NOT EXISTS uq_catev_email
  ON category_evaluators(age_category_id, lower(email)) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_catev_cat ON category_evaluators(age_category_id);
