-- Report revenue ledger — supersedes 2026-07-stripe-connect.sql.
--
-- Model (owner's call, revised): Sideline Star is the merchant of record and
-- sells the report; the provider that ran the evals earns a share, remitted
-- off-platform. That's a supplier revenue-share, not payment facilitation, so
-- Stripe Connect isn't needed — the charge lands whole on Sideline Star's
-- account and the ledger below says who is owed what.
--
-- Connect stays deferred until a third-party SP wants automated payouts. When
-- that day comes, resolveReportProvider() already answers "who earns this", which
-- is the hard part; the rest is destination charges.
--
-- Apply:
--   node scripts/migrate-report-ledger.mjs            # dry run
--   node scripts/migrate-report-ledger.mjs --commit   # apply
-- Idempotent.

-- ── keep: per-association kill switch for report purchasing ──────────────────
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS report_purchasing_enabled BOOLEAN NOT NULL DEFAULT true;

-- ── keep: the ledger. Who earned this sale, and what we kept. ────────────────
-- Written from the webhook (the source of truth), never from the client.
ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS provider_org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER;

CREATE INDEX IF NOT EXISTS report_purchases_provider_idx ON report_purchases (provider_org_id);

-- ── drop: Connect-only columns from the superseded migration ─────────────────
-- Empty (added and never populated). Dropped rather than left dormant: a column
-- named stripe_transfers_active reads like something the paywall gates on, and
-- the next person would wire it up. Re-add them with Connect if it lands.
ALTER TABLE organizations   DROP COLUMN IF EXISTS stripe_account_id;
ALTER TABLE organizations   DROP COLUMN IF EXISTS stripe_transfers_active;
ALTER TABLE report_purchases DROP COLUMN IF EXISTS destination_account_id;
-- application_fee_cents was Stripe's term for a Connect fee. Without Connect
-- there is no application fee — only our own cut. Renamed, not duplicated.
ALTER TABLE report_purchases DROP COLUMN IF EXISTS application_fee_cents;
DROP INDEX IF EXISTS organizations_stripe_account_idx;
