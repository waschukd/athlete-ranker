-- Association "lead" evaluator + admin session-assignment.
--
-- A lead is an evaluator of an association with the authority to manage who
-- evaluates each session for that association — see who's on a session, add
-- someone, or take a spot from someone. Stored as a flag on the existing
-- evaluator_membership rather than a new role string, so the isolation guards
-- and membership queries that already exist keep working unchanged.
--
-- Apply:
--   node scripts/migrate-evaluator-lead.mjs            # dry run
--   node scripts/migrate-evaluator-lead.mjs --commit   # apply
-- Idempotent.

ALTER TABLE evaluator_memberships ADD COLUMN IF NOT EXISTS is_lead BOOLEAN NOT NULL DEFAULT false;

-- Provenance for a signup created by an admin/lead on someone else's behalf, so
-- "assigned by an admin" is distinguishable from a self-signup in the roster and
-- in notifications. Nullable — a normal self-signup leaves it null.
ALTER TABLE evaluator_session_signups ADD COLUMN IF NOT EXISTS assigned_by INTEGER;
ALTER TABLE tester_session_signups    ADD COLUMN IF NOT EXISTS assigned_by INTEGER;
