import sql from "@/lib/db";

// Who earns a category's report revenue, and can they actually be paid?
//
// Money model (owner's call): every charge lands on Sideline Star's Stripe
// account as a DESTINATION charge. Sideline Star keeps an application fee; the
// remainder transfers to the provider's connected account atomically. The
// SP↔association split is off-platform — the system only does
// platform-cut → provider-payout, never a 3-way split.

// Basis points, so the cut is tunable without a deploy. 2500 = 25%.
export const PLATFORM_FEE_BPS = () => {
  const raw = parseInt(process.env.REPORT_PLATFORM_FEE_BPS || "2500", 10);
  // A NaN or out-of-range value must never silently become a 0% or >100% fee.
  if (!Number.isFinite(raw) || raw < 0 || raw > 10000) return 2500;
  return raw;
};

// Fee in cents. Rounded, and clamped below the charge — Stripe rejects an
// application fee that meets or exceeds the amount, and a 100% fee would leave
// the provider nothing.
export function platformFeeCents(amountCents, bps = PLATFORM_FEE_BPS()) {
  const fee = Math.round((amountCents * bps) / 10000);
  return Math.max(0, Math.min(fee, amountCents - 1));
}

// Resolve the provider for a category.
//   1. An SP linked to the category's association runs the evals → the SP earns.
//   2. Otherwise the association is its own provider.
// Returns { orgId, orgName, orgType, stripeAccountId, transfersActive,
//           purchasingEnabled, isSelfProvider }, or null if the category is gone.
export async function resolveReportProvider(catId) {
  const [cat] = await sql`
    SELECT ac.id, ac.organization_id, o.name AS org_name, o.type AS org_type,
           o.stripe_account_id, o.stripe_transfers_active, o.report_purchasing_enabled
    FROM age_categories ac
    JOIN organizations o ON o.id = ac.organization_id
    WHERE ac.id = ${catId}
  `;
  if (!cat) return null;

  // Only a skater service_provider is considered. A goalie_service_provider is a
  // position-scoped mirror and does not earn the skater development report; if
  // that changes, this is the one place to change it.
  const [link] = await sql`
    SELECT sp.id, sp.name, sp.type, sp.stripe_account_id, sp.stripe_transfers_active
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
      orgId: link.id,
      orgName: link.name,
      orgType: link.type,
      stripeAccountId: link.stripe_account_id || null,
      transfersActive: link.stripe_transfers_active === true,
      purchasingEnabled,
      isSelfProvider: false,
    };
  }

  return {
    orgId: cat.organization_id,
    orgName: cat.org_name,
    orgType: cat.org_type,
    stripeAccountId: cat.stripe_account_id || null,
    transfersActive: cat.stripe_transfers_active === true,
    purchasingEnabled,
    isSelfProvider: true,
  };
}

// Can a parent actually buy this report right now?
// Both halves matter: a provider who hasn't finished Stripe onboarding cannot
// receive the transfer, so the charge would fail or strand funds on the platform.
export function isPurchasable(provider) {
  return !!(provider && provider.purchasingEnabled && provider.stripeAccountId && provider.transfersActive);
}

// Why not — for the admin UI and a friendly parent-facing message.
export function purchaseBlockedReason(provider) {
  if (!provider) return "category_missing";
  if (!provider.purchasingEnabled) return "purchasing_disabled";
  if (!provider.stripeAccountId) return "provider_not_onboarded";
  if (!provider.transfersActive) return "provider_onboarding_incomplete";
  return null;
}
