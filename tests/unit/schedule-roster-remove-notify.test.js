// Removing someone from a session's roster (admin action) previously told no
// one -- they'd just discover their spot was gone, or worse, never notice and
// show up anyway. DELETE must now email the removed person.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), getAppUserId: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ canManageSessionAssignments: vi.fn() }));
vi.mock("@/lib/sessionRoster", () => ({ eligiblePeople: vi.fn(async () => []), eligibilityOf: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ ok: true })), emailWrapper: (s) => s, esc: (s) => s }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageSessionAssignments } from "@/lib/authorize";
import { sendEmail } from "@/lib/email";

function makeReq(body) {
  return new Request("http://test/api/schedule/156/roster", {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
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
  vi.resetAllMocks();
  getSession.mockResolvedValue({ email: "sp@test" });
  canManageSessionAssignments.mockResolvedValue({ authorized: true, reason: "lead" });
});

describe("DELETE /api/schedule/[scheduleId]/roster", () => {
  it("emails the removed evaluator with session details", async () => {
    mockSqlByQuery([
      ["FROM evaluation_schedule es", [{
        id: 156, age_category_id: 43, session_number: 2, group_number: 1,
        scheduled_date: "2026-08-25T06:00:00.000Z", start_time: "17:45:00", location: "SHERWOOD PK SHELL",
        organization_id: 29, category_name: "U11 Jr Kings", org_name: "SPS Fuzion", session_type: "testing",
      }]],
      ["UPDATE evaluator_session_signups", []],
      ["SELECT email, name FROM users", [{ email: "grant@test.com", name: "Grant McNeill" }]],
    ]);

    const { DELETE } = await import("@/app/api/schedule/[scheduleId]/roster/route");
    const res = await DELETE(makeReq({ user_id: 114, kind: "evaluator" }), { params: { scheduleId: "156" } });

    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendEmail.mock.calls[0];
    expect(to).toBe("grant@test.com");
    expect(subject).toMatch(/Removed from a session/);
    expect(html).toContain("U11 Jr Kings");
  });

  it("does not throw if the removed user has no email on file", async () => {
    mockSqlByQuery([
      ["FROM evaluation_schedule es", [{
        id: 156, age_category_id: 43, session_number: 2, group_number: 1,
        scheduled_date: "2026-08-25T06:00:00.000Z", start_time: "17:45:00", location: "SHERWOOD PK SHELL",
        organization_id: 29, category_name: "U11 Jr Kings", org_name: "SPS Fuzion", session_type: "testing",
      }]],
      ["UPDATE evaluator_session_signups", []],
      ["SELECT email, name FROM users", [{ email: null, name: "Ghost" }]],
    ]);

    const { DELETE } = await import("@/app/api/schedule/[scheduleId]/roster/route");
    const res = await DELETE(makeReq({ user_id: 999, kind: "evaluator" }), { params: { scheduleId: "156" } });

    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
