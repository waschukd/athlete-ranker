// Real incident: an SP admin (Dan) asked "did a tester remove their name
// from today's EFHA sessions? I did not get a notification" -- and yes, one
// had. Root cause: a tester's self-cancel never notified anyone, unlike an
// evaluator's self-cancel (evaluator/signup/route.js), which has emailed the
// SP admin on every cancel from day one. A vacated testing spot needs to be
// filled the same way an evaluator spot does.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), getAppUserId: vi.fn() }));
vi.mock("@/lib/testers", () => ({ getSpCapabilities: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true, id: "resend-1" }),
  esc: (v) => (v == null ? "" : String(v)),
}));
vi.mock("@/lib/emailLog", () => ({
  ensureEmailLogTable: vi.fn().mockResolvedValue(undefined),
  logEmailSend: vi.fn().mockResolvedValue(undefined),
}));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getSpCapabilities } from "@/lib/testers";
import { sendEmail } from "@/lib/email";
import { logEmailSend } from "@/lib/emailLog";

function makeReq(body) {
  return new Request("http://test/api/tester/sessions", {
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
  getSession.mockResolvedValue({ email: "donny@test", role: "service_provider_evaluator" });
  getSpCapabilities.mockResolvedValue({ isTester: true, userId: 137, testerOrgIds: [16] });
});

describe("POST /api/tester/sessions — cancel notifies the SP admin", () => {
  it("emails every SP admin when a tester cancels", async () => {
    mockSqlByQuery([
      // Order matters: mockSqlByQuery takes the FIRST substring match, and
      // the schedule-info lookup below also contains "FROM evaluation_schedule
      // es" -- its more specific match must be checked first.
      ["SELECT es.scheduled_date", [{
        scheduled_date: "2026-09-05T06:00:00.000Z", session_number: 1, group_number: 1,
        category_name: "U11", org_name: "EFHA", assoc_org_id: 49, service_provider_id: null,
      }]],
      ["FROM evaluation_schedule es", [{ id: 1 }]],                       // signup POST guard (scoped to tester's SP)
      ["UPDATE tester_session_signups", []],
      ["SELECT name, email FROM users WHERE id", [{ name: "Donny Milburn", email: "donny@test" }]],
      ["FROM evaluator_memberships em", [
        { email: "dan@competitivethread.com", name: "Dan" },
      ]],
    ]);

    const { POST } = await import("@/app/api/tester/sessions/route");
    const res = await POST(makeReq({ schedule_id: 791, action: "cancel" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendEmail.mock.calls[0];
    expect(to).toBe("dan@competitivethread.com");
    expect(subject).toContain("Tester Cancelled");
    expect(subject).toContain("Donny Milburn");
    expect(html).toContain("EFHA");
    expect(logEmailSend).toHaveBeenCalledWith(expect.objectContaining({ emailType: "tester_cancelled_admin_alert" }));
  });

  it("still succeeds even if the admin-notify step fails", async () => {
    sql.mockImplementation(async (strings) => {
      const text = strings.join("?");
      if (text.includes("SELECT es.scheduled_date")) throw new Error("boom");
      if (text.includes("FROM evaluation_schedule es")) return [{ id: 1 }];
      return [];
    });

    const { POST } = await import("@/app/api/tester/sessions/route");
    const res = await POST(makeReq({ schedule_id: 791, action: "cancel" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
