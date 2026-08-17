// PATCH previously only supported helmet_number/non_contact -- there was no
// way to fix a manually-added player's name (e.g. mangled by browser
// autofill) or any other field. Covers the newly-added editable fields.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

function makeReq(body) {
  return new Request("http://test/api/categories/113/athletes", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue({ email: "assoc@test", role: "association_admin" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
  sql.mockResolvedValue([]);
});

describe("PATCH /api/categories/[catId]/athletes — full edit", () => {
  it("updates first_name, last_name, and parent_email", async () => {
    const { PATCH } = await import("@/app/api/categories/[catId]/athletes/route");
    const res = await PATCH(makeReq({ athlete_id: 501, first_name: "Jamie", last_name: "Smith", parent_email: "parent@test.com" }), { params: { catId: "113" } });
    expect(res.status).toBe(200);
    const queries = sql.mock.calls.map(c => c[0].join("?"));
    expect(queries.some(q => q.includes("first_name"))).toBe(true);
    expect(queries.some(q => q.includes("last_name"))).toBe(true);
    expect(queries.some(q => q.includes("parent_email"))).toBe(true);
  });

  it("rejects blanking out first_name", async () => {
    const { PATCH } = await import("@/app/api/categories/[catId]/athletes/route");
    const res = await PATCH(makeReq({ athlete_id: 501, first_name: "   " }), { params: { catId: "113" } });
    expect(res.status).toBe(400);
  });

  it("clears parent_email when set to an empty string", async () => {
    const { PATCH } = await import("@/app/api/categories/[catId]/athletes/route");
    const res = await PATCH(makeReq({ athlete_id: 501, parent_email: "" }), { params: { catId: "113" } });
    expect(res.status).toBe(200);
  });
});
