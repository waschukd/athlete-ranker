-- Tester hours are now auto-computed from their schedule span (blocks of signed-up
-- sessions, floods paid, >60-min breaks unpaid) instead of manually logged. `source`
-- tags rows as 'tester_auto' so the recompute can refresh/clear only its own pending
-- rows and never touch manual or evaluator hours.
ALTER TABLE evaluator_hours ADD COLUMN IF NOT EXISTS source text;
