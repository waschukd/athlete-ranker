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
  resolveSpContext: vi.fn(),
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
import { getSession, resolveSpOrgId, resolveSpContext } from "@/lib/auth";

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

// authorizeOrgAccess granting access via direct ownership: users lookup, then
// owner check returns a row (short-circuits before the roles check).
function mockAuthorizeOrgAccessAllowOwner() {
  sql.mockResolvedValueOnce([{ id: "userA" }]); // users
  sql.mockResolvedValueOnce([{ id: "orgB" }]);  // owner row → authorized
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

describe("IDOR regression: cross-org / cross-category id smuggling", () => {
  // HOLE 1: join-codes approve/deny on a membership_id from another org.
  it("POST /api/organizations/<OrgB>/join-codes approve — foreign membership_id → 403, no UPDATE", async () => {
    mockAuthorizeOrgAccessAllowOwner();            // authorized for orgB
    sql.mockResolvedValueOnce([{ id: "userA" }]);  // userId lookup
    sql.mockResolvedValueOnce([]);                  // membership guard: not in orgB → 403
    const { POST } = await import("@/app/api/organizations/[orgId]/join-codes/route");
    const req = new Request("http://test/api/organizations/orgB/join-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", membership_id: "memOther", user_id: "victim" }),
    });
    const res = await POST(req, { params: { orgId: "orgB" } });
    expect(res.status).toBe(403);
    // No mutating sql may have run: the membership UPDATE must never fire.
    const updates = sql.mock.calls.filter(
      (c) => Array.isArray(c[0]) && c[0].join("").includes("UPDATE evaluator_memberships")
    );
    expect(updates).toHaveLength(0);
  });

  it("POST /api/organizations/<OrgB>/join-codes deny — foreign membership_id → 403, no DELETE", async () => {
    mockAuthorizeOrgAccessAllowOwner();
    sql.mockResolvedValueOnce([{ id: "userA" }]);  // userId lookup
    sql.mockResolvedValueOnce([]);                  // membership guard: not in orgB → 403
    const { POST } = await import("@/app/api/organizations/[orgId]/join-codes/route");
    const req = new Request("http://test/api/organizations/orgB/join-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deny", membership_id: "memOther" }),
    });
    const res = await POST(req, { params: { orgId: "orgB" } });
    expect(res.status).toBe(403);
    const deletes = sql.mock.calls.filter(
      (c) => Array.isArray(c[0]) && c[0].join("").includes("DELETE FROM evaluator_memberships")
    );
    expect(deletes).toHaveLength(0);
  });

  // HOLE 2: rate_evaluator on an evaluator_id not in the SP org.
  it("POST /api/service-provider/evaluators rate_evaluator — foreign evaluator → 403, no rating INSERT", async () => {
    resolveSpContext.mockResolvedValue({ orgId: "spA", isGoalie: false, type: "service_provider" });        // caller's SP org
    sql.mockResolvedValueOnce([{ id: "adminA" }]);  // admin lookup
    sql.mockResolvedValueOnce([]);                   // evaluator membership guard: not in spA → 403
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const req = new Request("http://test/api/service-provider/evaluators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rate_evaluator", evaluator_id: "evalOther", schedule_id: "s1", rating: 5 }),
    });
    const res = await POST(req, {});
    expect(res.status).toBe(403);
    const inserts = sql.mock.calls.filter(
      (c) => Array.isArray(c[0]) && c[0].join("").includes("INSERT INTO evaluator_ratings")
    );
    expect(inserts).toHaveLength(0);
  });

  // HOLE 2b: reinstate on an evaluator_id not in the SP org.
  it("POST /api/service-provider/evaluators reinstate — foreign evaluator → 403, no flag/signup UPDATE", async () => {
    resolveSpContext.mockResolvedValue({ orgId: "spA", isGoalie: false, type: "service_provider" });        // caller's SP org
    sql.mockResolvedValueOnce([{ id: "adminA" }]);  // admin lookup
    sql.mockResolvedValueOnce([]);                   // evaluator membership guard: not in spA → 403
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const req = new Request("http://test/api/service-provider/evaluators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reinstate", evaluator_id: "evalOther" }),
    });
    const res = await POST(req, {});
    expect(res.status).toBe(403);
    const flagUpdates = sql.mock.calls.filter(
      (c) => Array.isArray(c[0]) && c[0].join("").includes("UPDATE evaluator_flags")
    );
    expect(flagUpdates).toHaveLength(0);
    const signupUpdates = sql.mock.calls.filter(
      (c) => Array.isArray(c[0]) && c[0].join("").includes("UPDATE evaluator_session_signups")
    );
    expect(signupUpdates).toHaveLength(0);
  });

  // HOLE 3a: report for an athlete that isn't in the authorized category.
  it("GET /api/athletes/<id>/report?cat=catA — athlete not in catA → 404", async () => {
    // authorizeCategoryAccess (association_admin, allowed via owner):
    sql.mockResolvedValueOnce([{ organization_id: "orgA" }]); // category lookup
    sql.mockResolvedValueOnce([{ id: "userA" }]);             // users
    sql.mockResolvedValueOnce([{ id: "orgA" }]);              // owner → authorized
    sql.mockResolvedValueOnce([]);                             // athlete-in-category guard: empty → 404
    const { GET } = await import("@/app/api/athletes/[athleteId]/report/route");
    const req = new Request("http://test/api/athletes/athOther/report?cat=catA");
    const res = await GET(req, { params: { athleteId: "athOther" } });
    expect(res.status).toBe(404);
  });

  // HOLE 3a': report with NO category param → must be rejected before any data query.
  it("GET /api/athletes/<id>/report (no cat) → 400, no athlete data query", async () => {
    const { GET } = await import("@/app/api/athletes/[athleteId]/report/route");
    const req = new Request("http://test/api/athletes/athOther/report");
    const res = await GET(req, { params: { athleteId: "athOther" } });
    expect(res.status).toBe(400);
    const athQueries = sql.mock.calls.filter(
      (c) => Array.isArray(c[0]) && c[0].join("").includes("FROM athletes")
    );
    expect(athQueries).toHaveLength(0);
  });

  // HOLE 3b: scouting report for an athlete that isn't in the authorized category.
  it("POST /api/athletes/<id>/scouting — athlete not in catA → 404, no AI/data path", async () => {
    sql.mockResolvedValueOnce([{ organization_id: "orgA" }]); // category lookup
    sql.mockResolvedValueOnce([{ id: "userA" }]);             // users
    sql.mockResolvedValueOnce([{ id: "orgA" }]);              // owner → authorized
    sql.mockResolvedValueOnce([]);                             // athlete-in-category guard: empty → 404
    const { POST } = await import("@/app/api/athletes/[athleteId]/scouting/route");
    const req = new Request("http://test/api/athletes/athOther/scouting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catId: "catA" }),
    });
    const res = await POST(req, { params: { athleteId: "athOther" } });
    expect(res.status).toBe(404);
    // The notes/scores queries must never run after the guard fires.
    const noteQueries = sql.mock.calls.filter(
      (c) => Array.isArray(c[0]) && c[0].join("").includes("FROM player_notes")
    );
    expect(noteQueries).toHaveLength(0);
  });
});
