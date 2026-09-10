// Real complaint: clicking an evaluator's name already shows their whole
// session history -- testers had no equivalent. This backs
// /service-provider/tester/[testerId], the tester-side counterpart.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ canViewEvaluator: vi.fn() }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canViewEvaluator } from "@/lib/authorize";
import { GET } from "@/app/api/service-provider/tester/[testerId]/route";

function makeReq() {
  return new Request("http://test/api/service-provider/tester/143");
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ email: "sp@test", role: "service_provider_admin" });
});

describe("GET /api/service-provider/tester/[testerId]", () => {
  it("401s an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(makeReq(), { params: { testerId: "143" } });
    expect(res.status).toBe(401);
  });

  it("403s a caller who can't view this person -- reuses canViewEvaluator despite the name", async () => {
    canViewEvaluator.mockResolvedValue(false);
    const res = await GET(makeReq(), { params: { testerId: "143" } });
    expect(res.status).toBe(403);
    expect(canViewEvaluator).toHaveBeenCalledWith(expect.anything(), "143");
    expect(sql).not.toHaveBeenCalled();
  });

  it("404s when the person doesn't exist", async () => {
    canViewEvaluator.mockResolvedValue(true);
    sql.mockResolvedValueOnce([]); // tester lookup
    const res = await GET(makeReq(), { params: { testerId: "143" } });
    expect(res.status).toBe(404);
  });

  it("returns session history and hours stats for both association testing sessions and SP-owned events", async () => {
    canViewEvaluator.mockResolvedValue(true);
    sql.mockResolvedValueOnce([{ id: 143, name: "Sara Diamond", email: "sara@test.com" }]); // tester
    sql.mockResolvedValueOnce([
      {
        id: 1, status: "signed_up", schedule_id: 526, scheduled_date: "2026-09-10",
        start_time: "17:45", end_time: "18:45", session_number: 1, group_number: 1, location: "TMW",
        category_name: "U13 House", org_name: "Competitive Thread", session_type: "testing",
        hours_worked: "1.0", hours_status: "approved",
      },
      {
        id: 2, status: "cancelled", schedule_id: 620, scheduled_date: "2026-09-05",
        start_time: "18:00", end_time: "19:00", session_number: 2, group_number: 4, location: "BHA",
        category_name: "U15 Community", org_name: "Edmonton Female Hockey Alliance", session_type: "testing",
        hours_worked: null, hours_status: null,
      },
    ]);

    const res = await GET(makeReq(), { params: { testerId: "143" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tester.name).toBe("Sara Diamond");
    expect(body.sessions).toHaveLength(2);
    expect(body.stats.total_sessions).toBe(1); // only the signed_up one
    expect(body.stats.cancelled_sessions).toBe(1);
    expect(body.stats.total_hours).toBe(1);
    expect(body.stats.approved_hours).toBe(1);
    expect(body.stats.pending_hours).toBe(0);
  });
});
