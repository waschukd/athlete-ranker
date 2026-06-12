-- Flat per-note bonus paid to evaluators whose written notes appear in a SOLD
-- parent report. The rate is set per Service-Provider org; the eligible-note
-- count is computed live from player_notes that intersect a completed
-- report_purchase, so it stays correct as reports get bought over time.
-- Idempotent.

CREATE TABLE IF NOT EXISTS report_bonus_config (
  organization_id  INTEGER PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  note_bonus_cents INTEGER NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Speeds the "is this note's athlete+category in a sold report" lookup.
CREATE INDEX IF NOT EXISTS idx_report_purchases_sold
  ON report_purchases (athlete_id, age_category_id)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_player_notes_evaluator
  ON player_notes (evaluator_id);
