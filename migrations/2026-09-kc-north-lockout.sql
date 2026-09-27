-- KC North dispute (2026-09-27): the association refused to share player
-- reports and is running its own competing report/fee process. Per Dan,
-- every KC North admin/director is suspended and shown a specific message
-- instead of a generic "account suspended" -- and Tyler Hennessey (Dan's CT
-- co-admin) is specifically blocked from KC North only, everywhere else on
-- his account untouched.

-- Reused for any future suspension that needs to explain itself, not just
-- this one -- generic column, KC-North-specific data.
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_message TEXT;

-- Per-(user, organization) access block for a service_provider_admin who
-- would otherwise reach that organization via sp_association_links --
-- narrower than suspending the user (which would cut off every OTHER
-- association they touch too). See authorizeCategoryAccess in
-- src/lib/authorize.js for where this is enforced.
CREATE TABLE IF NOT EXISTS sp_access_restrictions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  message TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, organization_id)
);
