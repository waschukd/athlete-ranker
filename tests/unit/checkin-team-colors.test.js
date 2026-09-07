// Manage Groups now offers the same "jersey colours" picker check-in does,
// writing to the same checkin_sessions row via this same action -- so a
// director can decide Red/Blue ahead of time instead of only at the door.
// The wrinkle: Manage Groups can call this BEFORE check-in has ever been
// opened for that schedule, when no checkin_sessions row exists yet. This
// used to 404 ("No check-in session"); it now creates the row instead, so
// both flows land on the same state either way.
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

function mockAuthPass(ageCategoryId = "catX") {
  getSession.mockResolvedValue({ email: "root@test", role: "super_admin" });
  sql.mockResolvedValueOnce([{ age_category_id: ageCategoryId }]); // authorizeCheckin
  sql.mockResolvedValueOnce([{ organization_id: "orgX" }]);        // authorizeCategoryAccess (super_admin)
}

function makeReq(body) {
  return new Request("http://test/api/checkin/sched1", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("set_team_colors", () => {
  it("creates a checkin_sessions row when none exists yet, instead of 404ing", async () => {
    mockAuthPass("cat42");
    sql.mockResolvedValueOnce([]); // SELECT checkin_sessions -- none yet

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "set_team_colors", team_colors: ["Green", "Purple"] }), {
      params: { scheduleId: "sched1" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.team_colors.map(c => c.name)).toEqual(["Green", "Purple"]);

    const insertCall = sql.mock.calls.find(c => c[0].join("?").includes("INSERT INTO checkin_sessions"));
    expect(insertCall).toBeTruthy();
    // schedule_id, age_category_id, team_colors -- age_category_id comes from
    // the auth check, not the request body, so it can't be spoofed.
    expect(insertCall[2]).toBe("cat42");
  });

  it("updates the existing row in place when one is already there", async () => {
    mockAuthPass("cat42");
    sql.mockResolvedValueOnce([{ id: 1, team_colors: '["Red","Blue"]' }]); // existing row
    sql.mockResolvedValueOnce([]); // UPDATE checkin_sessions
    sql.mockResolvedValueOnce([]); // remap: Red -> White
    sql.mockResolvedValueOnce([]); // remap: Blue -> Black

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "set_team_colors", team_colors: ["White", "Black"] }), {
      params: { scheduleId: "sched1" },
    });

    expect(res.status).toBe(200);
    expect(sql.mock.calls.some(c => c[0].join("?").includes("INSERT INTO checkin_sessions"))).toBe(false);
    expect(sql.mock.calls.some(c => c[0].join("?").includes("UPDATE checkin_sessions"))).toBe(true);
  });

  it("still rejects fewer than two colours", async () => {
    mockAuthPass("cat42");
    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "set_team_colors", team_colors: ["Red"] }), {
      params: { scheduleId: "sched1" },
    });
    expect(res.status).toBe(400);
  });
});
