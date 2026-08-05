-- Testers who are also evaluators get a SEPARATE testing rate (typically lower than
-- their evaluation rate). Both live on the shared evaluator_memberships row:
--   hourly_rate         → evaluation pay
--   tester_hourly_rate  → testing pay
ALTER TABLE evaluator_memberships ADD COLUMN IF NOT EXISTS tester_hourly_rate numeric;
