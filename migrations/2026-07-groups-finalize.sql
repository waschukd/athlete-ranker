-- Track the system's original (auto-assigned) group per player so the groups
-- page can show "changes you made", and a per-session lock so directors can
-- confirm/finalize groups before sending them to parents.
ALTER TABLE player_group_assignments ADD COLUMN IF NOT EXISTS auto_group_number INT;
ALTER TABLE category_sessions ADD COLUMN IF NOT EXISTS groups_locked_at TIMESTAMPTZ;
