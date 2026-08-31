// Being ADDED to a session's roster (admin assigning an evaluator or tester)
// previously told no one -- same gap as removal had, just uncaught until now.
// POST must email the person who was just placed, for BOTH kinds -- testing
// included, which is the exact case that surfaced this (Wilson assigned to a
// testing session, never notified).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), getAppUserId: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ canManageSessionAssignments: vi.fn() }));
vi.mock("@/lib/sessionRoster", () => ({ eligiblePeople: vi.fn(async () => []), eligibilityOf: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ ok: true })), emailWrapper: (s) => s, esc: (s) => s }));

import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";
import { canManageSessionAssignments } from "@/lib/authorize";
import { eligibilityOf } from "@/lib/sessionRoster";
import { sendEmail } from "@/lib/email";

function makeReq(body) {
  return new Request("http://test/api/schedule/156/roster", {
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
  vi.resetAllMocks();
  getSession.mockResolvedValue({ email: "sp@test" });
  getAppUserId.mockResolvedValue(1);
  canManageSessionAssignments.mockResolvedValue({ authorized: true, reason: "sp_admin" });
});

describe("POST /api/schedule/[scheduleId]/roster", () => {
  it("emails a newly-assigned TESTER — the exact gap that surfaced this (SP-owned testing event, no category)", async () => {
    eligibilityOf.mockResolvedValue({ evaluator: false, tester: true });
    mockSqlByQuery([
      ["FROM evaluation_schedule es", [{
        id: 156, age_category_id: null, session_number: 1, group_number: null,
        scheduled_date: "2026-09-03T06:00:00.000Z", start_time: "17:30:00", location: "SSA",
        organization_id: null, service_provider_id: 16, category_name: null, org_name: null, session_type: "testing",
      }]],
      ["SELECT id, status FROM tester_session_signups", []],
      ["INSERT INTO tester_session_signups", []],
      ["SELECT name FROM organizations", [{ name: "Competitive Thread" }]],
      ["SELECT email, name FROM users", [{ email: "wilson@test.com", name: "Wilson" }]],
    ]);

    const { POST } = await import("@/app/api/schedule/[scheduleId]/roster/route");
    const res = await POST(makeReq({ user_id: 200, kind: "tester" }), { params: { scheduleId: "156" } });

    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendEmail.mock.calls[0];
    expect(to).toBe("wilson@test.com");
    expect(subject).toMatch(/Added to a session/);
    // No age_category_id -> no category_name, so the copy must fall back to
    // naming the session type AND the owning SP (not read blank, which it
    // did before sessionOrgName existed).
    expect(html).toContain("a testing session");
    expect(html).toContain("Competitive Thread");
  });

  it("emails a newly-assigned evaluator on an association-owned session", async () => {
    eligibilityOf.mockResolvedValue({ evaluator: true, tester: false });
    mockSqlByQuery([
      ["FROM evaluation_schedule es", [{
        id: 156, age_category_id: 43, session_number: 2, group_number: 1,
        scheduled_date: "2026-08-25T06:00:00.000Z", start_time: "17:45:00", location: "SHERWOOD PK SHELL",
        organization_id: 29, category_name: "U11 Jr Kings", org_name: "SPS Fuzion", session_type: "scrimmage",
      }]],
      ["SELECT id, status FROM evaluator_session_signups", []],
      ["INSERT INTO evaluator_session_signups", []],
      ["SELECT email, name FROM users", [{ email: "grant@test.com", name: "Grant McNeill" }]],
    ]);

    const { POST } = await import("@/app/api/schedule/[scheduleId]/roster/route");
    const res = await POST(makeReq({ user_id: 114, kind: "evaluator" }), { params: { scheduleId: "156" } });

    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendEmail.mock.calls[0];
    expect(to).toBe("grant@test.com");
    expect(subject).toMatch(/Added to a session/);
    expect(html).toContain("U11 Jr Kings");
  });

  it("does not re-notify or re-insert someone already actively signed up", async () => {
    eligibilityOf.mockResolvedValue({ evaluator: true, tester: false });
    mockSqlByQuery([
      ["FROM evaluation_schedule es", [{
        id: 156, age_category_id: 43, organization_id: 29, category_name: "U11 Jr Kings", org_name: "SPS Fuzion",
      }]],
      ["SELECT id, status FROM evaluator_session_signups", [{ id: 9, status: "signed_up" }]],
    ]);

    const { POST } = await import("@/app/api/schedule/[scheduleId]/roster/route");
    const res = await POST(makeReq({ user_id: 114, kind: "evaluator" }), { params: { scheduleId: "156" } });
    const data = await res.json();

    expect(data.alreadyOn).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not throw if the newly-assigned user has no email on file", async () => {
    eligibilityOf.mockResolvedValue({ evaluator: true, tester: false });
    mockSqlByQuery([
      ["FROM evaluation_schedule es", [{
        id: 156, age_category_id: 43, organization_id: 29, category_name: "U11 Jr Kings", org_name: "SPS Fuzion",
      }]],
      ["SELECT id, status FROM evaluator_session_signups", []],
      ["INSERT INTO evaluator_session_signups", []],
      ["SELECT email, name FROM users", [{ email: null, name: "Ghost" }]],
    ]);

    const { POST } = await import("@/app/api/schedule/[scheduleId]/roster/route");
    const res = await POST(makeReq({ user_id: 999, kind: "evaluator" }), { params: { scheduleId: "156" } });

    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
