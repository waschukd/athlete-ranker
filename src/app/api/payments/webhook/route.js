import { NextResponse } from "next/server";
import Stripe from "stripe";
import sql from "@/lib/db";

export async function POST(request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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

      if (athlete_id && age_category_id) {
        await sql`
          UPDATE report_purchases SET
            status = 'completed',
            buyer_email = ${session.customer_details?.email || ''},
            stripe_payment_intent_id = ${session.payment_intent || ''},
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
