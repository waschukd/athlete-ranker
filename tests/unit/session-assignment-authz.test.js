// Who can manage who evaluates a session. The rule has a sharp edge: an
// association admin can do it ONLY when the association runs in-house — the
// moment a service provider serves them, the association is locked out and the
// SP (or a lead) takes over. Getting this wrong either strands an in-house
// association or lets an association admin override their SP.

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
const { default: sql } = await import("@/lib/db");
const { canManageSessionAssignments } = await import("@/lib/authorize");

// Route each query by content, so the helper's variable call-paths don't need a
// brittle fixed ordering. Each scenario knob defaults to "no rows".
function mockDb({ userId = 7, spServed = false, spContactMatch = false, isLead = false, spAdminUor = false, assocOwner = false, assocRole = false } = {}) {
  sql.mockReset();
  sql.mockImplementation((strings) => {
    const q = strings.join(" ").toLowerCase();
    if (q.includes("from users")) return Promise.resolve([{ id: userId }]);
    if (q.includes("sp_association_links")) {
      return Promise.resolve(spServed ? [{ sp_id: 99, contact_email: spContactMatch ? "sp@x.com" : "other@x.com" }] : []);
    }
    if (q.includes("is_lead = true")) return Promise.resolve(isLead ? [{ "1": 1 }] : []);
    if (q.includes("user_organization_roles")) {
      // Two distinct queries hit this table: the SP-admin check scopes to the
      // provider org ids with ANY(...); the association-admin check scopes to the
      // single association org. Route them apart.
      const isSpUor = q.includes("any(");
      return Promise.resolve((isSpUor ? spAdminUor : assocRole) ? [{ "1": 1 }] : []);
    }
    if (q.includes("from organizations where id")) return Promise.resolve(assocOwner ? [{ "1": 1 }] : []);
    return Promise.resolve([]);
  });
}

const S = (role, email = "u@x.com") => ({ role, email });

describe("canManageSessionAssignments", () => {
  it("super_admin can always, without touching the DB", async () => {
    mockDb();
    const r = await canManageSessionAssignments(S("super_admin"), 37);
    expect(r.authorized).toBe(true);
    expect(r.reason).toBe("super_admin");
  });

  it("a lead of the association can, even when an SP serves it", async () => {
    mockDb({ spServed: true, isLead: true });
    const r = await canManageSessionAssignments(S("association_evaluator"), 37);
    expect(r.authorized).toBe(true);
    expect(r.reason).toBe("lead");
    expect(r.isLead).toBe(true);
  });

  it("a lead can, when the association is in-house", async () => {
    mockDb({ spServed: false, isLead: true });
    const r = await canManageSessionAssignments(S("association_evaluator"), 37);
    expect(r.authorized).toBe(true);
    expect(r.reason).toBe("lead");
  });

  it("an SP admin can, for an association their SP serves (via contact email)", async () => {
    mockDb({ spServed: true, spContactMatch: true });
    const r = await canManageSessionAssignments(S("service_provider_admin", "sp@x.com"), 37);
    expect(r.authorized).toBe(true);
    expect(r.reason).toBe("sp_admin");
  });

  it("an SP admin can, for a served association (via an additional-admin role row)", async () => {
    mockDb({ spServed: true, spAdminUor: true });
    const r = await canManageSessionAssignments(S("service_provider_admin"), 37);
    expect(r.authorized).toBe(true);
    expect(r.reason).toBe("sp_admin");
  });

  it("an association admin CAN when in-house (owner)", async () => {
    mockDb({ spServed: false, assocOwner: true });
    const r = await canManageSessionAssignments(S("association_admin"), 37);
    expect(r.authorized).toBe(true);
    expect(r.reason).toBe("assoc_admin_inhouse");
  });

  it("an association admin CAN when in-house (org role row)", async () => {
    mockDb({ spServed: false, assocRole: true });
    const r = await canManageSessionAssignments(S("association_admin"), 37);
    expect(r.authorized).toBe(true);
  });

  it("an association admin is LOCKED OUT when an SP serves them — even as owner", async () => {
    // The load-bearing case: SP-served + would-be assoc admin ⇒ denied.
    mockDb({ spServed: true, assocOwner: true, assocRole: true });
    const r = await canManageSessionAssignments(S("association_admin"), 37);
    expect(r.authorized).toBe(false);
    expect(r.reason).toBe("sp_served_locked");
  });

  it("a random authenticated user cannot", async () => {
    mockDb({ spServed: false });
    const r = await canManageSessionAssignments(S("association_evaluator"), 37);
    expect(r.authorized).toBe(false);
    expect(r.reason).toBe("not_authorized");
  });

  it("refuses without a session or org", async () => {
    expect((await canManageSessionAssignments(null, 37)).authorized).toBe(false);
    expect((await canManageSessionAssignments(S("super_admin"), null)).authorized).toBe(false);
  });
});
