-- Per-evaluator session lock (the deliberate "Save & Close").
-- closed_at NULL = open/editable; set = closed/read-only for that evaluator on
-- that schedule. Reopen (SP or association) sets it back to NULL. Kept separate
-- from `completed` (which other code reads with different meaning). Idempotent.
ALTER TABLE evaluator_session_signups ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE evaluator_session_signups ADD COLUMN IF NOT EXISTS closed_by INTEGER;

-- Documented reason an evaluator has no score for a checked-in athlete at close
-- time: 'absent' or 'injured'. Required by the close flow so every player is
-- either scored or excused. One row per (schedule, evaluator, athlete).
CREATE TABLE IF NOT EXISTS session_excusals (
  id           SERIAL PRIMARY KEY,
  schedule_id  INTEGER NOT NULL,
  evaluator_id INTEGER NOT NULL,
  athlete_id   INTEGER NOT NULL,
  reason       TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (schedule_id, evaluator_id, athlete_id)
);
