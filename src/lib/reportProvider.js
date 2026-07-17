import sql from "@/lib/db";

// Who earns a report's revenue, and what Sideline Star keeps.
//
// Money model (owner's call): Sideline Star is the merchant of record and sells
// the report. The provider that ran the evals earns a share, remitted
// off-platform. That's a supplier revenue-share, not payment facilitation — so
// the charge lands whole on Sideline Star's account and this module is the
// ledger that says who is owed what.
//
// Stripe Connect is deliberately deferred: today the only provider is the
// owner's own SP, so destination charges would be machinery for paying himself,
// and they'd block purchasing until every provider completed KYC. When a
// third-party SP wants automated payouts, resolveReportProvider() below already
// answers the hard question ("who earned this"); the rest is destination charges.

// Basis points, so the cut is tunable without a deploy. 2500 = 25%.
export const PLATFORM_FEE_BPS = () => {
  const raw = parseInt(process.env.REPORT_PLATFORM_FEE_BPS || "2500", 10);
  // A NaN or out-of-range value must never silently change the platform's cut.
  if (!Number.isFinite(raw) || raw < 0 || raw > 10000) return 2500;
  return raw;
};

// What Sideline Star keeps, in cents. Recorded per sale so a provider statement
// can be reconstructed from the ledger rather than recomputed from a rate that
// may have changed since the sale.
export function platformFeeCents(amountCents, bps = PLATFORM_FEE_BPS()) {
  const fee = Math.round((amountCents * bps) / 10000);
  return Math.max(0, Math.min(fee, amountCents));
}

// What the provider is owed for a sale.
export function providerAmountCents(amountCents, feeCents) {
  const fee = Number.isFinite(feeCents) ? feeCents : platformFeeCents(amountCents);
  return Math.max(0, amountCents - fee);
}

// Resolve the provider for a category.
//   1. An SP linked to the category's association ran the evals → the SP earns.
//   2. Otherwise the association is its own provider.
// Returns { orgId, orgName, orgType, purchasingEnabled, isSelfProvider }, or
// null if the category is gone.
export async function resolveReportProvider(catId) {
  const [cat] = await sql`
    SELECT ac.id, ac.organization_id, o.name AS org_name, o.type AS org_type,
           o.report_purchasing_enabled
    FROM age_categories ac
    JOIN organizations o ON o.id = ac.organization_id
    WHERE ac.id = ${catId}
  `;
  if (!cat) return null;

  // Only a skater service_provider is considered. A goalie_service_provider is a
  // position-scoped mirror and does not earn the skater development report; if
  // that changes, this is the one place to change it.
  const [link] = await sql`
    SELECT sp.id, sp.name, sp.type
    FROM sp_association_links sal
    JOIN organizations sp ON sp.id = sal.service_provider_id AND sp.type = 'service_provider'
    WHERE sal.association_id = ${cat.organization_id} AND sal.status = 'active'
    ORDER BY sal.linked_at DESC
    LIMIT 1
  `;

  // The association's toggle governs purchasing either way — it's their parents
  // being sold to, even when an SP collects the revenue.
  const purchasingEnabled = cat.report_purchasing_enabled !== false;

  if (link) {
    return {
      orgId: link.id, orgName: link.name, orgType: link.type,
      purchasingEnabled, isSelfProvider: false,
    };
  }
  return {
    orgId: cat.organization_id, orgName: cat.org_name, orgType: cat.org_type,
    purchasingEnabled, isSelfProvider: true,
  };
}

// Can a parent buy this report right now? Sideline Star collects every charge on
// its own account, so nothing about the provider's banking blocks a sale — only
// the association's own switch does. (Under Connect this also had to check that
// the provider could receive transfers; without Connect there's no such gate.)
export function isPurchasable(provider) {
  return !!(provider && provider.purchasingEnabled);
}

export function purchaseBlockedReason(provider) {
  if (!provider) return "category_missing";
  if (!provider.purchasingEnabled) return "purchasing_disabled";
  return null;
}
