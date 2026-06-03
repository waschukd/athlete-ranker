import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), resolveSpOrgId: vi.fn() }));

import sql from "@/lib/db";
import { getSession, resolveSpOrgId } from "@/lib/auth";

function makeReq(body) {
  return new Request("http://test/api/service-provider/evaluators?org=sp1", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
function authOk() {
  getSession.mockResolvedValue({ email: "spadmin@test" });
  resolveSpOrgId.mockResolvedValue("sp1");
  sql.mockResolvedValueOnce([{ id: "admin1" }]); // admin lookup (first sql call in POST)
}
const ran = () => sql.mock.calls.map(c => c[0].join("?"));
beforeEach(() => { vi.clearAllMocks(); });

describe("SP evaluators bulk POST", () => {
  it("403 when not an SP admin", async () => {
    getSession.mockResolvedValue({ email: "x@test" });
    resolveSpOrgId.mockResolvedValue(null);
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "approve_hours", hours_ids: ["h1"] }));
    expect(res.status).toBe(403);
  });

  it("approve_hours bulk uses ANY + org scope and returns count", async () => {
    authOk();
    sql.mockResolvedValueOnce([]); // UPDATE evaluator_hours
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "approve_hours", hours_ids: ["h1", "h2"] }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, count: 2 });
    expect(ran().some(s => s.includes("evaluator_hours") && s.includes("ANY") && s.includes("organization_id"))).toBe(true);
  });

  it("approve_hours single back-compat still works", async () => {
    authOk();
    sql.mockResolvedValueOnce([]);
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "approve_hours", hours_id: "h9" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, count: 1 });
  });

  it("dismiss_flag bulk uses ANY + org scope", async () => {
    authOk();
    sql.mockResolvedValueOnce([]); // UPDATE evaluator_flags
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "dismiss_flag", flag_ids: ["f1", "f2"] }));
    expect(res.status).toBe(200);
    expect(ran().some(s => s.includes("evaluator_flags") && s.includes("ANY"))).toBe(true);
  });

  it("approve evaluators bulk updates memberships via ANY", async () => {
    authOk();
    sql.mockResolvedValueOnce([]); // UPDATE evaluator_memberships
    sql.mockResolvedValueOnce([]); // audit insert id1
    sql.mockResolvedValueOnce([]); // audit insert id2
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "approve", evaluator_ids: ["u1", "u2"] }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, count: 2 });
    expect(ran().some(s => s.includes("evaluator_memberships") && s.includes("ANY"))).toBe(true);
  });

  it("suspend bulk runs membership + signup updates with ANY", async () => {
    authOk();
    sql.mockResolvedValueOnce([]); // membership suspend
    sql.mockResolvedValueOnce([]); // signups suspend
    sql.mockResolvedValueOnce([]); // audit id1
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "suspend", evaluator_ids: ["u1"] }));
    expect(res.status).toBe(200);
    expect(ran().some(s => s.includes("evaluator_memberships") && s.includes("ANY"))).toBe(true);
    expect(ran().some(s => s.includes("evaluator_session_signups") && s.includes("ANY"))).toBe(true);
  });

  it("delete_account bulk skips evaluators with session history", async () => {
    authOk();
    sql.mockResolvedValueOnce([{ count: "2" }]); // history check u1 → has history → skip
    sql.mockResolvedValueOnce([{ count: "0" }]); // history check u2 → none
    sql.mockResolvedValueOnce([]);                // DELETE memberships u2
    sql.mockResolvedValueOnce([{ id: "au2" }]);   // auth_users lookup u2
    sql.mockResolvedValueOnce([]);                // DELETE auth_accounts
    sql.mockResolvedValueOnce([]);                // DELETE auth_users
    sql.mockResolvedValueOnce([]);                // DELETE users u2
    const { POST } = await import("@/app/api/service-provider/evaluators/route");
    const res = await POST(makeReq({ action: "delete_account", evaluator_ids: ["u1", "u2"] }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, deleted: 1, skipped: 1 });
  });
});
