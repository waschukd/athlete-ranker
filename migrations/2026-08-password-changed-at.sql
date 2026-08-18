-- Lets getSession() invalidate JWTs issued before a password reset. Sessions
-- are stateless (7-day JWT, no server-side store), so a reset previously left
-- any already-issued token valid until its natural expiry.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;
