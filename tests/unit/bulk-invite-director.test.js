// A brand new director gets the same click-a-link-set-your-password flow as
// an org admin invite (createAndSendDirectorInvite) -- category assignments
// land at accept time, not invite time. An existing user (working login
// already) gets notified and assigned immediately, since there's nothing to
// accept.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeOrgAccess: vi.fn() }));
vi.mock("@/lib/invites", () => ({ createAndSendDirectorInvite: vi.fn(async () => ({ sent: true, url: "https://sidelinestar.com/director/accept-invite?token=abc" })) }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import { createAndSendDirectorInvite } from "@/lib/invites";

function makeReq(body) {
  return new Request("http://test/api/organizations/49/bulk-invite-director", {
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
  authorizeOrgAccess.mockResolvedValue({ authorized: true });
});

describe("POST /api/organizations/[orgId]/bulk-invite-director", () => {
  it("new person: sends an invite link, does not assign categories yet", async () => {
    mockSqlByQuery([
      ["FROM age_categories ac JOIN organizations", [{ id: 113, name: "U13 AA", org_name: "EFHA" }, { id: 114, name: "U15 AA", org_name: "EFHA" }]],
      ["FROM users WHERE email", []],
    ]);
    const { POST } = await import("@/app/api/organizations/[orgId]/bulk-invite-director/route");
    const res = await POST(makeReq({ name: "Krista", email: "krista@test.com", category_ids: [113, 114] }), { params: { orgId: "49" } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toMatch(/they'll be assigned once they accept/);
    expect(createAndSendDirectorInvite).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 49, email: "krista@test.com", name: "Krista", orgName: "EFHA",
      categories: [{ id: 113, name: "U13 AA", org_name: "EFHA" }, { id: 114, name: "U15 AA", org_name: "EFHA" }],
    }));
    expect(sql).not.toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining("INSERT INTO director_assignments")]));
  });

  it("existing person: notifies and assigns immediately, no invite link", async () => {
    mockSqlByQuery([
      ["FROM age_categories ac JOIN organizations", [{ id: 113, name: "U13 AA", org_name: "EFHA" }]],
      ["FROM users WHERE email", [{ id: 164 }]],
      ["INSERT INTO director_assignments", []],
    ]);
    const { POST } = await import("@/app/api/organizations/[orgId]/bulk-invite-director/route");
    const res = await POST(makeReq({ name: "Krista", email: "krista@test.com", category_ids: [113] }), { params: { orgId: "49" } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toMatch(/notified by email/);
    expect(createAndSendDirectorInvite).not.toHaveBeenCalled();
  });
});
