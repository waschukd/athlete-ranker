// Real complaint: too many evaluators take the convenient slot and skip a
// harder one later the same day, with no quick way to check. This endpoint
// backs "click a name in Who's on this session -> see their whole day."
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ canManageSessionAssignments: vi.fn() }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageSessionAssignments } from "@/lib/authorize";
import { GET } from "@/app/api/schedule/[scheduleId]/roster/day/route";

function makeReq(userId) {
  return new Request(`http://test/api/schedule/450/roster/day?user_id=${userId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ email: "sp@test" });
});

describe("GET /api/schedule/[scheduleId]/roster/day", () => {
  it("401s an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(makeReq(143), { params: { scheduleId: "450" } });
    expect(res.status).toBe(401);
  });

  it("400s without a user_id", async () => {
    const res = await GET(new Request("http://test/api/schedule/450/roster/day"), { params: { scheduleId: "450" } });
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("404s when the anchor session doesn't exist", async () => {
    sql.mockResolvedValueOnce([]); // loadSession
    const res = await GET(makeReq(143), { params: { scheduleId: "450" } });
    expect(res.status).toBe(404);
  });

  it("403s a caller who can't manage the anchor session", async () => {
    sql.mockResolvedValueOnce([{ id: 450, scheduled_date: "2026-09-14", service_provider_id: null, organization_id: 42 }]);
    canManageSessionAssignments.mockResolvedValue({ authorized: false });
    const res = await GET(makeReq(143), { params: { scheduleId: "450" } });
    expect(res.status).toBe(403);
    expect(canManageSessionAssignments).toHaveBeenCalledWith(expect.anything(), 42);
  });

  it("falls back to the owning SP for an SP-owned testing event with no association org", async () => {
    sql.mockResolvedValueOnce([{ id: 526, scheduled_date: "2026-09-19", service_provider_id: 16, organization_id: null }]);
    canManageSessionAssignments.mockResolvedValue({ authorized: true });
    sql.mockResolvedValueOnce([{ name: "Dan", email: "dan@competitivethread.com" }]); // person
    sql.mockResolvedValueOnce([]); // sessions
    await GET(makeReq(25), { params: { scheduleId: "526" } });
    expect(canManageSessionAssignments).toHaveBeenCalledWith(expect.anything(), 16);
  });

  it("returns the person's whole day across both evaluator and tester signups, ordered by time", async () => {
    sql.mockResolvedValueOnce([{ id: 450, scheduled_date: "2026-09-14", service_provider_id: null, organization_id: 42 }]);
    canManageSessionAssignments.mockResolvedValue({ authorized: true });
    sql.mockResolvedValueOnce([{ name: "Sara Diamond", email: "sara@test.com" }]); // person
    sql.mockResolvedValueOnce([
      { id: 281, start_time: "17:30", end_time: "18:30", location: "Sherwood Park Shell", session_number: 2, group_number: 1, role: "evaluator", label: "U11", org_name: "SPS Fuzion" },
      { id: 450, start_time: "18:00", end_time: "19:00", location: "MWB", session_number: 4, group_number: 1, role: "evaluator", label: "U15", org_name: "SEERA U15" },
    ]); // sessions

    const res = await GET(makeReq(143), { params: { scheduleId: "450" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.name).toBe("Sara Diamond");
    expect(body.this_schedule_id).toBe(450);
    expect(body.sessions).toHaveLength(2);

    const sessionsQuery = sql.mock.calls[2][0].join("?");
    expect(sessionsQuery).toContain("evaluator_session_signups");
    expect(sessionsQuery).toContain("tester_session_signups");
    expect(sessionsQuery).toMatch(/status = 'signed_up'/);
  });
});
