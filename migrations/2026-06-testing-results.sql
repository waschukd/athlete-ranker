-- Per-test SportTesting results (skating times, agility, transitions, etc.).
-- We already store an overall testing RANK in testing_drill_results (used for
-- ranking); this table keeps the individual test VALUES we were previously
-- discarding on import, so the parent report can show "best per test vs group
-- average / group best". One row per athlete, per test, per session.
--
-- Values are stored as-is from the SportTesting export (times in seconds,
-- lower = better for every current test). test_rank is the per-test rank that
-- sits next to each value in the raw file. Idempotent.

CREATE TABLE IF NOT EXISTS testing_results (
  id SERIAL PRIMARY KEY,
  athlete_id      INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  age_category_id INTEGER NOT NULL REFERENCES age_categories(id) ON DELETE CASCADE,
  session_number  INTEGER NOT NULL,
  test_name       TEXT    NOT NULL,
  value           NUMERIC(9,3),
  test_rank       INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (athlete_id, age_category_id, session_number, test_name)
);

CREATE INDEX IF NOT EXISTS idx_testing_results_cat
  ON testing_results (age_category_id, session_number, test_name);
