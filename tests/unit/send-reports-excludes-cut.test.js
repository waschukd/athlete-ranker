// Real gap: a player cut from a category (moved to another tier, or
// released) stays active + visible in their OLD category on purpose, so
// their real scores keep showing in that division's own ranking (see
// categories/[catId]/cut/route.js). Every other roster-facing notification
// query in this codebase (notify-parents, checkin-summary, scrimmage-teams,
// team rosters) already excludes cut_at IS NOT NULL players -- send-reports
// was the one place that never got that same treatment, meaning a director
// blasting report-purchase emails to a whole category's parents would also
// reach a family whose kid has since moved to (or been released from) that
// tier, offering them a report for a division they're no longer part of.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendParentReportEmail: vi.fn(async () => ({ ok: true, id: "email-1" })), parentEmails: (a) => [a.parent_email].filter(Boolean) }));
vi.mock("@/lib/emailLog", () => ({ ensureEmailLogTable: vi.fn(), logEmailSend: vi.fn() }));
vi.mock("@/lib/reportProvider", () => ({ resolveReportPrice: vi.fn(async () => ({ priceCents: 3499 })) }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { sendParentReportEmail } from "@/lib/email";

function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) if (text.includes(match)) return result;
    return [];
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue({ email: "director@efha.com", role: "director" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true, orgId: 49 });
});

describe("GET /api/categories/[catId]/send-reports (dry-run + recipient preview)", () => {
  it("never counts (or lists) a cut athlete as a recipient", async () => {
    mockSqlByQuery([
      ["ac.name, ac.teams_finalized_at", [{ name: "U13 AA", org_name: "EFHA", teams_finalized_at: new Date().toISOString() }]],
      ["SELECT id, first_name, last_name, parent_email", []], // real Postgres excludes the cut row; here we assert on the query text below
    ]);
    const { GET } = await import("@/app/api/categories/[catId]/send-reports/route");
    const res = await GET(new Request("http://test/api/categories/113/send-reports"), { params: { catId: "113" } });
    const data = await res.json();
    expect(data.with_email).toBe(0);
    expect(data.recipients).toEqual([]);

    // Pin the actual query text so this test fails loudly if the exclusion
    // ever gets refactored away, not just when a mock happens to agree with it.
    const queryText = sql.mock.calls.find(c => c[0].join("?").includes("first_name, last_name, parent_email"))[0].join("?");
    expect(queryText).toContain("cut_at IS NULL");
  });
});

describe("POST /api/categories/[catId]/send-reports", () => {
  it("excludes a cut player from the roster query used to send emails", async () => {
    mockSqlByQuery([
      ["ac.name, ac.teams_finalized_at", [{ name: "U13 AA", org_name: "EFHA", teams_finalized_at: new Date().toISOString() }]],
      ["FROM users WHERE email", [{ id: 24 }]],
      ["SELECT id, first_name, last_name, parent_email", []], // real Postgres excludes the cut row; here we assert on the query text below
      ["FROM report_links WHERE athlete_id", []],
      ["INSERT INTO report_links", [{ token: "tok-abc" }]],
    ]);
    const { POST } = await import("@/app/api/categories/[catId]/send-reports/route");
    const res = await POST(new Request("http://test/api/categories/113/send-reports", { method: "POST", body: "{}" }), { params: { catId: "113" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.total).toBe(0);
    expect(sendParentReportEmail).not.toHaveBeenCalled();

    const queryText = sql.mock.calls.find(c => c[0].join("?").includes("first_name, last_name, parent_email"))[0].join("?");
    expect(queryText).toContain("cut_at IS NULL");
  });
});
