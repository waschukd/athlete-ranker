// Extracted from 4 hand-copied call sites (scheduleNotify.js x2, cut/route.js,
// cron/route.js) that would each need the same fix if the underlying query
// shape ever changed. These pin the exact query shape + filter behavior.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));

import sql from "@/lib/db";
import { getCategoryDirectors, getOrgRoleUsers } from "@/lib/categoryRecipients";

beforeEach(() => { vi.resetAllMocks(); });

describe("getCategoryDirectors", () => {
  it("queries active director_assignments scoped to the category", async () => {
    sql.mockResolvedValueOnce([{ email: "d@test.com", name: "Dana" }]);
    const result = await getCategoryDirectors(114);
    expect(result).toEqual([{ email: "d@test.com", name: "Dana" }]);
    const query = sql.mock.calls[0][0].join("?");
    expect(query).toContain("FROM director_assignments da");
    expect(query).toContain("da.status = 'active'");
  });
});

describe("getOrgRoleUsers", () => {
  it("returns every role on the org when onlyRole is omitted", async () => {
    sql.mockResolvedValueOnce([{ email: "a@test.com", name: "A" }]);
    await getOrgRoleUsers(49);
    const query = sql.mock.calls[0][0].join("?");
    expect(query).toContain("FROM user_organization_roles uor");
    expect(query).not.toContain("uor.role");
  });

  it("filters to onlyRole when given", async () => {
    sql.mockResolvedValueOnce([{ email: "admin@test.com", name: "Admin" }]);
    await getOrgRoleUsers(49, { onlyRole: "association_admin" });
    const query = sql.mock.calls[0][0].join("?");
    expect(query).toContain("uor.role");
  });
});
