// Real request: every report sale runs through an Alberta association/SP, so
// Stripe Tax's automatic, address-based calculation (and the billing address
// prompt it requires) is unnecessary friction — replaced with a flat 5% GST.
//
// Real incident: the first version of this called stripe.taxRates.list/create
// to attach a Stripe Tax Rate object, which 403'd on EVERY checkout in
// production ("Permission denied ... Tax Rates Read") because the live key
// is a restricted key without that scope -- silently breaking the Unlock
// button for every buyer (caught only because the owner tested it himself).
// Fixed by never touching the Tax Rates API at all: GST is a plain second
// line item, computed and verified here without any Stripe tax permission.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({ checkAndRecord: vi.fn(async () => ({ allowed: true })), clientIp: vi.fn(() => "1.2.3.4") }));

const checkoutSessionsCreate = vi.fn();

vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual("@/lib/stripe");
  return {
    ...actual,
    stripeConfigured: () => true,
    getStripe: () => ({ checkout: { sessions: { create: checkoutSessionsCreate } } }),
  };
});

vi.mock("@/lib/reportProvider", () => ({
  resolveReportProvider: vi.fn(async () => ({ orgId: 16, orgName: "Competitive Thread", purchasingEnabled: true })),
  isPurchasable: () => true,
  purchaseBlockedReason: () => null,
  resolveReportPrice: vi.fn(async () => ({ priceCents: 3499 })),
  splitReportSale: () => ({ spFeeCents: 3499, associationFeeCents: 0 }),
}));

import sql from "@/lib/db";

function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) if (text.includes(match)) return result;
    return [];
  });
}

const LINK_ROW = [{
  id: 1, token: "tok-1", athlete_id: 5, age_category_id: 9, organization_id: 16,
  is_active: true, created_at: new Date().toISOString(),
  first_name: "Jordan", last_name: "Smith", category_name: "U13 AA",
}];

beforeEach(() => {
  vi.resetAllMocks();
  checkoutSessionsCreate.mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/cs_test_1" });
  mockSqlByQuery([["FROM report_links", LINK_ROW]]);
});

describe("POST /api/payments/create-checkout — flat GST, no address collection, no Tax Rates API", () => {
  it("never requests automatic_tax, billing_address_collection, or any tax_rates on the line item", async () => {
    const { POST } = await import("@/app/api/payments/create-checkout/route");
    await POST(new Request("http://test/api/payments/create-checkout", { method: "POST", body: JSON.stringify({ token: "tok-1", agreedToTerms: true }) }));

    expect(checkoutSessionsCreate).toHaveBeenCalledTimes(1);
    const args = checkoutSessionsCreate.mock.calls[0][0];
    expect(args.automatic_tax).toBeUndefined();
    expect(args.billing_address_collection).toBeUndefined();
    for (const li of args.line_items) expect(li.tax_rates).toBeUndefined();
  });

  it("adds GST as a plain second line item at exactly 5% of the price", async () => {
    const { POST } = await import("@/app/api/payments/create-checkout/route");
    await POST(new Request("http://test/api/payments/create-checkout", { method: "POST", body: JSON.stringify({ token: "tok-1", agreedToTerms: true }) }));

    const args = checkoutSessionsCreate.mock.calls[0][0];
    expect(args.line_items).toHaveLength(2);
    expect(args.line_items[0].price_data.unit_amount).toBe(3499);
    expect(args.line_items[1].price_data.product_data.name).toBe("GST (5%)");
    expect(args.line_items[1].price_data.unit_amount).toBe(175); // round(3499 * 0.05)
    expect(args.metadata.gst_cents).toBe("175");
  });
});

describe("POST /api/payments/create-checkout — development-use terms", () => {
  // Real ask: "I'm purchasing this for development purposes, not to dispute
  // a team selection" is a real condition of sale, not just a disabled
  // button on the client -- enforced here too.
  it("refuses to create a checkout session without agreedToTerms: true", async () => {
    const { POST } = await import("@/app/api/payments/create-checkout/route");
    const res = await POST(new Request("http://test/api/payments/create-checkout", { method: "POST", body: JSON.stringify({ token: "tok-1" }) }));

    expect(res.status).toBe(400);
    expect(checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("also refuses a falsy or non-boolean agreedToTerms value", async () => {
    const { POST } = await import("@/app/api/payments/create-checkout/route");
    const res = await POST(new Request("http://test/api/payments/create-checkout", { method: "POST", body: JSON.stringify({ token: "tok-1", agreedToTerms: "yes" }) }));

    expect(res.status).toBe(400);
    expect(checkoutSessionsCreate).not.toHaveBeenCalled();
  });
});
