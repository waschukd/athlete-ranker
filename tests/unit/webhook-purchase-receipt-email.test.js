// Real concern: the only place a buyer ever sees the report link is the tab
// they just paid in -- close it without saving/printing and the (already
// unlocked) link is easy to lose, looking like they'd have to pay again.
// The webhook now emails the buyer a permanent copy of the same link right
// after a real payment completes.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  stripeConfigured: () => true,
  getStripe: () => ({ webhooks: { constructEvent: vi.fn((body) => JSON.parse(body)) } }),
}));
vi.mock("@/lib/email", () => ({ sendPurchaseReceiptEmail: vi.fn(async () => ({ ok: true, id: "email-1" })) }));

import sql from "@/lib/db";
import { sendPurchaseReceiptEmail } from "@/lib/email";

const ATHLETE_ROW = [{ first_name: "Elliot", last_name: "Peretti", org_name: "Beaumont Amateur Hockey Association" }];

beforeEach(() => {
  vi.resetAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.NEXT_PUBLIC_BASE_URL = "https://www.sidelinestar.com";
});

function makeEvent(overrides = {}) {
  return {
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        payment_status: "paid",
        amount_subtotal: 3674,
        total_details: {},
        currency: "cad",
        payment_intent: "pi_test_1",
        customer_details: { email: "parent@example.com" },
        metadata: {
          athlete_id: "3000", age_category_id: "65", provider_org_id: "16",
          platform_fee_cents: "3499", association_fee_cents: "70",
          gst_cents: "175", token: "tok-test-1",
        },
        ...overrides,
      },
    },
  };
}

describe("POST /api/payments/webhook — purchase receipt email", () => {
  it("emails the buyer a permanent link to the report they just unlocked", async () => {
    sql.mockImplementation(async (strings) => {
      const text = strings.join("?");
      if (text.includes("FROM athletes")) return ATHLETE_ROW;
      return [];
    });

    const { POST } = await import("@/app/api/payments/webhook/route");
    await POST(new Request("http://test/api/payments/webhook", { method: "POST", body: JSON.stringify(makeEvent()), headers: { "stripe-signature": "sig" } }));

    expect(sendPurchaseReceiptEmail).toHaveBeenCalledWith({
      to: "parent@example.com",
      playerName: "Elliot Peretti",
      orgName: "Beaumont Amateur Hockey Association",
      reportUrl: "https://www.sidelinestar.com/report/tok-test-1",
    });
  });

  it("never sends a receipt when there's no buyer email or no token", async () => {
    sql.mockResolvedValue(ATHLETE_ROW);

    const { POST } = await import("@/app/api/payments/webhook/route");
    const event = makeEvent({ customer_details: {} });
    await POST(new Request("http://test/api/payments/webhook", { method: "POST", body: JSON.stringify(event), headers: { "stripe-signature": "sig" } }));

    expect(sendPurchaseReceiptEmail).not.toHaveBeenCalled();
  });

  it("still returns success even if the receipt email fails -- the purchase itself already succeeded", async () => {
    sql.mockImplementation(async (strings) => {
      const text = strings.join("?");
      if (text.includes("FROM athletes")) return ATHLETE_ROW;
      return [];
    });
    sendPurchaseReceiptEmail.mockRejectedValueOnce(new Error("Resend down"));

    const { POST } = await import("@/app/api/payments/webhook/route");
    const res = await POST(new Request("http://test/api/payments/webhook", { method: "POST", body: JSON.stringify(makeEvent()), headers: { "stripe-signature": "sig" } }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });
});
