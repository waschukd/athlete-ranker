// An SP admin runs coach/goalie designation for the associations their SP
// serves, same as an association_admin/director does for their own
// association -- authorizeCategoryAccess still scopes them to categories
// their SP actually serves.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), emailWrapper: (s) => s }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

function makeReq(body) {
  return new Request("http://test/api/categories/113/evaluators", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
function makeGetReq() {
  return new Request("http://test/api/categories/113/evaluators");
}

function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) {
      if (text.includes(match)) return typeof result === "function" ? result() : result;
    }
    return [];
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET/POST /api/categories/[catId]/evaluators — SP admin access", () => {
  it("lets a service_provider_admin view designations for a category their SP serves", async () => {
    getSession.mockResolvedValue({ email: "sp@test.com", role: "service_provider_admin" });
    authorizeCategoryAccess.mockResolvedValue({ authorized: true, orgId: 49 });
    mockSqlByQuery([
      ["FROM category_evaluators ce", []],
      ["FROM evaluator_session_signups ess", []],
    ]);
    const { GET } = await import("@/app/api/categories/[catId]/evaluators/route");
    const res = await GET(makeGetReq(), { params: { catId: "113" } });
    expect(res.status).toBe(200);
  });

  it("lets a service_provider_admin assign a coach for a category their SP serves", async () => {
    getSession.mockResolvedValue({ email: "sp@test.com", role: "service_provider_admin" });
    authorizeCategoryAccess.mockResolvedValue({ authorized: true, orgId: 49 });
    mockSqlByQuery([
      ["SELECT ac.name AS category_name, ac.evaluates_goalies", [{ category_name: "U13 AA", evaluates_goalies: false, org_name: "EFHA" }]],
      ["INSERT INTO category_evaluators", []],
      ["SELECT email FROM users", [{ email: "coach@test.com" }]],
    ]);
    const { POST } = await import("@/app/api/categories/[catId]/evaluators/route");
    const res = await POST(makeReq({ email: "coach@test.com", kind: "coach" }), { params: { catId: "113" } });
    expect(res.status).toBe(200);
  });

  it("still denies a service_provider_admin for a category their SP does NOT serve", async () => {
    getSession.mockResolvedValue({ email: "sp@test.com", role: "service_provider_admin" });
    authorizeCategoryAccess.mockResolvedValue({ authorized: false });
    const { POST } = await import("@/app/api/categories/[catId]/evaluators/route");
    const res = await POST(makeReq({ email: "coach@test.com", kind: "coach" }), { params: { catId: "999" } });
    expect(res.status).toBe(403);
  });

  it("still denies a plain evaluator role entirely", async () => {
    getSession.mockResolvedValue({ email: "eval@test.com", role: "association_evaluator" });
    const { POST } = await import("@/app/api/categories/[catId]/evaluators/route");
    const res = await POST(makeReq({ email: "coach@test.com", kind: "coach" }), { params: { catId: "113" } });
    expect(res.status).toBe(403);
    expect(authorizeCategoryAccess).not.toHaveBeenCalled();
  });
});

describe("GET/POST /api/categories/[catId]/evaluators — association-side gated per-category by the SP's grant", () => {
  it("denies an association_admin when the category has NOT been granted coach_evaluators_enabled", async () => {
    getSession.mockResolvedValue({ email: "assoc@test.com", role: "association_admin" });
    authorizeCategoryAccess.mockResolvedValue({ authorized: true, orgId: 49 });
    mockSqlByQuery([
      ["FROM age_categories WHERE id", [{ coach_evaluators_enabled: false }]],
    ]);
    const { GET } = await import("@/app/api/categories/[catId]/evaluators/route");
    const res = await GET(makeGetReq(), { params: { catId: "113" } });
    expect(res.status).toBe(403);
  });

  it("denies a director the same way", async () => {
    getSession.mockResolvedValue({ email: "dir@test.com", role: "director" });
    authorizeCategoryAccess.mockResolvedValue({ authorized: true, orgId: 49 });
    mockSqlByQuery([
      ["FROM age_categories WHERE id", [{ coach_evaluators_enabled: false }]],
    ]);
    const { POST } = await import("@/app/api/categories/[catId]/evaluators/route");
    const res = await POST(makeReq({ email: "coach@test.com", kind: "coach" }), { params: { catId: "113" } });
    expect(res.status).toBe(403);
  });

  it("denies an association_admin on a category with no row found at all", async () => {
    getSession.mockResolvedValue({ email: "assoc@test.com", role: "association_admin" });
    authorizeCategoryAccess.mockResolvedValue({ authorized: true, orgId: 49 });
    mockSqlByQuery([
      ["FROM age_categories WHERE id", []],
    ]);
    const { GET } = await import("@/app/api/categories/[catId]/evaluators/route");
    const res = await GET(makeGetReq(), { params: { catId: "113" } });
    expect(res.status).toBe(403);
  });

  it("allows an association_admin once the SP HAS granted coach_evaluators_enabled on that specific category", async () => {
    getSession.mockResolvedValue({ email: "assoc@test.com", role: "association_admin" });
    authorizeCategoryAccess.mockResolvedValue({ authorized: true, orgId: 49 });
    mockSqlByQuery([
      ["FROM age_categories WHERE id", [{ coach_evaluators_enabled: true }]],
      ["FROM category_evaluators ce", []],
      ["FROM evaluator_session_signups ess", []],
    ]);
    const { GET } = await import("@/app/api/categories/[catId]/evaluators/route");
    const res = await GET(makeGetReq(), { params: { catId: "113" } });
    expect(res.status).toBe(200);
  });
});
