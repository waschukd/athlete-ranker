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
  platformFeeCents, PLATFORM_FEE_BPS,
} = await import("@/lib/reportProvider");

const CAT_ROW = {
  id: 76, organization_id: 38, org_name: "Demo Soci", org_type: "association",
  stripe_account_id: "acct_assoc", stripe_transfers_active: true, report_purchasing_enabled: true,
};
const SP_ROW = {
  id: 16, name: "Competitive Thread", type: "service_provider",
  stripe_account_id: "acct_sp", stripe_transfers_active: true,
};

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

  it("never meets or exceeds the charge — Stripe rejects that outright", () => {
    expect(platformFeeCents(2499, 10000)).toBe(2498);
    expect(platformFeeCents(100, 10000)).toBe(99);
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
    expect(p.stripeAccountId).toBe("acct_sp");
    expect(p.isSelfProvider).toBe(false);
  });

  it("falls back to the association as its own provider", async () => {
    sql.mockResolvedValueOnce([CAT_ROW]).mockResolvedValueOnce([]);
    const p = await resolveReportProvider(76);
    expect(p.orgId).toBe(38);
    expect(p.stripeAccountId).toBe("acct_assoc");
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
  const ok = { purchasingEnabled: true, stripeAccountId: "acct_1", transfersActive: true };

  it("allows a fully onboarded, enabled provider", () => {
    expect(isPurchasable(ok)).toBe(true);
    expect(purchaseBlockedReason(ok)).toBeNull();
  });

  it("blocks a provider that never onboarded", () => {
    const p = { ...ok, stripeAccountId: null };
    expect(isPurchasable(p)).toBe(false);
    expect(purchaseBlockedReason(p)).toBe("provider_not_onboarded");
  });

  it("blocks a provider mid-onboarding — Stripe can't transfer to them yet", () => {
    // The dangerous case: an account exists, so a naive check would pass, but
    // the transfer would fail or strand funds on the platform.
    const p = { ...ok, transfersActive: false };
    expect(isPurchasable(p)).toBe(false);
    expect(purchaseBlockedReason(p)).toBe("provider_onboarding_incomplete");
  });

  it("blocks when the association switched purchasing off", () => {
    const p = { ...ok, purchasingEnabled: false };
    expect(isPurchasable(p)).toBe(false);
    expect(purchaseBlockedReason(p)).toBe("purchasing_disabled");
  });

  it("blocks on a null provider", () => {
    expect(isPurchasable(null)).toBe(false);
    expect(purchaseBlockedReason(null)).toBe("category_missing");
  });
});
