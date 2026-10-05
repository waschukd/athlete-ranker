-- End-of-season feedback surveys for association admins and evaluators.
-- One row per invite: created when the link is sent (submitted_at NULL until
-- the person answers). Token is the only credential -- no account needed.
CREATE TABLE IF NOT EXISTS feedback_responses (
  id SERIAL PRIMARY KEY,
  audience TEXT NOT NULL CHECK (audience IN ('association_admin', 'evaluator')),
  user_id INTEGER REFERENCES users(id),
  organization_id INTEGER REFERENCES organizations(id),
  email TEXT NOT NULL,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  answers JSONB,
  comments TEXT,
  sent_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
