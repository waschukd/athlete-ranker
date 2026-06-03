import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-flags-ack";

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

function makeReq(body) {
  return new Request("http://test/api/categories/cat1/flags", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => { vi.clearAllMocks(); });

it("acknowledge writes an audit_log row", async () => {
  getSession.mockResolvedValue({ email: "dir@test", role: "super_admin" });
  sql.mockResolvedValueOnce([{ organization_id: "org1" }]); // authorizeCategoryAccess super_admin
  sql.mockResolvedValueOnce([{ id: "u1" }]); // user lookup in acknowledge
  sql.mockResolvedValueOnce([]);             // UPDATE athlete_flags
  sql.mockResolvedValueOnce([]);             // INSERT audit_log
  const { POST } = await import("@/app/api/categories/[catId]/flags/route");
  const res = await POST(makeReq({ action: "acknowledge", flag_id: "f1" }), { params: { catId: "cat1" } });
  expect(res.status).toBe(200);
  const ran = sql.mock.calls.map(c => c[0].join("?"));
  expect(ran.some(s => s.includes("INTO audit_log") && s.includes("flag_acknowledged"))).toBe(true);
});
