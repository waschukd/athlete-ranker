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

        // amount_SUBTOTAL, not amount_total. The total includes GST, which is not
        // revenue — it's owed to the CRA. Storing the total here would make the
        // provider's 75% eat a slice of the government's money on every sale
        // ($27.99 instead of $26.24 at $34.99 + 5%). Tax is held separately.
        const netCents = Number.isFinite(session.amount_subtotal) ? session.amount_subtotal : null;
        const taxCents = Number.isFinite(session.total_details?.amount_tax)
          ? session.total_details.amount_tax
          : null;

        await sql`
          UPDATE report_purchases SET
            status = 'completed',
            buyer_email = ${session.customer_details?.email || ''},
            stripe_payment_intent_id = ${session.payment_intent || ''},
            amount_cents = COALESCE(${netCents}, amount_cents),
            tax_cents = COALESCE(${taxCents}, tax_cents),
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
