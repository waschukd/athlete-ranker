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
