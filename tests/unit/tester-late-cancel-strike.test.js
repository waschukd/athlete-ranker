// Real incident: two testers (Grayer Conway, Daniella Martorana) cancelled
// last-minute -- one twice, spanning two orgs -- with zero automatic
// consequence, unlike evaluators, who've had a late-cancel strike system
// (evaluator_flags, strike-1 warning, strike-2 auto-suspend) since day one.
// Dan issued both strikes by hand afterward and asked for this to happen
// automatically going forward. Testing slots are harder to backfill than an
// evaluator seat, so the window here is 48 hours instead of the evaluator
// flow's 24.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), getAppUserId: vi.fn() }));
vi.mock("@/lib/testers", () => ({ getSpCapabilities: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true, id: "resend-admin" }),
  esc: (v) => (v == null ? "" : String(v)),
  emailTesterLateCancelStrike: vi.fn().mockResolvedValue({ ok: true, id: "resend-strike" }),
}));
vi.mock("@/lib/emailLog", () => ({
  ensureEmailLogTable: vi.fn().mockResolvedValue(undefined),
  logEmailSend: vi.fn().mockResolvedValue(undefined),
}));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getSpCapabilities } from "@/lib/testers";
import { sendEmail, emailTesterLateCancelStrike } from "@/lib/email";

function makeReq(body) {
  return new Request("http://test/api/tester/sessions", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

// 10 hours out — comfortably inside the 48-hour window regardless of when
// this test actually runs.
function nearSchedule() {
  const dt = new Date(Date.now() + 10 * 60 * 60 * 1000);
  return { date: dt.toISOString().split("T")[0], time: dt.toISOString().split("T")[1].slice(0, 5) };
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
  getSession.mockResolvedValue({ email: "tester@test", role: "service_provider_tester" });
  getSpCapabilities.mockResolvedValue({ isTester: true, userId: 227, testerOrgIds: [16] });
});

describe("POST /api/tester/sessions — late cancel strikes", () => {
  it("cancelling inside 48 hours with no prior strikes issues Strike 1, no suspension", async () => {
    const { date, time } = nearSchedule();
    mockSqlByQuery([
      ["SELECT es.scheduled_date", [{
        scheduled_date: date, start_time: time, session_number: 1, group_number: 1,
        category_name: "U9 House", org_name: "BAHA", assoc_org_id: 37, service_provider_id: null,
      }]],
      ["FROM evaluation_schedule es", [{ id: 1 }]],
      ["SELECT name, email FROM users WHERE id", [{ name: "Grayer Conway", email: "grayerconway0@gmail.com" }]],
      ["FROM evaluator_memberships em", [{ email: "dan@competitivethread.com", name: "Dan" }]],
      ["FROM tester_flags WHERE tester_id", [{ count: "0" }]],
    ]);

    const { POST } = await import("@/app/api/tester/sessions/route");
    const res = await POST(makeReq({ schedule_id: 791, action: "cancel" }));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.warning).toContain("Strike 1");

    expect(emailTesterLateCancelStrike).toHaveBeenCalledTimes(1);
    expect(emailTesterLateCancelStrike.mock.calls[0][0]).toMatchObject({ strikeCount: 1 });

    // Admin gets a strike-1 alert, not a suspension alert.
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][1]).toContain("Strike 1");

    const flagInsert = sql.mock.calls.find(c => c[0].join("?").includes("INSERT INTO tester_flags"));
    expect(flagInsert).toBeTruthy();

    const suspendCall = sql.mock.calls.find(c => c[0].join("?").includes("SET status = 'suspended'") && c[0].join("?").includes("tester_session_signups"));
    expect(suspendCall).toBeFalsy();
  });

  it("a second late cancel suspends the tester from future sessions", async () => {
    const { date, time } = nearSchedule();
    mockSqlByQuery([
      ["SELECT es.scheduled_date", [{
        scheduled_date: date, start_time: time, session_number: 1, group_number: 1,
        category_name: "U9 House", org_name: "BAHA", assoc_org_id: 37, service_provider_id: null,
      }]],
      ["FROM evaluation_schedule es", [{ id: 1 }]],
      ["SELECT name, email FROM users WHERE id", [{ name: "Grayer Conway", email: "grayerconway0@gmail.com" }]],
      ["FROM evaluator_memberships em", [{ email: "dan@competitivethread.com", name: "Dan" }]],
      ["FROM tester_flags WHERE tester_id", [{ count: "1" }]],
    ]);

    const { POST } = await import("@/app/api/tester/sessions/route");
    const res = await POST(makeReq({ schedule_id: 791, action: "cancel" }));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.warning).toContain("suspended");

    expect(emailTesterLateCancelStrike.mock.calls[0][0]).toMatchObject({ strikeCount: 2 });
    expect(sendEmail.mock.calls[0][1]).toContain("Suspended");

    const suspendCall = sql.mock.calls.find(c => c[0].join("?").includes("SET status = 'suspended'") && c[0].join("?").includes("tester_session_signups"));
    expect(suspendCall).toBeTruthy();
  });

  it("cancelling more than 48 hours out does not issue a strike", async () => {
    const dt = new Date(Date.now() + 96 * 60 * 60 * 1000);
    mockSqlByQuery([
      ["SELECT es.scheduled_date", [{
        scheduled_date: dt.toISOString().split("T")[0], start_time: dt.toISOString().split("T")[1].slice(0, 5),
        session_number: 1, group_number: 1, category_name: "U9 House", org_name: "BAHA", assoc_org_id: 37, service_provider_id: null,
      }]],
      ["FROM evaluation_schedule es", [{ id: 1 }]],
      ["SELECT name, email FROM users WHERE id", [{ name: "Daniella Martorana", email: "daniellamartorana86@icloud.com" }]],
      ["FROM evaluator_memberships em", [{ email: "dan@competitivethread.com", name: "Dan" }]],
    ]);

    const { POST } = await import("@/app/api/tester/sessions/route");
    const res = await POST(makeReq({ schedule_id: 791, action: "cancel" }));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.warning).toBeNull();
    expect(emailTesterLateCancelStrike).not.toHaveBeenCalled();
    expect(sendEmail.mock.calls[0][1]).toContain("Tester Cancelled");
  });
});
