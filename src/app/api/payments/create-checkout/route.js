import { NextResponse } from "next/server";
import Stripe from "stripe";
import sql from "@/lib/db";

export async function POST(request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Payment service not configured" }, { status: 503 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { token } = await request.json();

    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

    // Look up the report link
    const link = await sql`
      SELECT rl.*, a.first_name, a.last_name, ac.name as category_name
      FROM report_links rl
      JOIN athletes a ON a.id = rl.athlete_id
      JOIN age_categories ac ON ac.id = rl.age_category_id
      WHERE rl.token = ${token} AND rl.is_active = true
    `;
    if (!link.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    const { athlete_id, age_category_id } = link[0];

    // Check if already purchased
    const existing = await sql`
      SELECT id FROM report_purchases
      WHERE athlete_id = ${athlete_id} AND age_category_id = ${age_category_id} AND status = 'completed'
    `;
    if (existing.length) return NextResponse.json({ already_purchased: true });

    const priceCents = parseInt(process.env.REPORT_PRICE_CENTS || "1999");
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: `Player Report — ${link[0].first_name} ${link[0].last_name}`,
            description: `${link[0].category_name} — Full evaluation report with scores, notes, and AI scouting analysis`,
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      }],
      metadata: {
        token,
        athlete_id: String(athlete_id),
        age_category_id: String(age_category_id),
      },
      success_url: `${baseUrl}/report/${token}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/report/${token}?payment=cancelled`,
    });

    // Create pending purchase record
    await sql`
      INSERT INTO report_purchases (athlete_id, age_category_id, buyer_email, stripe_session_id, amount_cents, status, report_link_token)
      VALUES (${athlete_id}, ${age_category_id}, '', ${session.id}, ${priceCents}, 'pending', ${token})
    `;

    return NextResponse.json({ checkout_url: session.url });
  } catch (error) {
    console.error("Create checkout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
