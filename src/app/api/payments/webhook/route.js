// Stripe webhook — the source of truth for payment state. Never trust the client
// or the synchronous API response.
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getStripe } from "@/lib/stripe";

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
        // Ledger: who earned this and what we kept. COALESCE so a replayed or
        // out-of-order event can't blank a row that checkout already stamped.
        const providerOrgId = session.metadata?.provider_org_id
          ? parseInt(session.metadata.provider_org_id, 10)
          : null;
        const feeCents = session.metadata?.platform_fee_cents
          ? parseInt(session.metadata.platform_fee_cents, 10)
          : null;

        // amount_total is what Stripe actually charged — authoritative over the
        // price we intended, which can drift from an old pending row.
        const paidCents = Number.isFinite(session.amount_total) ? session.amount_total : null;

        await sql`
          UPDATE report_purchases SET
            status = 'completed',
            buyer_email = ${session.customer_details?.email || ''},
            stripe_payment_intent_id = ${session.payment_intent || ''},
            amount_cents = COALESCE(${paidCents}, amount_cents),
            platform_fee_cents = COALESCE(${feeCents}, platform_fee_cents),
            provider_org_id = COALESCE(${providerOrgId}, provider_org_id),
            completed_at = NOW()
          WHERE stripe_session_id = ${session.id}
        `;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
