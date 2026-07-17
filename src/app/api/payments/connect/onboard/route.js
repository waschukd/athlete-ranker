// "Set up payouts" for a provider org — Stripe Connect onboarding.
//
// Accounts v2 (POST /v2/core/accounts), NOT the legacy `type: 'express'` — that
// v1 pattern is deprecated. Under v2, "express" is a DASHBOARD dimension, not an
// account type.
//
// Sideline Star is a marketplace: we run checkout and take a cut, so the
// connected account is a RECIPIENT (it only receives transfers, never charges
// cards), and the platform collects both fees and losses. `losses_collector:
// 'application'` isn't a preference — Stripe rejects an express dashboard
// combined with losses_collector 'stripe', and destination charges require the
// platform to own transfer reversals during disputes.
//
// GET  → current onboarding status for the org
// POST → create/lookup the account and return a hosted onboarding link
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import { getStripe, stripeConfigured, transfersActive, ACCOUNT_INCLUDE } from "@/lib/stripe";

// Only an admin of the org (or God) may attach a bank account to it.
const ADMIN_ROLES = new Set([
  "super_admin", "association_admin", "service_provider_admin", "goalie_service_provider_admin",
]);

async function loadOrg(orgId) {
  const [org] = await sql`
    SELECT id, name, type, contact_email, stripe_account_id, stripe_transfers_active
    FROM organizations WHERE id = ${orgId}`;
  return org || null;
}

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgId = new URL(request.url).searchParams.get("org");
    if (!orgId) return NextResponse.json({ error: "org required" }, { status: 400 });
    const auth = await authorizeOrgAccess(session, orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const org = await loadOrg(orgId);
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!org.stripe_account_id) {
      return NextResponse.json({ onboarded: false, transfersActive: false, accountId: null });
    }
    if (!stripeConfigured()) {
      // Report what we last heard from the webhook rather than pretending.
      return NextResponse.json({
        onboarded: true, transfersActive: org.stripe_transfers_active === true,
        accountId: org.stripe_account_id, stale: true,
      });
    }

    // Re-check with Stripe rather than trusting our mirror — a webhook can be
    // missed, and this is the screen an admin stares at while onboarding.
    const stripe = getStripe();
    const account = await stripe.v2.core.accounts.retrieve(org.stripe_account_id, { include: ACCOUNT_INCLUDE });
    const active = transfersActive(account);
    if (active !== (org.stripe_transfers_active === true)) {
      await sql`UPDATE organizations SET stripe_transfers_active = ${active} WHERE id = ${orgId}`;
    }
    return NextResponse.json({
      onboarded: true,
      transfersActive: active,
      accountId: org.stripe_account_id,
      requirements: account?.requirements?.summary ?? null,
    });
  } catch (error) {
    console.error("connect onboard GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ADMIN_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!stripeConfigured()) return NextResponse.json({ error: "Payment service not configured" }, { status: 503 });

    const body = await request.json().catch(() => ({}));
    const orgId = body.organization_id;
    if (!orgId) return NextResponse.json({ error: "organization_id required" }, { status: 400 });
    const auth = await authorizeOrgAccess(session, orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const org = await loadOrg(orgId);
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const stripe = getStripe();
    let accountId = org.stripe_account_id;

    if (!accountId) {
      const account = await stripe.v2.core.accounts.create({
        contact_email: org.contact_email || undefined,
        display_name: org.name || undefined,
        // Cobranded Stripe-hosted dashboard — Stripe owns KYC, bank details, tax
        // forms and the payout UI, which is the whole point of not building them.
        dashboard: "express",
        identity: { country: "ca", entity_type: "company" },
        defaults: {
          currency: "cad",
          responsibilities: { fees_collector: "application", losses_collector: "application" },
        },
        // Recipient only. Requesting merchant/card_payments here would be wrong
        // (the provider never charges a card — we do) and lengthens onboarding.
        configuration: {
          recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
        },
        include: ACCOUNT_INCLUDE,
        metadata: { sideline_star_org_id: String(orgId), org_type: org.type || "" },
      });
      accountId = account.id;
      await sql`
        UPDATE organizations
        SET stripe_account_id = ${accountId}, stripe_transfers_active = ${transfersActive(account)}
        WHERE id = ${orgId}`;
    }

    // Hosted onboarding. Not API onboarding — that would force us to build our
    // own requirement-remediation flow for every KYC edge case.
    const origin = new URL(request.url).origin;
    const link = await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          refresh_url: `${origin}/api/payments/connect/refresh?org=${orgId}`,
          return_url: `${origin}/service-provider/dashboard?payouts=done`,
        },
      },
    });

    return NextResponse.json({ url: link.url, accountId });
  } catch (error) {
    console.error("connect onboard POST error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
