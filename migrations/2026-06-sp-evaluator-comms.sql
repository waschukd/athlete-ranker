-- SP ↔ Evaluator communication features
-- Apply in the Neon SQL editor before/with deploying the feat/sp-evaluator-comms branch.
-- All statements are idempotent (safe to re-run).

-- 1) Cancellation reason: optional free-text an evaluator gives when cancelling a session.
ALTER TABLE evaluator_session_signups ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- 2) Availability / blackout windows: dates an evaluator marks themselves unavailable.
CREATE TABLE IF NOT EXISTS evaluator_unavailability (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_unavail_user ON evaluator_unavailability(user_id);

-- 3) Direct messages (two-way: SP→evaluator and evaluator→SP). Broadcasts are
--    stored as one row per recipient so read-state is per person.
CREATE TABLE IF NOT EXISTS messages (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER,            -- context org (the SP, usually)
  from_user_id    INTEGER,
  from_name       TEXT,
  to_user_id      INTEGER NOT NULL,
  subject         TEXT,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  read_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_user_id);

-- 4) In-app notification center.
CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  type        TEXT,                   -- 'message' | 'application' | 'session' | ...
  title       TEXT,
  body        TEXT,
  link        TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);
