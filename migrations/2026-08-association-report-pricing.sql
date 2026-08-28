-- Lets the SP grant an individual association control over their own
-- Development Report price. Off by default -- nobody can self-serve this;
-- only a grant from the SP dashboard (Associations tab) turns it on. Once
-- granted, the association's own price replaces the platform default, the SP
-- still keeps a flat cut, and the association absorbs a flat per-sale
-- transaction fee. See src/lib/reportProvider.js.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS report_control_granted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS custom_report_price_cents INTEGER;

-- Records what was actually charged to the association on this sale (the
-- flat transaction fee), alongside the existing platform_fee_cents (the SP's
-- flat cut), so a purchase's full split can be reconstructed from the ledger
-- without recomputing it from prices/settings that may have since changed.
ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS association_fee_cents INTEGER;
