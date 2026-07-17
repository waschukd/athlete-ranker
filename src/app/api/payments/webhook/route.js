// Stripe webhook — the source of truth for payment state and for whether a
// provider can be paid. Never trust the client or the synchronous API response.
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getStripe, transfersActive } from "@/lib/stripe";

export async function POST(request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const stripe = getStripe();
    const body = await request.text();
    const sig = request.headers.get("stripe-signature");

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const { athlete_id, age_category_id } = session.metadata || {};

      // Only unlock when the money actually cleared. checkout.session.completed
      // can fire for async/unpaid methods, so gate on payment_status === 'paid'.
      if (athlete_id && age_category_id && session.payment_status === "paid") {
        // Read the split back from Stripe rather than trusting what we intended
        // at checkout — the PaymentIntent is what actually moved the money.
        let feeCents = session.metadata?.application_fee_cents
          ? parseInt(session.metadata.application_fee_cents, 10)
          : null;
        let destination = null;
        if (session.payment_intent) {
          try {
            const pi = await stripe.paymentIntents.retrieve(String(session.payment_intent));
            if (Number.isFinite(pi?.application_fee_amount)) feeCents = pi.application_fee_amount;
            destination = pi?.transfer_data?.destination || null;
          } catch (e) {
            // Non-fatal: the purchase is paid and must unlock regardless. The
            // intended values from checkout stand in for the audit columns.
            console.error("PI retrieve failed for", session.payment_intent, e?.message);
          }
        }
        const providerOrgId = session.metadata?.provider_org_id
          ? parseInt(session.metadata.provider_org_id, 10)
          : null;

        await sql`
          UPDATE report_purchases SET
            status = 'completed',
            buyer_email = ${session.customer_details?.email || ''},
            stripe_payment_intent_id = ${session.payment_intent || ''},
            application_fee_cents = COALESCE(${feeCents}, application_fee_cents),
            provider_org_id = COALESCE(${providerOrgId}, provider_org_id),
            destination_account_id = COALESCE(${destination}, destination_account_id),
            completed_at = NOW()
          WHERE stripe_session_id = ${session.id}
        `;
      }
    }

    // Connect account lifecycle. A provider becomes payable only when Stripe says
    // the recipient's stripe_transfers capability is active — mirror that here so
    // the paywall can gate on it without calling Stripe on every page view.
    //
    // v1 sends `account.updated`; Accounts v2 sends `v2.core.account[...]`
    // events. Handle both so this keeps working across the API migration.
    if (event.type === "account.updated" || event.type.startsWith("v2.core.account")) {
      const account = event.data?.object || event.related_object || null;
      const accountId = account?.id || event.related_object?.id;
      if (accountId) {
        let active = null;
        // v2 payloads carry the capability inline; v1 `account.updated` does not,
        // so re-fetch rather than guess from the deprecated charges_enabled.
        if (account?.configuration?.recipient) {
          active = transfersActive(account);
        } else {
          try {
            const fresh = await stripe.v2.core.accounts.retrieve(accountId, {
              include: ["configuration.recipient"],
            });
            active = transfersActive(fresh);
          } catch (e) {
            console.error("account retrieve failed for", accountId, e?.message);
          }
        }
        if (active !== null) {
          await sql`
            UPDATE organizations SET stripe_transfers_active = ${active}
            WHERE stripe_account_id = ${accountId}`;
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
