-- Manual, per-category confirmation that team/roster decisions are actually
-- final -- gates the "Send Reports to Parents" button. Deliberately NOT
-- auto-detected from anything in-app (a groups/scrimmage-teams lock, cut
-- players, etc.): many associations build their real rosters in an entirely
-- separate tool, so this app has no reliable signal for "teams are decided."
-- A timestamp (not a plain boolean) so there's a free audit trail of when it
-- was flipped, matching the existing groups_locked_at / cut_at pattern.
ALTER TABLE age_categories ADD COLUMN IF NOT EXISTS teams_finalized_at TIMESTAMPTZ;
