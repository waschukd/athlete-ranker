-- Single events table for product analytics — usage patterns, time-on-task,
-- adoption, retention. NOT for errors (Sentry handles that) and NOT for
-- audit logging (the app's own audit tables handle that).
--
-- No FK constraints on user_id / org_id by design: analytics rows survive
-- the deletion of the user or org they reference, which is the standard
-- analytics-warehousing practice.
--
-- Apply:
--   psql "$NEON_DATABASE_URL" -f migrations/2026-05-analytics-events.sql

CREATE TABLE IF NOT EXISTS analytics_events (
  id           BIGSERIAL PRIMARY KEY,
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id      INT,
  org_id       INT,
  role         TEXT NOT NULL,
  event        TEXT NOT NULL,
  duration_ms  INT,
  metadata     JSONB
);

CREATE INDEX IF NOT EXISTS analytics_events_event_ts_idx ON analytics_events (event, ts DESC);
CREATE INDEX IF NOT EXISTS analytics_events_org_ts_idx   ON analytics_events (org_id, ts DESC);
CREATE INDEX IF NOT EXISTS analytics_events_user_ts_idx  ON analytics_events (user_id, ts DESC);
