// Real gap found in a pre-tryout-weekend security audit: the GET side never
// filtered a goalie-only evaluator's roster to goalies (fixed alongside this),
// but the actual write path had no server-side check either -- the UI never
// shows a goalie evaluator a skater, but nothing stopped a crafted POST from
// submitting a score for one anyway.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => {
  const fn = vi.fn();
  fn.transaction = vi.fn().mockResolvedValue([]);
  return { default: fn };
});
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), getAppUserId: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/categoryEvaluators", () => ({ resolveEvaluatorKind: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ logEvent: vi.fn() }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { resolveEvaluatorKind } from "@/lib/categoryEvaluators";

function makeReq(body) {
  return new Request("http://test/api/evaluator/scores", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

const BODY = {
  athlete_id: "a1", category_id: "cat1", session_number: 2,
  scores: [{ scoring_category_id: "sc1", score: 7 }],
  schedule_id: "sched1",
};

beforeEach(() => {
  vi.clearAllMocks();
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
  getSession.mockResolvedValue({ email: "goalie-eval@test", role: "association_evaluator" });
});

function mockUpToCheckin() {
  sql.mockResolvedValueOnce([{ id: "u1" }]); // getAppUserId
  sql.mockResolvedValueOnce([{ id: "signup1", closed_at: null }]); // evaluator_session_signups
  sql.mockResolvedValueOnce([{ id: "sched1" }]); // schedule belongs to category
  sql.mockResolvedValueOnce([{ id: "checkin1" }]); // athlete checked in
}

describe("POST /api/evaluator/scores — goalie-only evaluator isolation", () => {
  it("403s a goalie evaluator submitting a score for a skater", async () => {
    resolveEvaluatorKind.mockResolvedValue("goalie");
    mockUpToCheckin();
    sql.mockResolvedValueOnce([{ position: "F" }]); // athlete's real position

    const { POST } = await import("@/app/api/evaluator/scores/route");
    const res = await POST(makeReq(BODY));
    expect(res.status).toBe(403);
  });

  it("allows a goalie evaluator to score an actual goalie", async () => {
    resolveEvaluatorKind.mockResolvedValue("goalie");
    mockUpToCheckin();
    sql.mockResolvedValueOnce([{ position: "goalie" }]); // athlete's real position
    sql.mockResolvedValueOnce([{ scoring_scale: 10 }]); // category scale
    sql.mockResolvedValueOnce([]); // existing scores for audit diff
    sql.mockResolvedValueOnce([]); // INSERT INTO category_scores (pushed into txnQueries, not directly awaited)
    sql.mockResolvedValueOnce([]); // signup tracking lookup -- empty skips first-score/hours logic

    const { POST } = await import("@/app/api/evaluator/scores/route");
    const res = await POST(makeReq(BODY));
    expect(res.status).toBe(200);
  });

  it("never touches position for a standard evaluator", async () => {
    resolveEvaluatorKind.mockResolvedValue("standard");
    mockUpToCheckin();
    sql.mockResolvedValueOnce([{ scoring_scale: 10 }]); // category scale
    sql.mockResolvedValueOnce([]); // existing scores for audit diff
    sql.mockResolvedValueOnce([]); // INSERT INTO category_scores (pushed into txnQueries, not directly awaited)
    sql.mockResolvedValueOnce([]); // signup tracking lookup

    const { POST } = await import("@/app/api/evaluator/scores/route");
    const res = await POST(makeReq(BODY));
    expect(res.status).toBe(200);
    const positionQuery = sql.mock.calls.find(c => c[0].join("?").includes("SELECT position FROM athletes"));
    expect(positionQuery).toBeUndefined();
  });
});
