-- Per-SP colour for an association on the SP master schedule, so an SP can pick
-- distinct colours instead of relying on the auto palette (which collides).
ALTER TABLE sp_association_links ADD COLUMN IF NOT EXISTS schedule_color TEXT;
