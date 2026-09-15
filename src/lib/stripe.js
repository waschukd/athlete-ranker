import Stripe from "stripe";

// One place to construct the client, so every route agrees on the API version
// and the "is Stripe even configured?" answer.
//
// Pinned deliberately: Stripe ships breaking changes behind version dates, and
// an unpinned client silently follows the account's default, which can move
// under us.
export const STRIPE_API_VERSION = "2026-06-24.dahlia";

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
}

// Flat 5% GST, no address collection. Every report sale happens through an
// Alberta association/service provider (Competitive Thread) -- there's no
// multi-jurisdiction tax question to solve here, so Stripe Tax's automatic
// address-based calculation (and the billing address prompt it requires) is
// unnecessary friction for what's always the same flat rate. Looked up by
// name rather than a hardcoded ID so this works against whichever Stripe
// account STRIPE_SECRET_KEY points at, live or test, without a manual setup
// step; created once and reused after that.
let cachedGstTaxRateId = null;
export async function getGstTaxRate(stripe) {
  if (cachedGstTaxRateId) return cachedGstTaxRateId;
  const existing = await stripe.taxRates.list({ active: true, limit: 100 });
  const found = existing.data.find(r => r.display_name === "GST" && r.percentage === 5 && !r.inclusive);
  if (found) { cachedGstTaxRateId = found.id; return found.id; }
  const created = await stripe.taxRates.create({
    display_name: "GST",
    percentage: 5,
    inclusive: false,
    country: "CA",
    description: "GST (5%) — Alberta",
  });
  cachedGstTaxRateId = created.id;
  return created.id;
}
