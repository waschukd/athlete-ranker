// Real request: every report sale runs through an Alberta association/SP, so
// Stripe Tax's automatic, address-based calculation (and the billing address
// prompt it requires) is unnecessary friction — replaced with a flat 5% GST
// tax rate and no address collection. See lib/stripe.js's getGstTaxRate.
//
// getGstTaxRate caches the resolved rate ID at module scope (deliberately --
// it's an immutable Stripe object, no reason to re-list every checkout), so
// each test here resets the module registry and re-imports to get a fresh,
// uncached instance rather than fighting shared state between tests.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({ checkAndRecord: vi.fn(async () => ({ allowed: true })), clientIp: vi.fn(() => "1.2.3.4") }));

const taxRatesList = vi.fn();
const taxRatesCreate = vi.fn();
const checkoutSessionsCreate = vi.fn();

vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual("@/lib/stripe");
  return {
    ...actual,
    stripeConfigured: () => true,
    getStripe: () => ({
      taxRates: { list: taxRatesList, create: taxRatesCreate },
      checkout: { sessions: { create: checkoutSessionsCreate } },
    }),
  };
});

vi.mock("@/lib/reportProvider", () => ({
  resolveReportProvider: vi.fn(async () => ({ orgId: 16, orgName: "Competitive Thread", purchasingEnabled: true })),
  isPurchasable: () => true,
  purchaseBlockedReason: () => null,
  resolveReportPrice: vi.fn(async () => ({ priceCents: 3499 })),
  splitReportSale: () => ({ spFeeCents: 3499, associationFeeCents: 0 }),
}));

const LINK_ROW = [{
  id: 1, token: "tok-1", athlete_id: 5, age_category_id: 9, organization_id: 16,
  is_active: true, created_at: new Date().toISOString(),
  first_name: "Jordan", last_name: "Smith", category_name: "U13 AA",
}];

function mockSqlByQuery(sql, responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) if (text.includes(match)) return result;
    return [];
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
  taxRatesList.mockResolvedValue({ data: [] });
  taxRatesCreate.mockResolvedValue({ id: "txr_new123" });
  checkoutSessionsCreate.mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/cs_test_1" });
});

describe("POST /api/payments/create-checkout — flat GST, no address collection", () => {
  it("never requests automatic_tax or billing_address_collection", async () => {
    const sql = (await import("@/lib/db")).default;
    mockSqlByQuery(sql, [
      ["FROM report_links", LINK_ROW],
      ["FROM report_purchases\n      WHERE report_link_token", [{ c: 0 }]],
      ["FROM report_purchases\n      WHERE athlete_id", []],
      ["INSERT INTO report_purchases", []],
    ]);
    const { POST } = await import("@/app/api/payments/create-checkout/route");
    await POST(new Request("http://test/api/payments/create-checkout", { method: "POST", body: JSON.stringify({ token: "tok-1" }) }));

    expect(checkoutSessionsCreate).toHaveBeenCalledTimes(1);
    const args = checkoutSessionsCreate.mock.calls[0][0];
    expect(args.automatic_tax).toBeUndefined();
    expect(args.billing_address_collection).toBeUndefined();
  });

  it("attaches a flat 5% GST tax rate to the line item instead", async () => {
    const sql = (await import("@/lib/db")).default;
    mockSqlByQuery(sql, [
      ["FROM report_links", LINK_ROW],
      ["FROM report_purchases\n      WHERE report_link_token", [{ c: 0 }]],
      ["FROM report_purchases\n      WHERE athlete_id", []],
      ["INSERT INTO report_purchases", []],
    ]);
    const { POST } = await import("@/app/api/payments/create-checkout/route");
    await POST(new Request("http://test/api/payments/create-checkout", { method: "POST", body: JSON.stringify({ token: "tok-1" }) }));

    const args = checkoutSessionsCreate.mock.calls[0][0];
    expect(args.line_items[0].tax_rates).toEqual(["txr_new123"]);
    expect(args.line_items[0].price_data.tax_behavior).toBe("exclusive");
  });
});
