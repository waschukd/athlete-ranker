// A "goalie evaluator" invite is only meaningful when the category actually
// runs goalie evaluation (evaluates_goalies, set during setup's goalie steps).
// Otherwise there's no goalie scoring pipeline for that invitee to score
// into -- the association/coach-evaluator invite must still work regardless.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), emailWrapper: (s) => s }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { sendEmail } from "@/lib/email";

function makeReq(body) {
  return new Request("http://test/api/categories/113/evaluators", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
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
  getSession.mockResolvedValue({ email: "assoc@test", role: "association_admin" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true, orgId: 49 });
});

describe("POST /api/categories/[catId]/evaluators — goalie kind gated on evaluates_goalies", () => {
  it("rejects a goalie invite when the category doesn't evaluate goalies", async () => {
    mockSqlByQuery([
      ["FROM age_categories WHERE id", [{ coach_evaluators_enabled: true }]],
      ["SELECT ac.name AS category_name, ac.evaluates_goalies", [{ category_name: "U13 AA", evaluates_goalies: false, org_name: "EFHA" }]],
    ]);
    const { POST } = await import("@/app/api/categories/[catId]/evaluators/route");
    const res = await POST(makeReq({ email: "coach@test.com", kind: "goalie" }), { params: { catId: "113" } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/doesn't evaluate goalies/);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("allows a goalie invite when the category does evaluate goalies", async () => {
    mockSqlByQuery([
      ["FROM age_categories WHERE id", [{ coach_evaluators_enabled: true }]],
      ["SELECT ac.name AS category_name, ac.evaluates_goalies", [{ category_name: "U13 AA", evaluates_goalies: true, org_name: "EFHA" }]],
      ["INSERT INTO category_evaluators", []],
      ["SELECT email FROM users", [{ email: "g@test.com" }]],
    ]);
    const { POST } = await import("@/app/api/categories/[catId]/evaluators/route");
    const res = await POST(makeReq({ email: "g@test.com", kind: "goalie" }), { params: { catId: "113" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });

  it("still allows a coach invite when the category doesn't evaluate goalies", async () => {
    mockSqlByQuery([
      ["FROM age_categories WHERE id", [{ coach_evaluators_enabled: true }]],
      ["SELECT ac.name AS category_name, ac.evaluates_goalies", [{ category_name: "U13 AA", evaluates_goalies: false, org_name: "EFHA" }]],
      ["INSERT INTO category_evaluators", []],
      ["SELECT email FROM users", [{ email: "c@test.com" }]],
    ]);
    const { POST } = await import("@/app/api/categories/[catId]/evaluators/route");
    const res = await POST(makeReq({ email: "c@test.com", kind: "coach" }), { params: { catId: "113" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });
});
