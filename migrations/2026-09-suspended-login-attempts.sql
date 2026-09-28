-- Real gap found: a suspended user entering the CORRECT password was
-- rejected with no record anywhere -- login_attempts only ever logged wrong
-- password / unknown email. "Did any of them try to log in" had to be
-- inferred from the absence of a 403 in Vercel's runtime logs instead of a
-- direct, queryable fact. Kept separate from login_attempts (which feeds the
-- brute-force rate limiter) so a legitimate correct-password hit on a
-- suspended account never counts toward that threshold.
CREATE TABLE IF NOT EXISTS suspended_login_attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  email TEXT NOT NULL,
  ip TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
