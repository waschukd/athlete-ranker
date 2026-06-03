// Unit tests for the check-in route's new add_existing / find_existing actions.
// sql + getSession + next/headers are mocked so no live DB is needed, mirroring
// tests/unit/authz_idor.test.js.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
  signToken: vi.fn(),
  verifyToken: vi.fn(),
  getCurrentUser: vi.fn(),
  getAppUserId: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-checkin-suite";

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

// A super_admin session makes authorizeCheckin pass with two sql round-trips:
//   call 1: SELECT age_category_id FROM evaluation_schedule  (authorizeCheckin)
//   call 2: SELECT organization_id FROM age_categories       (authorizeCategoryAccess, super_admin branch)
function mockAuthPass(ageCategoryId = "catX") {
  getSession.mockResolvedValue({ email: "root@test", role: "super_admin" });
  sql.mockResolvedValueOnce([{ age_category_id: ageCategoryId }]); // call 1
  sql.mockResolvedValueOnce([{ organization_id: "orgX" }]);        // call 2
}

function makeReq(body) {
  return new Request("http://test/api/checkin/sched1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("add_existing", () => {
  it("rejects an athlete from a different age category with 403 and no writes", async () => {
    mockAuthPass("catX");
    // athlete lookup returns a DIFFERENT category → guard must fire
    sql.mockResolvedValueOnce([{ id: "ath9", age_category_id: "catOTHER" }]); // call 3

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "add_existing", athlete_id: "ath9" }), {
      params: { scheduleId: "sched1" },
    });

    expect(res.status).toBe(403);
    // exactly 3 sql calls: auth(2) + athlete lookup(1). No insert/upsert ran.
    expect(sql.mock.calls.length).toBe(3);
  });

  it("checks in an existing same-category athlete and upserts player_checkins", async () => {
    mockAuthPass("catX");
    sql.mockResolvedValueOnce([{ id: "ath9", age_category_id: "catX" }]); // athlete lookup (match)
    sql.mockResolvedValueOnce([{ session_number: 1, group_number: 1 }]);  // schedInfo
    sql.mockResolvedValueOnce([{ id: "sg1" }]);                            // session_groups
    sql.mockResolvedValueOnce([]);                                        // player_group_assignments insert
    sql.mockResolvedValueOnce([{ id: "cs1" }]);                           // checkin_sessions
    sql.mockResolvedValueOnce([]);                                        // player_checkins upsert

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "add_existing", athlete_id: "ath9" }), {
      params: { scheduleId: "sched1" },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    // The player_checkins upsert must have run with checked_in = true.
    const ran = sql.mock.calls.map(c => c[0].join("?"));
    expect(ran.some(s => s.includes("INTO player_checkins") && s.includes("checked_in"))).toBe(true);
  });
});
