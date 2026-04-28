// IDOR regression tests — confirms that an Org A association_admin
// cannot read or mutate Org B resources on the four routes that
// previously had broken or missing authz. Each route handler is
// imported directly; sql + getSession + cookies are mocked so the
// assertions don't need a live DB.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
  signToken: vi.fn(),
  verifyToken: vi.fn(),
  getCurrentUser: vi.fn(),
  getAppUserId: vi.fn(),
  resolveSpOrgId: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));
vi.mock("@/lib/email", () => ({
  emailEvaluatorApproved: vi.fn(),
  emailEvaluatorDenied: vi.fn(),
  emailEvaluatorPendingApproval: vi.fn(),
}));

// AUTH_SECRET is required by /lib/auth and the checkin routes at import time.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-idor-suite";

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

const ORG_A_ADMIN = { email: "admin@orgA.test", role: "association_admin" };

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(ORG_A_ADMIN);
});

// authorizeOrgAccess for an association_admin who doesn't own / isn't
// in the role table for the target org needs three sql round-trips:
// users lookup, owner check (empty), user_organization_roles (empty).
function mockAuthorizeOrgAccessDeny() {
  sql.mockResolvedValueOnce([{ id: "userA" }]); // users
  sql.mockResolvedValueOnce([]);                 // not owner
  sql.mockResolvedValueOnce([]);                 // not in user_organization_roles
}

describe("IDOR: Org A admin cannot touch Org B resources", () => {
  it("POST /api/organizations/<OrgB>/logo → 403", async () => {
    mockAuthorizeOrgAccessDeny();
    const { POST } = await import("@/app/api/organizations/[orgId]/logo/route");
    const req = new Request("http://test/api/organizations/orgB/logo", { method: "POST" });
    const res = await POST(req, { params: { orgId: "orgB" } });
    expect(res.status).toBe(403);
  });

  it("DELETE /api/organizations/<OrgB>/logo → 403", async () => {
    mockAuthorizeOrgAccessDeny();
    const { DELETE } = await import("@/app/api/organizations/[orgId]/logo/route");
    const req = new Request("http://test/api/organizations/orgB/logo", { method: "DELETE" });
    const res = await DELETE(req, { params: { orgId: "orgB" } });
    expect(res.status).toBe(403);
  });

  it("GET /api/organizations/<OrgB>/join-codes → 403", async () => {
    mockAuthorizeOrgAccessDeny();
    const { GET } = await import("@/app/api/organizations/[orgId]/join-codes/route");
    const req = new Request("http://test/api/organizations/orgB/join-codes");
    const res = await GET(req, { params: { orgId: "orgB" } });
    expect(res.status).toBe(403);
  });

  it("POST /api/organizations/<OrgB>/join-codes → 403", async () => {
    // POST does the role-set check before hitting any sql, so no mocks needed.
    const { POST } = await import("@/app/api/organizations/[orgId]/join-codes/route");
    // association_admin IS in WRITE_ROLES, so it falls through to authorizeOrgAccess
    mockAuthorizeOrgAccessDeny();
    const req = new Request("http://test/api/organizations/orgB/join-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate" }),
    });
    const res = await POST(req, { params: { orgId: "orgB" } });
    expect(res.status).toBe(403);
  });

  it("GET /api/service-provider/evaluator/<OrgB_evaluator> → 403", async () => {
    // canViewEvaluator: role gate passes (association_admin), then look up
    // the evaluator's orgs, then look up the caller's accessible orgs.
    sql.mockResolvedValueOnce([{ organization_id: "orgB" }]); // eval memberships
    sql.mockResolvedValueOnce([]);                              // eval director assignments
    // getAccessibleOrgIds for the caller:
    sql.mockResolvedValueOnce([{ id: "userA" }]);              // users
    sql.mockResolvedValueOnce([{ id: "orgA" }]);               // owned orgs
    sql.mockResolvedValueOnce([]);                              // user_organization_roles
    sql.mockResolvedValueOnce([]);                              // evaluator_memberships
    const { GET } = await import("@/app/api/service-provider/evaluator/[evalId]/route");
    const req = new Request("http://test/api/service-provider/evaluator/evalB");
    const res = await GET(req, { params: { evalId: "evalB" } });
    expect(res.status).toBe(403);
  });

  it("GET /api/checkin/<OrgB_schedule> → 403 (no checkin-token cookie, no membership)", async () => {
    // authorizeCheckin: schedule lookup, then authorizeCategoryAccess.
    sql.mockResolvedValueOnce([{ age_category_id: "catB" }]);  // schedule lookup
    // authorizeCategoryAccess for association_admin in catB (which lives in orgB):
    sql.mockResolvedValueOnce([{ organization_id: "orgB" }]);  // category lookup
    sql.mockResolvedValueOnce([{ id: "userA" }]);              // users
    sql.mockResolvedValueOnce([]);                              // not owner of orgB
    sql.mockResolvedValueOnce([]);                              // not in user_organization_roles
    // No checkin-token cookie (mocked at top to return undefined).
    const { GET } = await import("@/app/api/checkin/[scheduleId]/route");
    const req = new Request("http://test/api/checkin/schedB");
    const res = await GET(req, { params: { scheduleId: "schedB" } });
    expect(res.status).toBe(403);
  });

  it("POST /api/checkin/<OrgB_schedule> → 403 (no checkin-token cookie, no membership)", async () => {
    sql.mockResolvedValueOnce([{ age_category_id: "catB" }]);
    sql.mockResolvedValueOnce([{ organization_id: "orgB" }]);
    sql.mockResolvedValueOnce([{ id: "userA" }]);
    sql.mockResolvedValueOnce([]);
    sql.mockResolvedValueOnce([]);
    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const req = new Request("http://test/api/checkin/schedB", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "checkin", athlete_id: "x" }),
    });
    const res = await POST(req, { params: { scheduleId: "schedB" } });
    expect(res.status).toBe(403);
  });
});
