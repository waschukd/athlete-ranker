import Stripe from "stripe";

// One place to construct the client, so every route agrees on the API version
// and the "is Stripe even configured?" answer.
//
// Pinned deliberately: Stripe ships breaking changes behind version dates, and
// an unpinned client silently follows the account's default, which can move
// under us. Accounts v2 requires a recent version.
export const STRIPE_API_VERSION = "2026-06-24.dahlia";

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
}

// Fields to hydrate on an Accounts v2 fetch. The capability lives under
// configuration.recipient and isn't returned unless asked for.
export const ACCOUNT_INCLUDE = ["configuration.recipient", "requirements", "identity"];

// "Can this connected account receive transfers?" — the v2 capability path.
//
// Do NOT substitute the deprecated v1 `charges_enabled` / `payouts_enabled`.
// A marketplace recipient never accepts charges (the platform does), so
// charges_enabled is false on a perfectly healthy provider and gating on it
// would block every payout.
export function transfersActive(account) {
  return account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === "active";
}
