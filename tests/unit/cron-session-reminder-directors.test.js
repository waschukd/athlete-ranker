// New coverage: session_reminder had none before. Also pins the refactor that
// replaced a redundant per-session subquery
// ("WHERE ac.id = (SELECT age_category_id FROM evaluation_schedule ...)")
// with the plain age_category_id already available on the row, routed through
// the shared getCategoryDirectors() -- same result set, one fewer query shape
// to keep in sync with cut/route.js and scheduleNotify.js.

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

import sql from "@/lib/db";
import { sendEmail } from "@/lib/email";

const ORIGINAL_ENV = process.env.CRON_SECRET;

function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) if (text.includes(match)) return result;
    return [];
  });
}

function makeReq() {
  return new Request("http://test/api/cron?job=session_reminder", {
    headers: { authorization: "Bearer test-secret" },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = "test-secret";
});

afterAll(() => { process.env.CRON_SECRET = ORIGINAL_ENV; });

describe("session_reminder notifies the category's directors", () => {
  it("resolves directors from the session's own age_category_id, not a subquery", async () => {
    mockSqlByQuery([
      // admins loop (unrelated to session_reminder) -- empty so it's a no-op.
      ["FROM users u\n      JOIN organizations o ON o.contact_email", []],
      ["FROM evaluation_schedule es", [{ id: 501, age_category_id: 114, session_number: 1, group_number: 2, scheduled_date: "2026-09-02", start_time: "18:00", end_time: "19:00", location: "Rink A", category_name: "U15 AA", org_name: "EFHA" }]],
      ["FROM evaluator_session_signups ess", []],
      ["FROM director_assignments da", [{ email: "director@efha.com", name: "Dana Director" }]],
    ]);

    const { GET } = await import("@/app/api/cron/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);

    const directorQuery = sql.mock.calls.map(c => c[0].join("?")).find(q => q.includes("FROM director_assignments da"));
    // No leftover subquery -- confirms the refactor plumbed age_category_id straight through.
    expect(directorQuery).not.toContain("SELECT age_category_id FROM evaluation_schedule");

    expect(sendEmail).toHaveBeenCalledWith("director@efha.com", expect.stringContaining("U15 AA"), expect.any(String));
  });

  it("sends no director email when the category has none assigned", async () => {
    mockSqlByQuery([
      ["FROM users u\n      JOIN organizations o ON o.contact_email", []],
      ["FROM evaluation_schedule es", [{ id: 501, age_category_id: 114, session_number: 1, group_number: 1, scheduled_date: "2026-09-02", category_name: "U15 AA", org_name: "EFHA" }]],
      ["FROM evaluator_session_signups ess", []],
      ["FROM director_assignments da", []],
    ]);

    const { GET } = await import("@/app/api/cron/route");
    await GET(makeReq());
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
