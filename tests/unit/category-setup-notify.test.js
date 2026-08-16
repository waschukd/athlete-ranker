// Regression coverage: changing a session's TYPE (e.g. Scrimmage -> Testing)
// via the category setup wizard must notify everyone attached to it -- same
// reach as an edited/cancelled schedule row (evaluators signed up, the SP +
// its admins, all association admins, category directors). Before this,
// that path was completely silent.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), getAppUserId: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/scheduleNotify", () => ({ notifySessionChange: vi.fn(async () => ({ notified: 3 })) }));

import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { notifySessionChange } from "@/lib/scheduleNotify";

function makeReq(body) {
  return new Request("http://test/api/categories/5/setup", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

// Content-aware mock: inspect the query text rather than relying on strict
// call order, since the sessions case has a variable-length insert/notify loop.
function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) {
      if (text.includes(match)) return typeof result === "function" ? result() : result;
    }
    return [];
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue({ email: "assoc@test", role: "association_admin", name: "Dan" });
  getAppUserId.mockResolvedValue("user1");
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
});

describe("POST /api/categories/[catId]/setup — sessions step notifies on type change", () => {
  it("notifies once per non-cancelled schedule row when a session's type changes on an already-launched category", async () => {
    mockSqlByQuery([
      ["SELECT setup_complete", [{ setup_complete: true, organization_id: 9, created_at: "2026-01-01" }]],
      ["SELECT session_number, session_type FROM category_sessions", [{ session_number: 2, session_type: "scrimmage" }]],
      ["DELETE FROM category_sessions", []],
      ["INSERT INTO category_sessions", []],
      ["SELECT * FROM evaluation_schedule", [{ id: 101, session_number: 2, status: "scheduled" }, { id: 102, session_number: 2, status: "scheduled" }]],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/setup/route");
    const res = await POST(makeReq({
      step: "sessions",
      data: { sessions: [{ session_number: 2, name: "Session 2", session_type: "testing", weight_percentage: 30 }] },
    }), { params: { catId: "5" } });

    expect(res.status).toBe(200);
    expect(notifySessionChange).toHaveBeenCalledTimes(2);
    expect(notifySessionChange).toHaveBeenCalledWith(expect.objectContaining({
      scheduleId: 101,
      changeType: "edited",
      summary: expect.stringContaining("Scrimmage to Testing"),
    }));
  });

  it("does not notify when the type is unchanged", async () => {
    mockSqlByQuery([
      ["SELECT setup_complete", [{ setup_complete: true, organization_id: 9, created_at: "2026-01-01" }]],
      ["SELECT session_number, session_type FROM category_sessions", [{ session_number: 2, session_type: "scrimmage" }]],
      ["DELETE FROM category_sessions", []],
      ["INSERT INTO category_sessions", []],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/setup/route");
    await POST(makeReq({
      step: "sessions",
      data: { sessions: [{ session_number: 2, name: "Session 2", session_type: "scrimmage", weight_percentage: 30 }] },
    }), { params: { catId: "5" } });

    expect(notifySessionChange).not.toHaveBeenCalled();
  });

  it("does not notify during initial setup, before the category is launched", async () => {
    mockSqlByQuery([
      ["SELECT setup_complete", [{ setup_complete: false, organization_id: 9, created_at: "2026-01-01" }]],
      ["DELETE FROM category_sessions", []],
      ["INSERT INTO category_sessions", []],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/setup/route");
    await POST(makeReq({
      step: "sessions",
      data: { sessions: [{ session_number: 1, name: "Session 1", session_type: "testing", weight_percentage: 100 }] },
    }), { params: { catId: "5" } });

    expect(notifySessionChange).not.toHaveBeenCalled();
  });
});
