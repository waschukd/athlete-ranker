// A cut player must fall out of every team-membership table, not just the
// tournament one -- team_rosters (the separate practice-team feature in
// teams/route.js) was missing from this cleanup, so a cut player kept
// receiving "Team Placement" emails after being cut.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/email", () => ({
  emailPlayerCut: vi.fn().mockResolvedValue({ ok: true }),
  emailPlayerIncoming: vi.fn().mockResolvedValue({ ok: true }),
  parentEmails: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/emailTemplates", () => ({
  resolveTemplate: vi.fn().mockResolvedValue({ subject: "s", body: "b" }),
  renderTemplate: vi.fn((s) => s),
}));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

const ATHLETE = { id: 1, first_name: "Sam", last_name: "Lee", age_category_id: 113 };
const FROM_CAT = { id: 113, name: "U13 AA", organization_id: 49 };
const ORG = { name: "EFHA" };

function makeReq(body) {
  return new Request("http://test/api/categories/113/cut", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue({ email: "admin@test.com", role: "association_admin" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true, orgId: 49 });
});

it("removes a released player from team_rosters alongside scrimmage_team_members", async () => {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    if (text.includes("FROM athletes WHERE id")) return [ATHLETE];
    if (text.includes("SELECT id, name, organization_id FROM age_categories WHERE id")) return [FROM_CAT];
    if (text.includes("FROM organizations WHERE id")) return [ORG];
    return [];
  });

  const { POST } = await import("@/app/api/categories/[catId]/cut/route");
  const res = await POST(makeReq({ athleteId: 1, mode: "release" }), { params: { catId: "113" } });
  expect(res.status).toBe(200);

  const queries = sql.mock.calls.map(c => c[0].join("?"));
  expect(queries.some(q => q.includes("DELETE FROM scrimmage_team_members"))).toBe(true);
  expect(queries.some(q => q.includes("DELETE FROM team_rosters"))).toBe(true);
});
