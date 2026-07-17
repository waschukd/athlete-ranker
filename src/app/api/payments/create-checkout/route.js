// Stripe Checkout creation for the parent-facing report purchase.
//
// Intentionally unauthenticated — parents arrive via a shared report
// link and have no account. The share token in `report_links`
// (random, marked is_active) is the authorization material here, the
// same model used by /api/report/[token]. The token-share design is
// out of scope to redesign in this PR (see the standing TODO on token
// expiry + rate limiting).

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { checkAndRecord, clientIp } from "@/lib/rateLimit";
import { getStripe } from "@/lib/stripe";
import { resolveReportProvider, isPurchasable, purchaseBlockedReason, platformFeeCents } from "@/lib/reportProvider";

// Charge currency. Defaults to usd to preserve existing behaviour — the one
// completed purchase to date was USD. The associations are Albertan, so "cad" is
// probably the right answer; it's an env flip once the pricing call is made.
const REPORT_CURRENCY = (process.env.REPORT_CURRENCY || "usd").toLowerCase();

// Mirror the read-side TTL on /api/report/[token] so a bought link can
// never outlive its preview.
const TOKEN_TTL_DAYS = parseInt(process.env.REPORT_TOKEN_TTL_DAYS || "90", 10);

// Per-token throttle: how many checkout sessions we'll mint per token
// inside a sliding window. Each create-checkout call writes a pending
// row to report_purchases, so we count those instead of standing up a
// dedicated rate-limit table.
const MAX_CHECKOUTS_PER_WINDOW = parseInt(process.env.REPORT_CHECKOUT_MAX_PER_HOUR || "10", 10);
const WINDOW_MINUTES = 60;

export async function POST(request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Payment service not configured" }, { status: 503 });
    }

    // Per-IP throttle in addition to the existing per-token cap below — the
    // per-token limit doesn't stop one IP from churning many tokens, so cap
    // total checkout creations per IP/hour to blunt enumeration + Stripe spam.
    const ip = clientIp(request);
    const rl = await checkAndRecord({ endpoint: "checkout_create", identifier: ip, max: 30, windowMins: 60 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const stripe = getStripe();
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

    if (link[0].created_at) {
      const ageMs = Date.now() - new Date(link[0].created_at).getTime();
      if (ageMs > TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: "Report link expired" }, { status: 410 });
      }
    }

    const recent = await sql`
      SELECT COUNT(*)::int AS c FROM report_purchases
      WHERE report_link_token = ${token}
        AND created_at > NOW() - (${WINDOW_MINUTES} || ' minutes')::interval
    `;
    if ((recent[0]?.c || 0) >= MAX_CHECKOUTS_PER_WINDOW) {
      return NextResponse.json(
        { error: "Too many checkout attempts for this report. Please try again later." },
        { status: 429 },
      );
    }

    const { athlete_id, age_category_id } = link[0];

    // Check if already purchased
    const existing = await sql`
      SELECT id FROM report_purchases
      WHERE athlete_id = ${athlete_id} AND age_category_id = ${age_category_id} AND status = 'completed'
    `;
    if (existing.length) return NextResponse.json({ already_purchased: true });

    // Who earns this sale. Resolved server-side — never trusted from the client.
    // Sideline Star is merchant of record and collects the whole charge; this is
    // for the ledger (and the association's own purchasing switch), not a gate on
    // the provider's banking.
    const provider = await resolveReportProvider(age_category_id);
    if (!isPurchasable(provider)) {
      const reason = purchaseBlockedReason(provider);
      return NextResponse.json(
        { error: "Report purchasing isn't available for this association yet.", reason },
        { status: 409 },
      );
    }

    const priceCents = parseInt(process.env.REPORT_PRICE_CENTS || "2499");
    // Recorded per sale so a provider statement reads off the ledger rather than
    // recomputing against a rate that may have moved since.
    const feeCents = platformFeeCents(priceCents);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";

    // Plain charge on Sideline Star's own account — no destination/transfer.
    // The provider's share is remitted off-platform from the ledger.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: REPORT_CURRENCY,
          product_data: {
            // Mask the minor's surname on the (unauthenticated) Stripe page — the
            // free preview only ever shows "First L." and checkout needs no purchase.
            name: `Player Report — ${link[0].first_name} ${link[0].last_name ? String(link[0].last_name)[0] + "." : ""}`.trim(),
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
        provider_org_id: String(provider.orgId),
        platform_fee_cents: String(feeCents),
      },
      success_url: `${baseUrl}/report/${token}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/report/${token}?payment=cancelled`,
    });

    // Pending purchase row + the ledger entry. Confirmed by the webhook.
    await sql`
      INSERT INTO report_purchases (athlete_id, age_category_id, buyer_email, stripe_session_id, amount_cents, status, report_link_token,
                                    platform_fee_cents, provider_org_id)
      VALUES (${athlete_id}, ${age_category_id}, '', ${session.id}, ${priceCents}, 'pending', ${token},
              ${feeCents}, ${provider.orgId})
    `;

    return NextResponse.json({ checkout_url: session.url });
  } catch (error) {
    console.error("Create checkout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
