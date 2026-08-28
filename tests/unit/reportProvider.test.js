// Who earns a report, and can they be paid.
//
// This is the money path, so the failure modes are expensive: a wrong provider
// pays the wrong org, a bad fee silently changes the platform's cut on every
// sale, and a missing gate sends a parent to a checkout that refuses them.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));

const { default: sql } = await import("@/lib/db");
const {
  resolveReportProvider, isPurchasable, purchaseBlockedReason,
  platformFeeCents, providerAmountCents, PLATFORM_FEE_BPS,
  resolveReportPrice, splitReportSale, DEFAULT_REPORT_PRICE_CENTS, SP_FLAT_FEE_CENTS, ASSOCIATION_TX_FEE_CENTS,
} = await import("@/lib/reportProvider");

const CAT_ROW = {
  id: 76, organization_id: 38, org_name: "Demo Soci", org_type: "association",
  report_purchasing_enabled: true,
};
const SP_ROW = { id: 16, name: "Competitive Thread", type: "service_provider" };

beforeEach(() => { sql.mockReset(); });

describe("platformFeeCents", () => {
  it("is 25% by default — the owner's locked-in cut", () => {
    expect(PLATFORM_FEE_BPS()).toBe(2500);
    expect(platformFeeCents(2499)).toBe(625); // $6.25 of $24.99
  });

  it("honours an env override", () => {
    expect(platformFeeCents(2499, 3000)).toBe(750);
    expect(platformFeeCents(2499, 2000)).toBe(500);
  });

  it("never exceeds the charge", () => {
    expect(platformFeeCents(2499, 10000)).toBe(2499);
  });

  it("never goes negative", () => {
    expect(platformFeeCents(2499, 0)).toBe(0);
  });

  it("falls back to 25% on a junk env value rather than charging 0% or 100%", () => {
    const orig = process.env.REPORT_PLATFORM_FEE_BPS;
    for (const bad of ["", "abc", "-500", "99999"]) {
      process.env.REPORT_PLATFORM_FEE_BPS = bad;
      expect(PLATFORM_FEE_BPS(), `bps=${bad}`).toBe(2500);
    }
    process.env.REPORT_PLATFORM_FEE_BPS = orig;
  });
});

describe("resolveReportProvider", () => {
  it("prefers the SP that runs the association's evals", async () => {
    sql.mockResolvedValueOnce([CAT_ROW]).mockResolvedValueOnce([SP_ROW]);
    const p = await resolveReportProvider(76);
    expect(p.orgId).toBe(16);
    expect(p.orgName).toBe("Competitive Thread");
    expect(p.isSelfProvider).toBe(false);
  });

  it("falls back to the association as its own provider", async () => {
    sql.mockResolvedValueOnce([CAT_ROW]).mockResolvedValueOnce([]);
    const p = await resolveReportProvider(76);
    expect(p.orgId).toBe(38);
    expect(p.orgName).toBe("Demo Soci");
    expect(p.isSelfProvider).toBe(true);
  });

  it("lets the association's toggle disable purchasing even when an SP collects", async () => {
    // It's their parents being sold to, so their switch wins.
    sql.mockResolvedValueOnce([{ ...CAT_ROW, report_purchasing_enabled: false }]).mockResolvedValueOnce([SP_ROW]);
    const p = await resolveReportProvider(76);
    expect(p.orgId).toBe(16);
    expect(p.purchasingEnabled).toBe(false);
    expect(isPurchasable(p)).toBe(false);
  });

  it("returns null for a missing category", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await resolveReportProvider(999)).toBeNull();
  });
});

describe("isPurchasable / purchaseBlockedReason", () => {
  it("allows an enabled association", () => {
    const p = { purchasingEnabled: true };
    expect(isPurchasable(p)).toBe(true);
    expect(purchaseBlockedReason(p)).toBeNull();
  });

  it("blocks when the association switched purchasing off", () => {
    const p = { purchasingEnabled: false };
    expect(isPurchasable(p)).toBe(false);
    expect(purchaseBlockedReason(p)).toBe("purchasing_disabled");
  });

  it("blocks on a null provider", () => {
    expect(isPurchasable(null)).toBe(false);
    expect(purchaseBlockedReason(null)).toBe("category_missing");
  });

  it("does not gate on the provider's banking — Sideline Star collects the charge", () => {
    // Under Connect a provider mid-onboarding couldn't be paid, so a sale had to
    // be blocked. Without Connect the money lands on our account regardless, so
    // nothing about the provider stops a parent buying.
    expect(isPurchasable({ purchasingEnabled: true })).toBe(true);
  });
});

describe("providerAmountCents", () => {
  it("is the charge minus our cut", () => {
    expect(providerAmountCents(2499, 625)).toBe(1874); // $18.74 of $24.99
  });

  it("derives the fee when none was recorded", () => {
    expect(providerAmountCents(2499)).toBe(1874);
  });

  it("uses the fee STORED on the sale, not today's rate", () => {
    // A statement must reconstruct from the ledger: if the cut changes later,
    // historical sales keep the split they were actually sold under.
    expect(providerAmountCents(2499, 500)).toBe(1999); // sold at 20%
  });

  it("never goes negative", () => {
    expect(providerAmountCents(2499, 9999)).toBe(0);
  });
});

describe("GST is not revenue", () => {
  // The expensive mistake: GST is collected from the parent but owed to the CRA.
  // If the provider's 75% is taken off the tax-inclusive total, every sale quietly
  // pays them a slice of the government's money ($27.99 instead of $26.24, or
  // $2,275 across 1,300 sales). amount_cents is stored PRE-tax for this reason.
  const PRICE = 3499, GST = 175, TOTAL = PRICE + GST;

  it("the provider's share comes off the pre-tax amount", () => {
    const fee = platformFeeCents(PRICE);
    expect(fee).toBe(875);
    expect(providerAmountCents(PRICE, fee)).toBe(2624); // $26.24
  });

  it("splitting the tax-inclusive total would overpay the provider", () => {
    // Guards the shape of the bug, so a future refactor that starts storing
    // amount_total fails here rather than in a payout run.
    const wrong = providerAmountCents(TOTAL, platformFeeCents(PRICE));
    expect(wrong).toBe(2799);
    expect(wrong - 2624).toBe(GST); // exactly the CRA's money
  });

  it("cut + owed reconciles to pre-tax revenue, with tax outside the split", () => {
    const fee = platformFeeCents(PRICE);
    expect(fee + providerAmountCents(PRICE, fee)).toBe(PRICE);
  });
});

describe("resolveReportPrice — association-granted custom pricing", () => {
  it("charges the platform default when never granted", async () => {
    sql.mockResolvedValueOnce([{ report_control_granted: false, custom_report_price_cents: null }]);
    const r = await resolveReportPrice(37);
    expect(r).toEqual({ priceCents: DEFAULT_REPORT_PRICE_CENTS, granted: false, isCustom: false });
  });

  it("ignores a leftover custom price if the grant was revoked", async () => {
    // Reflects reality without the SP having to clear the old number too.
    sql.mockResolvedValueOnce([{ report_control_granted: false, custom_report_price_cents: 5500 }]);
    const r = await resolveReportPrice(37);
    expect(r.priceCents).toBe(DEFAULT_REPORT_PRICE_CENTS);
  });

  it("charges the association's own price once granted and set", async () => {
    sql.mockResolvedValueOnce([{ report_control_granted: true, custom_report_price_cents: 5500 }]);
    const r = await resolveReportPrice(37);
    expect(r).toEqual({ priceCents: 5500, granted: true, isCustom: true });
  });

  it("falls back to default when granted but no price set yet", async () => {
    sql.mockResolvedValueOnce([{ report_control_granted: true, custom_report_price_cents: null }]);
    const r = await resolveReportPrice(37);
    expect(r).toEqual({ priceCents: DEFAULT_REPORT_PRICE_CENTS, granted: true, isCustom: false });
  });
});

describe("splitReportSale — BAHA's worked example", () => {
  it("$55.00: SP keeps $34.99 flat, association eats a 70-cent fee, keeps the rest", () => {
    expect(splitReportSale(5500)).toEqual({ spFeeCents: 3499, associationFeeCents: 70, associationAmountCents: 2001 - 70 });
  });

  it("at the platform default, the association gets nothing and pays no fee", () => {
    expect(splitReportSale(DEFAULT_REPORT_PRICE_CENTS)).toEqual({ spFeeCents: SP_FLAT_FEE_CENTS, associationFeeCents: 0, associationAmountCents: 0 });
  });

  it("clamps to zero instead of going negative when the custom price barely clears the SP cut", () => {
    // $35.00 leaves only 1 cent after the SP's cut -- less than the 70-cent fee.
    const r = splitReportSale(3500);
    expect(r.associationAmountCents).toBe(0);
    expect(r.associationFeeCents).toBe(1); // takes only what's left, never more than the remainder
  });

  it("a price below the SP's flat cut never makes the SP's share negative", () => {
    const r = splitReportSale(1000); // hypothetical: below SP_FLAT_FEE_CENTS
    expect(r.spFeeCents).toBe(1000);
    expect(r.associationFeeCents).toBe(0);
    expect(r.associationAmountCents).toBe(0);
  });

  it("reconciles exactly: SP cut + association fee + association amount = the charge", () => {
    for (const price of [DEFAULT_REPORT_PRICE_CENTS, 4000, 5500, 10000, 3500, 3499, 100]) {
      const r = splitReportSale(price);
      expect(r.spFeeCents + r.associationFeeCents + r.associationAmountCents).toBe(price);
    }
  });

  it("the split must run on the pre-tax amount — same GST trap as platformFeeCents above", () => {
    // amount_cents is stored pre-tax; splitting a tax-inclusive total would
    // hand the association a slice of GST that's actually owed to the CRA.
    const PRICE = 5500, GST = 275, TOTAL = PRICE + GST;
    const correct = splitReportSale(PRICE);
    const wrong = splitReportSale(TOTAL);
    expect(wrong.associationAmountCents).not.toBe(correct.associationAmountCents);
    expect(wrong.associationAmountCents - correct.associationAmountCents).toBe(GST);
  });
});
