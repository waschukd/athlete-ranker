// Real incident: an SP admin discovered the app's "agreement" number was
// computed from raw point-closeness, which called an evaluator with a real
// consensus-review problem "consistent." Fixed the math (see scoring.test.js
// tierDisagreementStats) and added a way to send each evaluator their own
// corrected numbers directly, as coaching -- "you're higher/lower than
// everyone, we're trying to see the same thing."
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), resolveSpContext: vi.fn() }));
vi.mock("@/lib/evaluatorScorecard", () => ({ computeEvaluatorReportCard: vi.fn() }));
vi.mock("@/lib/email", () => ({ emailEvaluatorReportCard: vi.fn() }));
vi.mock("@/lib/emailLog", () => ({
  ensureEmailLogTable: vi.fn().mockResolvedValue(undefined),
  logEmailSend: vi.fn().mockResolvedValue(undefined),
}));

import sql from "@/lib/db";
import { getSession, resolveSpContext } from "@/lib/auth";
import { computeEvaluatorReportCard } from "@/lib/evaluatorScorecard";
import { emailEvaluatorReportCard } from "@/lib/email";
import { logEmailSend } from "@/lib/emailLog";

function makeReq(body) {
  return new Request("http://test/api/service-provider/evaluators?org=sp1", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) if (text.includes(match)) return result;
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ email: "spadmin@test", role: "service_provider_admin" });
  resolveSpContext.mockResolvedValue({ orgId: 16, isGoalie: false, type: "service_provider" });
});

describe("POST /api/service-provider/evaluators — send_report_card", () => {
  it("emails each evaluator their real numbers and logs the send", async () => {
    mockSqlByQuery([
      ["SELECT id FROM users WHERE email", [{ id: 999 }]], // admin lookup
      ["FROM evaluator_memberships WHERE user_id = ", [{ id: 1 }]], // membership guard
      ["FROM organizations WHERE id", [{ name: "Competitive Thread" }]],
      ["SELECT name, email FROM users WHERE id", [{ name: "Sara Diamond", email: "sara@test.com" }]],
    ]);
    computeEvaluatorReportCard.mockResolvedValue({ agreementPct: 83, judged: 680, bias: -0.3 });
    emailEvaluatorReportCard.mockResolvedValue({ ok: true, id: "resend-1" });

    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "send_report_card", evaluator_ids: [143] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, sent: 1, skipped: 0 });

    expect(computeEvaluatorReportCard).toHaveBeenCalledWith(143);
    expect(emailEvaluatorReportCard).toHaveBeenCalledWith(expect.objectContaining({
      name: "Sara Diamond", email: "sara@test.com", agreementPct: 83, judged: 680, bias: -0.3,
    }));
    expect(logEmailSend).toHaveBeenCalledWith(expect.objectContaining({ emailType: "evaluator_report_card", status: "sent" }));
  });

  it("skips an evaluator who doesn't belong to this SP (IDOR guard)", async () => {
    mockSqlByQuery([
      ["SELECT id FROM users WHERE email", [{ id: 999 }]],
      ["FROM evaluator_memberships WHERE user_id = ", []], // no membership → not this SP's evaluator
    ]);
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "send_report_card", evaluator_ids: [42] }));
    const body = await res.json();
    expect(body).toMatchObject({ success: true, sent: 0, skipped: 1 });
    expect(computeEvaluatorReportCard).not.toHaveBeenCalled();
    expect(emailEvaluatorReportCard).not.toHaveBeenCalled();
  });

  it("400s with no evaluator ids", async () => {
    mockSqlByQuery([["SELECT id FROM users WHERE email", [{ id: 999 }]]]);
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "send_report_card", evaluator_ids: [] }));
    expect(res.status).toBe(400);
  });
});
