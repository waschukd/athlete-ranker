// Real complaint: adding an evaluator to one group of a multi-group session
// block meant repeating "Add" once per later group by hand. This backs the
// "also add them to these later sessions?" prompt in the roster Add picker.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ canManageSessionAssignments: vi.fn() }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageSessionAssignments } from "@/lib/authorize";
import { GET } from "@/app/api/schedule/[scheduleId]/roster/subsequent/route";

function makeReq(userId, kind) {
  return new Request(`http://test/api/schedule/281/roster/subsequent?user_id=${userId}${kind ? `&kind=${kind}` : ""}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ email: "sp@test" });
});

describe("GET /api/schedule/[scheduleId]/roster/subsequent", () => {
  it("400s without a user_id", async () => {
    const res = await GET(new Request("http://test/api/schedule/281/roster/subsequent"), { params: { scheduleId: "281" } });
    expect(res.status).toBe(400);
  });

  it("404s when the anchor session doesn't exist", async () => {
    sql.mockResolvedValueOnce([]);
    const res = await GET(makeReq(143), { params: { scheduleId: "281" } });
    expect(res.status).toBe(404);
  });

  it("403s a caller who can't manage the anchor session", async () => {
    sql.mockResolvedValueOnce([{ id: 281, age_category_id: 90, service_provider_id: null, scheduled_date: "2026-09-14", start_time: "17:30", location: "Sherwood Park Shell", organization_id: 42 }]);
    canManageSessionAssignments.mockResolvedValue({ authorized: false });
    const res = await GET(makeReq(143), { params: { scheduleId: "281" } });
    expect(res.status).toBe(403);
  });

  it("returns [] when the anchor session has no time/location yet", async () => {
    sql.mockResolvedValueOnce([{ id: 281, age_category_id: 90, service_provider_id: null, scheduled_date: null, start_time: null, location: null, organization_id: 42 }]);
    canManageSessionAssignments.mockResolvedValue({ authorized: true });
    const res = await GET(makeReq(143), { params: { scheduleId: "281" } });
    const body = await res.json();
    expect(body.sessions).toEqual([]);
    expect(sql).toHaveBeenCalledTimes(1); // no further query needed
  });

  it("finds later same-category same-rink sessions the person isn't already on, and reports spots_open", async () => {
    sql.mockResolvedValueOnce([{ id: 281, age_category_id: 90, service_provider_id: null, scheduled_date: "2026-09-14", start_time: "17:30", location: "Sherwood Park Shell", organization_id: 42 }]);
    canManageSessionAssignments.mockResolvedValue({ authorized: true });
    sql.mockResolvedValueOnce([
      { id: 282, session_number: 2, group_number: 2, start_time: "18:30", end_time: "19:30", location: "Sherwood Park Shell", required: 4, filled: "3" },
      { id: 283, session_number: 2, group_number: 3, start_time: "19:45", end_time: "20:45", location: "Sherwood Park Shell", required: 4, filled: "4" },
    ]);

    const res = await GET(makeReq(143, "evaluator"), { params: { scheduleId: "281" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0]).toMatchObject({ schedule_id: 282, spots_open: 1 });
    expect(body.sessions[1]).toMatchObject({ schedule_id: 283, spots_open: 0 });

    const query = sql.mock.calls[1][0].join("?");
    expect(query).toContain("evaluator_session_signups");
    expect(query).toMatch(/es\.start_time > \$?\d*/); // parameterized, but the shape is start_time > anchor
  });

  it("falls back to service_provider_id for an SP-owned testing event with no category", async () => {
    sql.mockResolvedValueOnce([{ id: 526, age_category_id: null, service_provider_id: 16, scheduled_date: "2026-09-19", start_time: "17:45", location: "TMW", organization_id: null }]);
    canManageSessionAssignments.mockResolvedValue({ authorized: true });
    sql.mockResolvedValueOnce([]);
    await GET(makeReq(25, "tester"), { params: { scheduleId: "526" } });
    const query = sql.mock.calls[1][0].join("?");
    expect(query).toContain("tester_session_signups");
    expect(query).toContain("es.service_provider_id");
  });
});
