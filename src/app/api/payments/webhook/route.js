// Stripe webhook — the source of truth for payment state. Never trust the client
// or the synchronous API response.
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { sendPurchaseReceiptEmail } from "@/lib/email";

export async function POST(request) {
  try {
    if (!stripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
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

        // GST is a plain second line item (see create-checkout — no Stripe Tax
        // Rate object, so Stripe never reports it via total_details.amount_tax),
        // recorded flat and deterministic in metadata at checkout creation.
        // amount_subtotal sums BOTH line items, so it must be reduced by the
        // GST amount to get real product revenue — storing the GST-inclusive
        // total here would make the provider's cut eat a slice of the money
        // owed to the CRA ($27.99 instead of $26.24 at $34.99 + 5%).
        const gstCentsMeta = session.metadata?.gst_cents ? parseInt(session.metadata.gst_cents, 10) : null;
        const taxCents = Number.isFinite(gstCentsMeta)
          ? gstCentsMeta
          : (Number.isFinite(session.total_details?.amount_tax) ? session.total_details.amount_tax : null);
        const netCents = Number.isFinite(session.amount_subtotal)
          ? session.amount_subtotal - (Number.isFinite(gstCentsMeta) ? gstCentsMeta : 0)
          : null;
        // The currency Stripe actually settled in. Adaptive pricing can convert a
        // buyer to their local currency, so reconcile the ledger to what was
        // really charged rather than what we requested.
        const currency = session.currency || null;

        await sql`
          UPDATE report_purchases SET
            status = 'completed',
            buyer_email = ${session.customer_details?.email || ''},
            stripe_payment_intent_id = ${session.payment_intent || ''},
            amount_cents = COALESCE(${netCents}, amount_cents),
            currency = COALESCE(${currency}, currency),
            tax_cents = COALESCE(${taxCents}, tax_cents),
            platform_fee_cents = COALESCE(${feeCents}, platform_fee_cents),
            provider_org_id = COALESCE(${providerOrgId}, provider_org_id),
            completed_at = NOW()
          WHERE stripe_session_id = ${session.id}
        `;

        // Real concern: the only place a buyer ever sees the report link is
        // the tab they just paid in -- close it without saving and the
        // (already unlocked) link is easy to lose track of, looking like
        // they'd have to pay again to get back in. A receipt email with the
        // same permanent link fixes that. Best-effort: an email hiccup here
        // must never undo or retry the purchase itself, which already
        // succeeded above.
        const buyerEmail = session.customer_details?.email;
        const token = session.metadata?.token;
        if (buyerEmail && token) {
          try {
            const [info] = await sql`
              SELECT a.first_name, a.last_name, o.name AS org_name
              FROM athletes a JOIN organizations o ON o.id = a.organization_id
              WHERE a.id = ${athlete_id} AND a.age_category_id = ${age_category_id}
            `;
            if (info) {
              const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";
              await sendPurchaseReceiptEmail({
                to: buyerEmail,
                playerName: `${info.first_name} ${info.last_name}`.trim(),
                orgName: info.org_name,
                reportUrl: `${baseUrl}/report/${token}`,
              });
            }
          } catch (e) { console.error("Purchase receipt email failed:", e?.message); }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
