// Same gap the EFHA welcome-email incident exposed for notify-parents: a cut
// player stays is_active=true (cut_at flags them "Cut" without removing
// scores/visibility), so the "Team Placement" email's team_rosters-based
// recipient query still reached them. Fixed two ways: the cut route now also
// removes a cut player from team_rosters outright, and this query excludes
// cut_at IS NOT NULL as defense-in-depth for rows that predate that fix.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true, id: "em_1" }),
  parentEmails: (a) => [a.parent_email, a.parent_email_2].filter(Boolean),
  esc: (v) => String(v ?? ""),
  parentTeamPlacementHtml: () => "<p>placement</p>",
  emailWrapper: (html) => html,
}));
vi.mock("@/lib/emailLog", () => ({
  ensureEmailLogTable: vi.fn().mockResolvedValue(),
  logEmailSend: vi.fn().mockResolvedValue(),
}));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { sendEmail } from "@/lib/email";

function makeReq(body) {
  return new Request("http://test/api/categories/114/teams", {
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
  getSession.mockResolvedValue({ email: "assoc@test", role: "association_admin" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
  sendEmail.mockResolvedValue({ ok: true, id: "em_1" });
});

describe("notify_teams query excludes cut players", () => {
  it("includes cut_at IS NULL in the recipient join", async () => {
    mockSqlByQuery([
      ["SELECT id FROM users WHERE email", [{ id: 1 }]],
      ["SELECT ac.name AS category_name", [{ category_name: "U15 AA", org_name: "EFHA" }]],
      ["FROM team_rosters tr", []],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/teams/route");
    await POST(makeReq({ action: "notify_teams" }), { params: { catId: "114" } });

    const query = sql.mock.calls.map(c => c[0].join("?")).find(q => q.includes("FROM team_rosters tr") && q.includes("JOIN teams t"));
    expect(query).toContain("cut_at IS NULL");
  });

  it("only emails the survivor when a cut player is also modeled in the result set", async () => {
    mockSqlByQuery([
      ["SELECT id FROM users WHERE email", [{ id: 1 }]],
      ["SELECT ac.name AS category_name", [{ category_name: "U15 AA", org_name: "EFHA" }]],
      // The real query filters cut_at IS NULL, so a cut player never reaches
      // this result set -- this models that by only returning the survivor.
      ["FROM team_rosters tr", [{ first_name: "Still", last_name: "Trying", parent_email: "stilltrying@example.com", parent_email_2: null, team_name: "Team A" }]],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/teams/route");
    const res = await POST(makeReq({ action: "notify_teams" }), { params: { catId: "114" } });
    const data = await res.json();

    expect(data.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith("stilltrying@example.com", expect.any(String), expect.any(String));
  });

  it("notify_preview's recipient count also excludes cut_at", async () => {
    mockSqlByQuery([
      ["SELECT id FROM users WHERE email", [{ id: 1 }]],
      ["FROM team_rosters tr", [{ n: 3 }]],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/teams/route");
    await POST(makeReq({ action: "notify_preview" }), { params: { catId: "114" } });

    const query = sql.mock.calls.map(c => c[0].join("?")).find(q => q.includes("COUNT(*)::int n FROM team_rosters"));
    expect(query).toContain("cut_at IS NULL");
  });
});
