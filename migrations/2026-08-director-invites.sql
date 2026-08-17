-- Director invites: same "click a link, set your password" flow as
-- admin_invites/accept-invite, but for the director role, which is scoped
-- to specific age_categories rather than a whole organization. One pending
-- invite per (email, organization) can cover several categories at once
-- (bulk-invite-director assigns many categories in a single email).
CREATE TABLE IF NOT EXISTS director_invites (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           VARCHAR NOT NULL,
  name            VARCHAR,
  category_ids    INTEGER[] NOT NULL,
  token           VARCHAR NOT NULL UNIQUE,
  status          VARCHAR DEFAULT 'pending',
  expires_at      TIMESTAMP NOT NULL,
  accepted_at     TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE (email, organization_id)
);
