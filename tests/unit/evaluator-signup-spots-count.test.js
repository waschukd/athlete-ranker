// Real incident: an evaluator (Justin Richards) was fully removed from the
// pool via scripts/remove-evaluator.mjs, which sets his signup to 'released'
// rather than 'cancelled' (that status is reserved for the evaluator
// withdrawing themselves). The signed_up_count query behind the "No spots
// available" gate filtered on status != 'cancelled', which let 'released'
// (and 'suspended', the 2-strike auto-suspension) count against the cap --
// a session with a real open spot could refuse new signups because a
// removed evaluator's phantom row was still occupying it.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

function makeReq(body) {
  return new Request("http://test/api/evaluator/signup", {
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
  getSession.mockResolvedValue({ email: "eval@test" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
});

describe("POST /api/evaluator/signup — signed_up_count query", () => {
  it("counts by status = 'signed_up', not != 'cancelled'", async () => {
    mockSqlByQuery([
      ["SELECT id FROM users WHERE email", [{ id: 500 }]],
      ["SELECT age_category_id FROM evaluation_schedule WHERE id", [{ age_category_id: 90 }]],
      ["FROM evaluation_schedule sch", [{ id: 736, age_category_id: 90, evaluators_required: 3, signed_up_count: "1", start_time: null, end_time: null, scheduled_date: "2026-09-12" }]],
      ["FROM category_evaluators", []], // coachRow -- not a coach
    ]);

    const { POST } = await import("@/app/api/evaluator/signup/route");
    await POST(makeReq({ schedule_id: 736, action: "signup" }));

    const scheduleInfoQuery = sql.mock.calls.map(c => c[0].join("?")).find(q => q.includes("FROM evaluation_schedule sch"));
    expect(scheduleInfoQuery).toMatch(/status = 'signed_up'/);
    expect(scheduleInfoQuery).not.toMatch(/status != 'cancelled'/);
  });

  it("lets a signup through when the real count (excluding a removed evaluator) is under the cap", async () => {
    // 2 real signed-up evaluators, cap of 3 -- one spot open, even though a
    // 3rd person's row exists on the schedule with status 'released'.
    mockSqlByQuery([
      ["SELECT id FROM users WHERE email", [{ id: 500 }]],
      ["SELECT age_category_id FROM evaluation_schedule WHERE id", [{ age_category_id: 90 }]],
      ["FROM evaluation_schedule sch", [{ id: 736, age_category_id: 90, evaluators_required: 3, signed_up_count: "2", start_time: null, end_time: null, scheduled_date: "2026-09-12" }]],
      ["FROM category_evaluators", []],
      ["INSERT INTO evaluator_session_signups", []],
      ["INSERT INTO audit_log", []],
      ["FROM age_categories ac", [{ category_name: "U11", org_name: "Confederation" }]],
      ["SELECT name, email FROM users WHERE id", [{ name: "Reed", email: "reed@test.com" }]],
    ]);

    const { POST } = await import("@/app/api/evaluator/signup/route");
    const res = await POST(makeReq({ schedule_id: 736, action: "signup" }));
    const body = await res.json();
    expect(body.error).not.toBe("No spots available");
  });
});
