-- Marks a report_purchases row as a real Stripe charge that was never a real
-- sale — Dan buying his own report to smoke-test the purchase flow before an
-- association has released reports (first real case: EFHA, purchase id 11,
-- 2026-09-15). Distinct from a $0 comp grant (see amount_cents > 0 in the
-- report_sales queries) — a test purchase is a real charge, just not a real
-- customer, so it needs its own flag rather than reusing amount_cents.
--
-- Apply:
--   node scripts/migrate-report-purchase-test-flag.mjs            # dry run
--   node scripts/migrate-report-purchase-test-flag.mjs --commit   # apply
-- Idempotent.

ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
