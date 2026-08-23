-- Tournament-only setting: carry a player's jersey number forward from one
-- session's check-in to the next (pre-filled, still editable) instead of
-- starting blank every session. Off by default; not every association wants
-- it, so it's opt-in per category like identify_by_helmet.
ALTER TABLE age_categories ADD COLUMN IF NOT EXISTS sticky_jersey_numbers boolean DEFAULT false;
