-- Backs checkAndRecord() (src/lib/rateLimit.js) and the forgot/reset-password
-- routes' own rate limiting. Referenced since ~June but never actually
-- migrated -- every consumer has been failing open (no throttling at all)
-- because this table didn't exist.
CREATE TABLE IF NOT EXISTS auth_rate_limit (
  id           SERIAL PRIMARY KEY,
  endpoint     TEXT NOT NULL,
  ip           TEXT NOT NULL,
  email        TEXT,
  attempted_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_endpoint_ip ON auth_rate_limit (endpoint, ip, attempted_at);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_endpoint_email ON auth_rate_limit (endpoint, email, attempted_at) WHERE email IS NOT NULL;
