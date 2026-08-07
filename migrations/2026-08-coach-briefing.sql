-- Cached AI-generated coach's briefing per team, so the emailed coach link
-- shows the full narrative without regenerating (and without exposing the
-- Anthropic call to unauthenticated coach viewers). Idempotent.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS coach_briefing TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS coach_briefing_at TIMESTAMPTZ;
