// Real incident: SEERA U15's testing session (evaluators_required = 0,
// already fully staffed by 5 testers per group) showed up in the weekly
// staffing email as "0/4 unstaffed, evaluators: None" -- `parseInt(0) || 4`
// treated the legitimate 0 as falsy and fell back to the default-required-4
// fallback meant for a genuinely unset value. The dashboard itself already
// excludes testing sessions from evaluator staffing; the report needs to too.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), resolveSpContext: vi.fn() }));
vi.mock("@/lib/email", () => ({
  emailWeeklyStaffingReport: vi.fn().mockResolvedValue({ ok: true }),
  emailDailyStaffingAlert: vi.fn().mockResolvedValue({ ok: true }),
  emailOpenSessionsBlast: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/emailLog", () => ({
  ensureEmailLogTable: vi.fn().mockResolvedValue(undefined),
  logEmailSend: vi.fn().mockResolvedValue(undefined),
}));

import sql from "@/lib/db";
import { getSession, resolveSpContext } from "@/lib/auth";

function makeReq(body) {
  return new Request("http://test/api/service-provider/reports", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

function authOk() {
  getSession.mockResolvedValue({ email: "admin@test", role: "service_provider_admin" });
  resolveSpContext.mockResolvedValue({ orgId: 16, isGoalie: false });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("POST /api/service-provider/reports — get_sessions staffing", () => {
  it("excludes a testing session that needs zero evaluators, even with none signed up", async () => {
    authOk();
    sql.mockImplementation(async (strings) => {
      const text = strings.join("?");
      if (text.includes("SELECT name, email FROM users")) return [{ name: "Admin", email: "admin@test" }];
      if (text.includes("SELECT name FROM organizations")) return [{ name: "Competitive Thread" }];
      if (text.includes("FROM evaluation_schedule es")) {
        return [
          { id: 446, session_number: 1, group_number: 1, scheduled_date: "2026-09-08", start_time: "19:15:00", category_name: "U15", evaluators_required: 0, org_name: "SEERA U15", signed_up: 0, evaluators: null },
          { id: 500, session_number: 2, group_number: 1, scheduled_date: "2026-09-09", start_time: "18:00:00", category_name: "U13 House", evaluators_required: 4, org_name: "BAHA", signed_up: 0, evaluators: null },
        ];
      }
      return [];
    });

    const { POST } = await import("@/app/api/service-provider/reports/route");
    const res = await POST(makeReq({ action: "get_sessions" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].group).toBe("U13 House - Group 1");
    expect(body.sessions[0].required).toBe(4);
    expect(body.sessions.some(s => s.group.startsWith("U15"))).toBe(false);
  });

  it("a real understaffed evaluator session (required 4, 0 signed up) still shows through", async () => {
    authOk();
    sql.mockImplementation(async (strings) => {
      const text = strings.join("?");
      if (text.includes("SELECT name, email FROM users")) return [{ name: "Admin", email: "admin@test" }];
      if (text.includes("SELECT name FROM organizations")) return [{ name: "Competitive Thread" }];
      if (text.includes("FROM evaluation_schedule es")) {
        return [{ id: 500, session_number: 2, group_number: 1, scheduled_date: "2026-09-09", start_time: "18:00:00", category_name: "U13 House", evaluators_required: 4, org_name: "BAHA", signed_up: 0, evaluators: null }];
      }
      return [];
    });

    const { POST } = await import("@/app/api/service-provider/reports/route");
    const res = await POST(makeReq({ action: "get_sessions" }));
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({ required: 4, signed_up: 0 });
  });
});
