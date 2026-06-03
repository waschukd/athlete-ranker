import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSuperAdmin: vi.fn() }));

import sql from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

function makeReq(body) {
  return new Request("http://test/api/admin/god-mode/evaluator-invites", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => { vi.clearAllMocks(); });

describe("evaluator-invites POST", () => {
  it("403 when not super admin", async () => {
    requireSuperAdmin.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/god-mode/evaluator-invites/route");
    const res = await POST(makeReq({ request_ids: ["a"], action: "approve" }));
    expect(res.status).toBe(403);
  });

  it("batch approve updates via ANY and returns count", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "admin1" });
    sql.mockResolvedValueOnce([]); // UPDATE
    const { POST } = await import("@/app/api/admin/god-mode/evaluator-invites/route");
    const res = await POST(makeReq({ request_ids: ["a", "b", "c"], action: "approve" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, count: 3 });
    const ran = sql.mock.calls.map(c => c[0].join("?"));
    expect(ran.some(s => s.includes("evaluator_join_requests") && s.includes("ANY"))).toBe(true);
  });

  it("still accepts a single request_id (back-compat)", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "admin1" });
    sql.mockResolvedValueOnce([]); // UPDATE
    const { POST } = await import("@/app/api/admin/god-mode/evaluator-invites/route");
    const res = await POST(makeReq({ request_id: "x", action: "deny" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, count: 1 });
  });

  it("400 when no ids provided", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "admin1" });
    const { POST } = await import("@/app/api/admin/god-mode/evaluator-invites/route");
    const res = await POST(makeReq({ action: "approve" }));
    expect(res.status).toBe(400);
  });
});
