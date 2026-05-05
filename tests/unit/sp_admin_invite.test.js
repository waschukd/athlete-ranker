// Regression coverage for the SP-admin invite flow.
//
// Bug: /api/admin/accept-invite previously hardcoded role='association_admin'
// for every accepted invite, so an SP admin who invited a colleague got an
// association_admin of an SP org — meaningless and unauthorized to manage
// the SP. Fix branches role + redirect on organizations.type. These tests
// confirm both branches.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  signToken: vi.fn(async () => "fake-jwt"),
}));
vi.mock("@/lib/password", () => ({
  hashPassword: vi.fn(async () => "fake-hash"),
}));

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-sp-invite";

import sql from "@/lib/db";

const TOKEN = "valid-token";
const ORG_ID = "org-123";

// Stages the seven sql round-trips accept-invite makes for a fresh user:
//   1. lookup invite (with org_type)
//   2. existing auth_users (none)
//   3. INSERT auth_users → returns row
//   4. existing auth_accounts (none)
//   5. INSERT auth_accounts (no result needed)
//   6. existing app users (none)
//   7. INSERT users → returns row
//   8. existing user_organization_roles (none)
//   9. INSERT user_organization_roles (no result needed)
//  10. UPDATE admin_invites status (no result needed)
function stageHappyPath(orgType) {
  sql.mockResolvedValueOnce([
    { token: TOKEN, email: "new@example.com", name: "New Admin", organization_id: ORG_ID, org_name: "Org", org_type: orgType },
  ]);                                                  // invite lookup
  sql.mockResolvedValueOnce([]);                       // existing auth user — none
  sql.mockResolvedValueOnce([{ id: "auth-1", email: "new@example.com", name: "New Admin" }]); // INSERT auth_users RETURNING
  sql.mockResolvedValueOnce([]);                       // existing auth_account — none
  sql.mockResolvedValueOnce([]);                       // INSERT auth_accounts (no RETURNING used)
  sql.mockResolvedValueOnce([]);                       // existing app user — none
  sql.mockResolvedValueOnce([{ id: "app-1", email: "new@example.com", role: orgType === "service_provider" ? "service_provider_admin" : "association_admin" }]); // INSERT users RETURNING
  sql.mockResolvedValueOnce([]);                       // existing user_organization_roles — none
  sql.mockResolvedValueOnce([]);                       // INSERT user_organization_roles
  sql.mockResolvedValueOnce([]);                       // UPDATE admin_invites
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/accept-invite — role mapping by org type", () => {
  it("invite to a service_provider org grants service_provider_admin and redirects to /service-provider/dashboard", async () => {
    stageHappyPath("service_provider");
    const { POST } = await import("@/app/api/admin/accept-invite/route");
    const req = new Request("http://test/api/admin/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: TOKEN, password: "hunter2hunter2" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.redirectTo).toBe("/service-provider/dashboard");

    // Find the user_organization_roles INSERT and confirm role
    const calls = sql.mock.calls.map(c => (c[0]?.join ? c[0].join("?") : String(c[0])));
    const linkCall = calls.find(s => s.includes("INSERT INTO user_organization_roles"));
    expect(linkCall).toBeTruthy();
    const linkArgs = sql.mock.calls.find(c => (c[0]?.join ? c[0].join("?") : String(c[0])).includes("INSERT INTO user_organization_roles"));
    // Args are positional after the template literal: user_id, organization_id, role
    expect(linkArgs.slice(1)).toEqual(expect.arrayContaining(["service_provider_admin"]));
  });

  it("invite to an association org still grants association_admin and redirects to /association/dashboard", async () => {
    stageHappyPath("association");
    const { POST } = await import("@/app/api/admin/accept-invite/route");
    const req = new Request("http://test/api/admin/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: TOKEN, password: "hunter2hunter2" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.redirectTo).toBe(`/association/dashboard?org=${ORG_ID}`);

    const linkArgs = sql.mock.calls.find(c => (c[0]?.join ? c[0].join("?") : String(c[0])).includes("INSERT INTO user_organization_roles"));
    expect(linkArgs.slice(1)).toEqual(expect.arrayContaining(["association_admin"]));
  });
});
