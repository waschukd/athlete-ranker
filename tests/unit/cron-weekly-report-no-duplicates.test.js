// Real incident: the "Your Sessions This Week" evaluator email lived INSIDE
// `for (const admin of admins)` without ever referencing `admin` -- it
// re-ran the same system-wide evalSignups query and re-sent to every
// evaluator once per admin. With 9 admins (the real count from last night's
// daily_staffing_alert log), every evaluator with a session next week would
// have gotten the same email 9 times this Sunday, during the big tryout
// weekend. Moved outside the admin loop to run exactly once.
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/email", () => ({
  emailWeeklyStaffingReport: vi.fn().mockResolvedValue({ ok: true }),
  emailDailyStaffingAlert: vi.fn().mockResolvedValue({ ok: true }),
  sendEmail: vi.fn().mockResolvedValue({ ok: true, id: "em_1" }),
  emailWrapper: (html) => html,
  esc: (v) => String(v ?? ""),
  sleep: vi.fn().mockResolvedValue(),
}));
vi.mock("@/lib/emailLog", () => ({
  ensureEmailLogTable: vi.fn().mockResolvedValue(),
  logEmailSend: vi.fn().mockResolvedValue(),
}));
vi.mock("@/lib/categoryRecipients", () => ({ getCategoryDirectors: vi.fn().mockResolvedValue([]) }));

import sql from "@/lib/db";
import { sendEmail, emailWeeklyStaffingReport } from "@/lib/email";

const ORIGINAL_ENV = process.env.CRON_SECRET;

function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) if (text.includes(match)) return result;
    return [];
  });
}

function makeReq() {
  return new Request("http://test/api/cron?job=weekly_report", {
    headers: { authorization: "Bearer test-secret" },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = "test-secret";
});

afterAll(() => { process.env.CRON_SECRET = ORIGINAL_ENV; });

describe("weekly_report sends each evaluator their schedule exactly once", () => {
  it("does not duplicate the evaluator schedule email per admin", async () => {
    mockSqlByQuery([
      // Two SP/association admins with a contact_email -- this is what drives
      // the outer `for (const admin of admins)` loop.
      ["JOIN organizations o ON o.contact_email = u.email", [
        { email: "admin1@test.com", name: "Admin One", organization_id: 1, org_name: "Org One", type: "association" },
        { email: "admin2@test.com", name: "Admin Two", organization_id: 2, org_name: "Org Two", type: "association" },
      ]],
      // One evaluator signed up for one session this week.
      ["FROM evaluator_session_signups ess", [
        { user_id: 500, email: "eval@test.com", name: "Eval One", scheduled_date: "2026-09-14", start_time: "09:00", end_time: "10:00", location: "Rink A", session_number: 1, group_number: 1, category_name: "U13 AA", org_name: "Org One", org_id: 1 },
      ]],
    ]);

    const { GET } = await import("@/app/api/cron/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);

    // The per-admin weekly staffing report still fires once per admin (2 admins).
    expect(emailWeeklyStaffingReport).toHaveBeenCalledTimes(2);

    // The evaluator's own "Your Sessions This Week" email must fire exactly
    // once, not once per admin (2 admins would mean 2 without the fix).
    const scheduleSends = sendEmail.mock.calls.filter(c => c[1]?.includes("Your Evaluation Schedule"));
    expect(scheduleSends).toHaveLength(1);
    expect(scheduleSends[0][0]).toBe("eval@test.com");
  });
});
