// Security coverage for the "association leads" API.
//
// A service-provider admin assigns a "lead" (a user) to a SUBSET of their
// client associations, granting scoped `association_admin` access via
// user_organization_roles. The critical invariant: an SP can ONLY assign to
// associations actually linked & active in sp_association_links. Any request
// referencing an unlinked association must 403 and make NO writes.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), resolveSpOrgId: vi.fn() }));
vi.mock("@/lib/password", () => ({ hashPassword: vi.fn(async () => "fake-hash") }));
vi.mock("@/lib/email", () => ({ emailWelcomeAssociation: vi.fn(async () => {}) }));

import sql from "@/lib/db";
import { getSession, resolveSpOrgId } from "@/lib/auth";

function makeReq(body) {
  return new Request("http://test/api/service-provider/leads?org=sp1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Flatten every sql call's template strings so we can assert on what ran.
const ran = () => sql.mock.calls.map((c) => (c[0]?.join ? c[0].join("?") : String(c[0])));
const insertedRoles = () => ran().filter((s) => s.includes("INSERT INTO user_organization_roles"));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SP leads POST — security", () => {
  it("403 when resolveSpOrgId returns null (not an SP admin)", async () => {
    getSession.mockResolvedValue({ email: "x@test" });
    resolveSpOrgId.mockResolvedValue(null);
    const { POST } = await import("@/app/api/service-provider/leads/route");
    const res = await POST(makeReq({ email: "lead@test", association_ids: ["A"] }));
    expect(res.status).toBe(403);
    expect(insertedRoles().length).toBe(0);
  });

  it("401 when no session", async () => {
    getSession.mockResolvedValue(null);
    const { POST } = await import("@/app/api/service-provider/leads/route");
    const res = await POST(makeReq({ email: "lead@test", association_ids: ["A"] }));
    expect(res.status).toBe(401);
  });

  it("400 when email or association_ids missing/empty", async () => {
    getSession.mockResolvedValue({ email: "spadmin@test" });
    resolveSpOrgId.mockResolvedValue("sp1");
    sql.mockResolvedValueOnce([{ id: "admin1" }]); // admin id lookup
    const { POST } = await import("@/app/api/service-provider/leads/route");
    const res = await POST(makeReq({ email: "lead@test", association_ids: [] }));
    expect(res.status).toBe(400);
    expect(insertedRoles().length).toBe(0);
  });

  it("403 + NO writes when a requested association_id is not in the SP's linked set", async () => {
    getSession.mockResolvedValue({ email: "spadmin@test" });
    resolveSpOrgId.mockResolvedValue("sp1");
    sql.mockResolvedValueOnce([{ id: "admin1" }]);              // admin id lookup
    sql.mockResolvedValueOnce([{ association_id: "A" }]);       // linked set: only A
    const { POST } = await import("@/app/api/service-provider/leads/route");
    const res = await POST(makeReq({ email: "lead@test", association_ids: ["A", "B"] }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "Not your association" });
    expect(insertedRoles().length).toBe(0);
  });
});

describe("SP leads POST — happy path (existing user)", () => {
  it("inserts user_organization_roles for each association and returns success+count", async () => {
    getSession.mockResolvedValue({ email: "spadmin@test" });
    resolveSpOrgId.mockResolvedValue("sp1");
    sql.mockResolvedValueOnce([{ id: "admin1" }]);                                   // admin id lookup
    sql.mockResolvedValueOnce([{ association_id: "A" }, { association_id: "B" }]);   // linked set covers A,B
    sql.mockResolvedValueOnce([{ id: "auth-1" }]);                                   // auth_users lookup → exists
    sql.mockResolvedValueOnce([{ id: "user-1", role: "director" }]);                 // users lookup → exists
    sql.mockResolvedValueOnce([]);                                                   // UPDATE users role → association_admin
    sql.mockResolvedValueOnce([]);                                                   // INSERT user_organization_roles (A)
    sql.mockResolvedValueOnce([]);                                                   // INSERT user_organization_roles (B)
    const { POST } = await import("@/app/api/service-provider/leads/route");
    const res = await POST(makeReq({ email: "lead@test", name: "Lead", association_ids: ["A", "B"] }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, count: 2 });
    const calls = insertedRoles();
    expect(calls.length).toBe(2);
    expect(ran().some((s) => s.includes("INSERT INTO user_organization_roles") && s.includes("ON CONFLICT"))).toBe(true);
  });

  it("leaves a service_provider_admin user's role unchanged (no role UPDATE)", async () => {
    getSession.mockResolvedValue({ email: "spadmin@test" });
    resolveSpOrgId.mockResolvedValue("sp1");
    sql.mockResolvedValueOnce([{ id: "admin1" }]);                       // admin id lookup
    sql.mockResolvedValueOnce([{ association_id: "A" }]);                // linked set
    sql.mockResolvedValueOnce([{ id: "auth-1" }]);                       // auth_users exists
    sql.mockResolvedValueOnce([{ id: "user-1", role: "super_admin" }]);  // users exists w/ protected role
    sql.mockResolvedValueOnce([]);                                       // INSERT user_organization_roles (A)
    const { POST } = await import("@/app/api/service-provider/leads/route");
    const res = await POST(makeReq({ email: "lead@test", association_ids: ["A"] }));
    expect(res.status).toBe(200);
    // No UPDATE users ... role escalation for a protected role
    expect(ran().some((s) => s.includes("UPDATE users") && s.includes("role"))).toBe(false);
    expect(insertedRoles().length).toBe(1);
  });
});

describe("SP leads POST — create path (new user)", () => {
  it("creates auth_users + auth_accounts + users(association_admin) then assigns roles", async () => {
    getSession.mockResolvedValue({ email: "spadmin@test" });
    resolveSpOrgId.mockResolvedValue("sp1");
    sql.mockResolvedValueOnce([{ id: "admin1" }]);            // admin id lookup
    sql.mockResolvedValueOnce([{ association_id: "A" }]);     // linked set
    sql.mockResolvedValueOnce([]);                            // auth_users lookup → none
    sql.mockResolvedValueOnce([{ id: "auth-new" }]);          // INSERT auth_users RETURNING
    sql.mockResolvedValueOnce([]);                            // INSERT auth_accounts
    sql.mockResolvedValueOnce([{ id: "user-new", role: "association_admin" }]); // INSERT users RETURNING
    sql.mockResolvedValueOnce([]);                            // INSERT user_organization_roles (A)
    const { POST } = await import("@/app/api/service-provider/leads/route");
    const res = await POST(makeReq({ email: "fresh@test", name: "Fresh", association_ids: ["A"] }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, count: 1 });
    expect(ran().some((s) => s.includes("INSERT INTO auth_users"))).toBe(true);
    expect(ran().some((s) => s.includes("INSERT INTO auth_accounts"))).toBe(true);
    expect(ran().some((s) => s.includes("INSERT INTO users"))).toBe(true);
    expect(insertedRoles().length).toBe(1);
  });
});

describe("SP leads DELETE — security", () => {
  function delReq(qs) {
    return new Request(`http://test/api/service-provider/leads?org=sp1&${qs}`, { method: "DELETE" });
  }

  it("403 when the association is not linked to the SP", async () => {
    getSession.mockResolvedValue({ email: "spadmin@test" });
    resolveSpOrgId.mockResolvedValue("sp1");
    sql.mockResolvedValueOnce([{ id: "admin1" }]); // admin id lookup
    sql.mockResolvedValueOnce([]);                 // link check → not linked
    const { DELETE } = await import("@/app/api/service-provider/leads/route");
    const res = await DELETE(delReq("user_id=u1&association_id=Z"));
    expect(res.status).toBe(403);
    expect(ran().some((s) => s.includes("DELETE FROM user_organization_roles"))).toBe(false);
  });

  it("deletes the role row when the association is linked", async () => {
    getSession.mockResolvedValue({ email: "spadmin@test" });
    resolveSpOrgId.mockResolvedValue("sp1");
    sql.mockResolvedValueOnce([{ id: "admin1" }]);          // admin id lookup
    sql.mockResolvedValueOnce([{ association_id: "A" }]);   // link check → linked
    sql.mockResolvedValueOnce([]);                          // DELETE
    const { DELETE } = await import("@/app/api/service-provider/leads/route");
    const res = await DELETE(delReq("user_id=u1&association_id=A"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
    expect(ran().some((s) => s.includes("DELETE FROM user_organization_roles"))).toBe(true);
  });
});
