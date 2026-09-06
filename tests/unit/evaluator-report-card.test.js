// Self-service version of the SP-facing report card -- an evaluator asked
// for this to be visible on their own dashboard instead of only arriving by
// email when an admin gets around to sending it.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/evaluatorScorecard", () => ({ computeEvaluatorReportCard: vi.fn() }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { computeEvaluatorReportCard } from "@/lib/evaluatorScorecard";

beforeEach(() => { vi.clearAllMocks(); });

describe("GET /api/evaluator/report-card", () => {
  it("401 with no session", async () => {
    getSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/evaluator/report-card/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns applicable:false when there's no scoring history yet", async () => {
    getSession.mockResolvedValue({ email: "new@test" });
    sql.mockResolvedValueOnce([{ id: 227 }]);
    computeEvaluatorReportCard.mockResolvedValue({ agreementPct: null, judged: 0, bias: null });
    const { GET } = await import("@/app/api/evaluator/report-card/route");
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ applicable: false });
  });

  it("returns this evaluator's own numbers, never someone else's", async () => {
    getSession.mockResolvedValue({ email: "sara@test" });
    sql.mockResolvedValueOnce([{ id: 143 }]);
    computeEvaluatorReportCard.mockResolvedValue({ agreementPct: 83, judged: 680, bias: -0.3 });
    const { GET } = await import("@/app/api/evaluator/report-card/route");
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ applicable: true, agreement_pct: 83, judged: 680, bias: -0.3 });
    expect(computeEvaluatorReportCard).toHaveBeenCalledWith(143);
  });
});
