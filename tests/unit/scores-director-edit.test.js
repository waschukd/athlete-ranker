import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), getAppUserId: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));

import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

function makeReq(body) {
  return new Request("http://test/api/categories/cat1/scores", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
const fullBody = (extra) => ({
  athlete_id: "a1", evaluator_id: "e1", scoring_category_id: "sc1",
  session_number: 2, new_score: 7, ...extra,
});
// sql calls the PATCH makes AFTER auth+guard, in order:
function mockEditSql() {
  sql.mockResolvedValueOnce([{ scoring_scale: 10, scoring_increment: 1 }]); // category
  sql.mockResolvedValueOnce([{ score: "5" }]);                              // existing
  sql.mockResolvedValueOnce([]);                                            // UPDATE
  sql.mockResolvedValueOnce([{ name: "Eval" }]);                            // evaluator name
  sql.mockResolvedValueOnce([{ name: "Skating" }]);                         // scoring cat
  sql.mockResolvedValueOnce([]);                                            // audit insert
}
beforeEach(() => { vi.clearAllMocks(); authorizeCategoryAccess.mockResolvedValue({ authorized: true }); getAppUserId.mockResolvedValue("editor1"); });

describe("PATCH score — director correction", () => {
  it("rejects a director with no reason (400)", async () => {
    getSession.mockResolvedValue({ email: "d@test", role: "director" });
    const { PATCH } = await import("@/app/api/categories/[catId]/scores/route");
    const res = await PATCH(makeReq(fullBody({ reason: "" })), { params: { catId: "cat1" } });
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled(); // no DB writes
  });

  it("allows a director WITH a reason and records editor_role=director in the audit", async () => {
    getSession.mockResolvedValue({ email: "d@test", role: "director" });
    mockEditSql();
    const { PATCH } = await import("@/app/api/categories/[catId]/scores/route");
    const res = await PATCH(makeReq(fullBody({ reason: "obvious data-entry typo" })), { params: { catId: "cat1" } });
    expect(res.status).toBe(200);
    const auditCall = sql.mock.calls.find(c => c[0].join("?").includes("INTO audit_log"));
    expect(auditCall).toBeTruthy();
    expect(JSON.stringify(auditCall)).toContain("director");
  });

  it("still allows an admin without a reason", async () => {
    getSession.mockResolvedValue({ email: "a@test", role: "association_admin" });
    mockEditSql();
    const { PATCH } = await import("@/app/api/categories/[catId]/scores/route");
    const res = await PATCH(makeReq(fullBody({})), { params: { catId: "cat1" } });
    expect(res.status).toBe(200);
  });
});
