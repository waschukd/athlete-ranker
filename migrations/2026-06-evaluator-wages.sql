-- Evaluator wages: an hourly rate per evaluator, per organization (so the same
-- person can have different rates with different SPs). Pay = approved hours × rate.
-- Apply in the Neon SQL editor with the feat/evaluator-wages branch. Idempotent.
--
-- evaluator_hours.status already supports 'pending' | 'approved' | 'paid', so no
-- change is needed there — this just adds the rate.

ALTER TABLE evaluator_memberships ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(8,2);
