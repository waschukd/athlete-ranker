-- Track when a category's families were sent the welcome/onboarding email, so the
-- age-category "first step" flow can make it an explicit stage:
--   add players → welcome families → make groups/teams for session 1.
-- NULL = not yet welcomed.
ALTER TABLE age_categories ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMPTZ;
