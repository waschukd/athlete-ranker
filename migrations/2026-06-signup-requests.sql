-- Self-serve signup requests. A prospective independent association submits
-- this public form; a super admin reviews it in God Mode and either denies it
-- or approves it (which provisions their organization + an association_admin
-- account). Self-contained table, so we keep uuid ids via gen_random_uuid()
-- even though some older tables use text ids.
--
-- Apply by piping into psql against the Neon connection string, or pasting
-- into the Neon SQL editor:
--
--   psql "$NEON_DATABASE_URL" -f migrations/2026-06-signup-requests.sql

CREATE TABLE IF NOT EXISTS signup_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_name text NOT NULL,
  contact_name  text,
  email         text NOT NULL,
  phone         text,
  message       text,
  status        text NOT NULL DEFAULT 'pending',
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signup_requests_status_idx ON signup_requests(status);
