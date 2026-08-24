import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAppUserId: vi.fn() }));

import sql from "@/lib/db";
import { getAppUserId } from "@/lib/auth";
import { getSpCapabilities } from "@/lib/testers";

describe("getSpCapabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all-false capabilities when there's no app user", async () => {
    getAppUserId.mockResolvedValue(null);
    const cap = await getSpCapabilities({ email: "nobody@test.com" });
    expect(cap).toEqual({ userId: null, isTester: false, isEvaluator: false, testerOrgIds: [], evaluatorOrgIds: [], spOrgIds: [] });
  });

  // Regression: a direct/coach evaluator's membership lives on the
  // ASSOCIATION's own org (type 'association'), never an SP org. An earlier
  // version of this query filtered to service_provider/goalie_service_provider
  // org types, which silently dropped every such evaluator's is_evaluator flag
  // and left them stuck on "My Sessions (0) / Available (0)".
  it("recognizes is_evaluator on a direct association-org membership (no SP involved)", async () => {
    getAppUserId.mockResolvedValue("user1");
    sql.mockResolvedValueOnce([{ organization_id: "assoc1", is_tester: false, is_evaluator: true }]);
    const cap = await getSpCapabilities({ email: "coach@test.com" });
    expect(cap.isEvaluator).toBe(true);
    expect(cap.evaluatorOrgIds).toEqual(["assoc1"]);
    expect(cap.isTester).toBe(false);
  });

  it("recognizes is_tester on an SP-org membership", async () => {
    getAppUserId.mockResolvedValue("user1");
    sql.mockResolvedValueOnce([{ organization_id: "sp1", is_tester: true, is_evaluator: false }]);
    const cap = await getSpCapabilities({ email: "tester@test.com" });
    expect(cap.isTester).toBe(true);
    expect(cap.testerOrgIds).toEqual(["sp1"]);
    expect(cap.isEvaluator).toBe(false);
  });

  it("supports someone who is both a tester (SP org) and an evaluator (association org)", async () => {
    getAppUserId.mockResolvedValue("user1");
    sql.mockResolvedValueOnce([
      { organization_id: "sp1", is_tester: true, is_evaluator: false },
      { organization_id: "assoc1", is_tester: false, is_evaluator: true },
    ]);
    const cap = await getSpCapabilities({ email: "both@test.com" });
    expect(cap.isTester).toBe(true);
    expect(cap.isEvaluator).toBe(true);
    expect(cap.testerOrgIds).toEqual(["sp1"]);
    expect(cap.evaluatorOrgIds).toEqual(["assoc1"]);
  });
});
