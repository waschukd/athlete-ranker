import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-checkin-summary";

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

function makeReq() { return new Request("http://test/api/categories/cat1/checkin-summary"); }

beforeEach(() => { vi.clearAllMocks(); });

describe("GET checkin-summary", () => {
  it("returns 403 when not authorized", async () => {
    getSession.mockResolvedValue({ email: "x@test", role: "director" });
    sql.mockResolvedValueOnce([{ organization_id: "org1" }]); // category
    sql.mockResolvedValueOnce([{ id: "u1" }]);                 // user
    sql.mockResolvedValueOnce([]);                              // no active assignment
    const { GET } = await import("@/app/api/categories/[catId]/checkin-summary/route");
    const res = await GET(makeReq(), { params: { catId: "cat1" } });
    expect(res.status).toBe(403);
  });

  it("returns per-session counts for an authorized super_admin", async () => {
    getSession.mockResolvedValue({ email: "root@test", role: "super_admin" });
    sql.mockResolvedValueOnce([{ organization_id: "org1" }]);
    sql.mockResolvedValueOnce([
      { schedule_id: "s1", session_number: 1, group_number: 1, checked_in: 8, total: 10 },
    ]);
    const { GET } = await import("@/app/api/categories/[catId]/checkin-summary/route");
    const res = await GET(makeReq(), { params: { catId: "cat1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({ schedule_id: "s1", checked_in: 8, total: 10 });
  });
});
