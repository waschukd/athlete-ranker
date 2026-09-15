// Real ask: some associations build their real rosters in a tool entirely
// separate from this app, so "teams are decided" can't be reliably inferred
// from anything in-app (scores existing, groups being locked, etc.). This is
// a manual, per-category confirmation the director/SP flips themselves --
// and it's a real gate, not just a disabled button on the client.

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

describe("PATCH /api/categories/[catId]/teams-finalized", () => {
  it("sets teams_finalized_at to now when finalized: true", async () => {
    sql.mockResolvedValueOnce([{ teams_finalized_at: "2026-09-15T12:00:00.000Z" }]);
    const { PATCH } = await import("@/app/api/categories/[catId]/teams-finalized/route");
    const res = await PATCH(new Request("http://test", { method: "PATCH", body: JSON.stringify({ finalized: true }) }), { params: { catId: "113" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.teamsFinalizedAt).toBeTruthy();
    const queryText = sql.mock.calls[0][0].join("?");
    expect(queryText).toContain("teams_finalized_at = NOW()");
  });

  it("clears teams_finalized_at back to null when finalized: false", async () => {
    sql.mockResolvedValueOnce([{ teams_finalized_at: null }]);
    const { PATCH } = await import("@/app/api/categories/[catId]/teams-finalized/route");
    await PATCH(new Request("http://test", { method: "PATCH", body: JSON.stringify({ finalized: false }) }), { params: { catId: "113" } });

    const queryText = sql.mock.calls[0][0].join("?");
    expect(queryText).toContain("teams_finalized_at = NULL");
  });

  it("rejects a role outside category management", async () => {
    getSession.mockResolvedValue({ email: "evaluator@efha.com", role: "evaluator" });
    const { PATCH } = await import("@/app/api/categories/[catId]/teams-finalized/route");
    const res = await PATCH(new Request("http://test", { method: "PATCH", body: JSON.stringify({ finalized: true }) }), { params: { catId: "113" } });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/categories/[catId]/send-reports — teams-finalized gate", () => {
  it("refuses to send when teams_finalized_at is not set", async () => {
    mockSqlByQuery([
      ["ac.name, ac.teams_finalized_at", [{ name: "U13 AA", org_name: "EFHA", teams_finalized_at: null }]],
    ]);
    const { POST } = await import("@/app/api/categories/[catId]/send-reports/route");
    const res = await POST(new Request("http://test/api/categories/113/send-reports", { method: "POST", body: "{}" }), { params: { catId: "113" } });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/teams as finalized/i);
    expect(sendParentReportEmail).not.toHaveBeenCalled();
  });

  it("sends normally once teams_finalized_at is set", async () => {
    mockSqlByQuery([
      ["ac.name, ac.teams_finalized_at", [{ name: "U13 AA", org_name: "EFHA", teams_finalized_at: new Date().toISOString() }]],
      ["FROM users WHERE email", [{ id: 24 }]],
      ["SELECT id, first_name, last_name, parent_email", [{ id: 1, first_name: "Jordan", last_name: "Smith", parent_email: "parent@example.com" }]],
      ["FROM report_links WHERE athlete_id", []],
      ["INSERT INTO report_links", [{ token: "tok-abc" }]],
    ]);
    const { POST } = await import("@/app/api/categories/[catId]/send-reports/route");
    const res = await POST(new Request("http://test/api/categories/113/send-reports", { method: "POST", body: "{}" }), { params: { catId: "113" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.total).toBe(1);
    expect(sendParentReportEmail).toHaveBeenCalledTimes(1);
  });

  it("also gates the GET dry-run's own teams_finalized field, for the UI to reflect", async () => {
    mockSqlByQuery([
      ["ac.name, ac.teams_finalized_at", [{ name: "U13 AA", org_name: "EFHA", teams_finalized_at: null }]],
      ["SELECT COUNT(*)::int AS with_email", [{ with_email: 5 }]],
    ]);
    const { GET } = await import("@/app/api/categories/[catId]/send-reports/route");
    const res = await GET(new Request("http://test/api/categories/113/send-reports"), { params: { catId: "113" } });
    const data = await res.json();
    expect(data.teams_finalized).toBe(false);
  });
});
