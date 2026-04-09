import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("@/lib/db", () => {
  const mockSql = vi.fn();
  return { default: mockSql };
});

import sql from "@/lib/db";
import { authorizeCategoryAccess } from "@/lib/authorize";

describe("authorizeCategoryAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unauthorized for null session", async () => {
    const result = await authorizeCategoryAccess(null, "123");
    expect(result.authorized).toBe(false);
  });

  it("returns unauthorized for missing catId", async () => {
    const result = await authorizeCategoryAccess({ email: "a@b.com", role: "super_admin" }, null);
    expect(result.authorized).toBe(false);
  });

  it("allows super_admin access to any category", async () => {
    sql.mockResolvedValueOnce([{ organization_id: "org1" }]); // category lookup
    const result = await authorizeCategoryAccess(
      { email: "admin@test.com", role: "super_admin" },
      "cat1"
    );
    expect(result.authorized).toBe(true);
    expect(result.orgId).toBe("org1");
  });

  it("denies super_admin if category doesn't exist", async () => {
    sql.mockResolvedValueOnce([]); // no category
    const result = await authorizeCategoryAccess(
      { email: "admin@test.com", role: "super_admin" },
      "nonexistent"
    );
    expect(result.authorized).toBe(false);
  });

  it("allows association_admin who owns the org", async () => {
    sql.mockResolvedValueOnce([{ organization_id: "org1" }]); // category lookup
    sql.mockResolvedValueOnce([{ id: "user1" }]); // user lookup
    sql.mockResolvedValueOnce([{ id: "org1" }]); // org ownership check
    const result = await authorizeCategoryAccess(
      { email: "owner@assoc.com", role: "association_admin" },
      "cat1"
    );
    expect(result.authorized).toBe(true);
  });

  it("denies association_admin who doesn't own the org", async () => {
    sql.mockResolvedValueOnce([{ organization_id: "org1" }]); // category
    sql.mockResolvedValueOnce([{ id: "user1" }]); // user
    sql.mockResolvedValueOnce([]); // not owner
    sql.mockResolvedValueOnce([]); // not in user_organization_roles
    const result = await authorizeCategoryAccess(
      { email: "other@assoc.com", role: "association_admin" },
      "cat1"
    );
    expect(result.authorized).toBe(false);
  });

  it("allows director assigned to the category", async () => {
    sql.mockResolvedValueOnce([{ organization_id: "org1" }]); // category
    sql.mockResolvedValueOnce([{ id: "user1" }]); // user
    sql.mockResolvedValueOnce([{ id: "assignment1" }]); // director_assignments
    const result = await authorizeCategoryAccess(
      { email: "dir@test.com", role: "director" },
      "cat1"
    );
    expect(result.authorized).toBe(true);
  });

  it("denies director not assigned to the category", async () => {
    sql.mockResolvedValueOnce([{ organization_id: "org1" }]); // category
    sql.mockResolvedValueOnce([{ id: "user1" }]); // user
    sql.mockResolvedValueOnce([]); // no assignment
    const result = await authorizeCategoryAccess(
      { email: "dir@test.com", role: "director" },
      "cat1"
    );
    expect(result.authorized).toBe(false);
  });

  it("allows evaluator with active membership", async () => {
    sql.mockResolvedValueOnce([{ organization_id: "org1" }]); // category
    sql.mockResolvedValueOnce([{ id: "user1" }]); // user
    sql.mockResolvedValueOnce([{ id: "mem1" }]); // membership
    const result = await authorizeCategoryAccess(
      { email: "eval@test.com", role: "association_evaluator" },
      "cat1"
    );
    expect(result.authorized).toBe(true);
  });

  it("denies evaluator without membership", async () => {
    sql.mockResolvedValueOnce([{ organization_id: "org1" }]); // category
    sql.mockResolvedValueOnce([{ id: "user1" }]); // user
    sql.mockResolvedValueOnce([]); // no membership
    const result = await authorizeCategoryAccess(
      { email: "eval@test.com", role: "association_evaluator" },
      "cat1"
    );
    expect(result.authorized).toBe(false);
  });

  it("denies unknown role", async () => {
    sql.mockResolvedValueOnce([{ organization_id: "org1" }]); // category
    sql.mockResolvedValueOnce([{ id: "user1" }]); // user
    const result = await authorizeCategoryAccess(
      { email: "mystery@test.com", role: "unknown_role" },
      "cat1"
    );
    expect(result.authorized).toBe(false);
  });
});
