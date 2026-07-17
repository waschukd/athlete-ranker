-- Stripe Connect: every $24.99 report is charged on Sideline Star's account as a
-- DESTINATION charge; Sideline Star keeps a 25% application fee and Stripe moves
-- the remainder to the provider's connected account atomically. No manual payout.
--
-- "Provider" = the org that earns a category's report revenue: the SP that ran
-- the evals, else the association acting as its own provider.
--
-- Apply:
--   node scripts/migrate-stripe-connect.mjs            # dry run
--   node scripts/migrate-stripe-connect.mjs --commit   # apply
-- Idempotent.

-- ── organizations: the provider's connected account ──────────────────────────
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;

-- Mirrors the Accounts v2 capability
-- configuration.recipient.capabilities.stripe_balance.stripe_transfers.status
-- === 'active'. Deliberately NOT named charges_enabled: that's the deprecated v1
-- field, and a recipient account never accepts charges — it only receives
-- transfers. Kept in sync by the account webhook; never trusted from the client.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_transfers_active BOOLEAN NOT NULL DEFAULT false;

-- Per-association kill switch for report purchasing.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS report_purchasing_enabled BOOLEAN NOT NULL DEFAULT true;

-- ── report_purchases: audit the split, per Stripe's own numbers ──────────────
-- Written from the webhook (the source of truth), never from the client.
ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS application_fee_cents INTEGER;
ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS provider_org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS destination_account_id TEXT;

CREATE INDEX IF NOT EXISTS report_purchases_provider_idx ON report_purchases (provider_org_id);
CREATE INDEX IF NOT EXISTS organizations_stripe_account_idx ON organizations (stripe_account_id);
