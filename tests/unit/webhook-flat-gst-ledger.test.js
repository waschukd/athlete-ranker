// GST is now a plain second Stripe line item (see checkout-flat-gst.test.js
// for why), which means Stripe never populates total_details.amount_tax --
// that field is specific to Stripe Tax / tax_rates. The webhook must instead
// read the flat, deterministic gst_cents stamped into checkout metadata, and
// subtract it from amount_subtotal (which now sums BOTH line items) to get
// real product revenue -- getting this wrong would make the provider's cut
// eat a slice of the money owed to the CRA.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  stripeConfigured: () => true,
  getStripe: () => ({ webhooks: { constructEvent: vi.fn((body) => JSON.parse(body)) } }),
}));

import sql from "@/lib/db";

beforeEach(() => {
  vi.resetAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  sql.mockResolvedValue([]);
});

function makeEvent({ amountSubtotal, gstCents }) {
  return {
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        payment_status: "paid",
        amount_subtotal: amountSubtotal,
        total_details: {}, // no amount_tax -- plain line items, not Stripe Tax
        currency: "cad",
        payment_intent: "pi_test_1",
        customer_details: { email: "parent@example.com" },
        metadata: {
          athlete_id: "5", age_category_id: "9", provider_org_id: "16",
          platform_fee_cents: "3499", association_fee_cents: "0",
          gst_cents: String(gstCents),
        },
      },
    },
  };
}

describe("POST /api/payments/webhook — GST-aware ledger math", () => {
  it("subtracts the flat GST line from amount_subtotal to record real product revenue", async () => {
    const { POST } = await import("@/app/api/payments/webhook/route");
    const event = makeEvent({ amountSubtotal: 3674, gstCents: 175 }); // 3499 + 175
    await POST(new Request("http://test/api/payments/webhook", { method: "POST", body: JSON.stringify(event), headers: { "stripe-signature": "sig" } }));

    const updateCall = sql.mock.calls.find(c => c[0].join("?").includes("UPDATE report_purchases"));
    expect(updateCall).toBeTruthy();
    const values = updateCall.slice(1); // interpolated values, in template order
    expect(values).toContain(3499); // amount_cents: subtotal minus GST, not the GST-inclusive total
    expect(values).toContain(175);  // tax_cents: the flat GST amount from metadata
  });
});
