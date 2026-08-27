// A player MOVED to another category (never one who is released) triggers an
// operational alert to whoever now owns that pool: the destination category's
// director, or the association's admin when it has none.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/email", () => ({
  emailPlayerCut: vi.fn().mockResolvedValue({ ok: true }),
  emailPlayerIncoming: vi.fn().mockResolvedValue({ ok: true }),
  parentEmails: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/emailTemplates", () => ({
  resolveTemplate: vi.fn().mockResolvedValue({ subject: "s", body: "b" }),
  renderTemplate: vi.fn((s) => s),
}));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { emailPlayerIncoming } from "@/lib/email";

const ATHLETE = { id: 1, first_name: "Sam", last_name: "Lee", age_category_id: 113 };
const FROM_CAT = { id: 113, name: "U13 AA", organization_id: 49 };
const TO_CAT = { id: 97, name: "U13 Community", organization_id: 49 };
const ORG = { name: "EFHA" };

function makeReq(body) {
  return new Request("http://test/api/categories/113/cut", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue({ email: "admin@test.com", role: "association_admin" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true, orgId: 49 });
});

describe("POST /api/categories/[catId]/cut — destination director/admin alert", () => {
  it("emails the destination category's director on a move", async () => {
    // fromCat and toCat resolve via the same query shape -- distinguish by call order.
    let call = 0;
    sql.mockImplementation(async (strings) => {
      const text = strings.join("?");
      if (text.includes("FROM athletes WHERE id")) return [ATHLETE];
      if (text.includes("SELECT id, name, organization_id FROM age_categories WHERE id")) {
        call++;
        return call === 1 ? [FROM_CAT] : [TO_CAT];
      }
      if (text.includes("FROM organizations WHERE id")) return [ORG];
      if (text.includes("FROM director_assignments da")) return [{ email: "director@test.com", name: "Dana Director" }];
      if (text.includes("UPDATE athletes SET cut_at")) return [];
      if (text.includes("INSERT INTO athletes")) return [];
      return [];
    });

    const { POST } = await import("@/app/api/categories/[catId]/cut/route");
    const res = await POST(makeReq({ athleteId: 1, mode: "move", toCategoryId: 97 }), { params: { catId: "113" } });
    expect(res.status).toBe(200);
    expect(emailPlayerIncoming).toHaveBeenCalledTimes(1);
    expect(emailPlayerIncoming).toHaveBeenCalledWith(expect.objectContaining({
      to: "director@test.com", playerName: "Sam Lee", toCategoryName: "U13 Community", fromCategoryName: "U13 AA", toCategoryId: 97,
    }));
  });

  it("falls back to the association admin when the destination has no director", async () => {
    let call = 0;
    sql.mockImplementation(async (strings) => {
      const text = strings.join("?");
      if (text.includes("FROM athletes WHERE id")) return [ATHLETE];
      if (text.includes("SELECT id, name, organization_id FROM age_categories WHERE id")) {
        call++;
        return call === 1 ? [FROM_CAT] : [TO_CAT];
      }
      if (text.includes("FROM organizations WHERE id")) return [ORG];
      if (text.includes("FROM director_assignments da")) return []; // no director
      if (text.includes("FROM user_organization_roles uor")) return [{ email: "admin@efha.com", name: "Assoc Admin" }];
      if (text.includes("FROM organizations o JOIN users u ON u.email")) return [{ email: "admin@efha.com", name: "Assoc Admin" }]; // same as role-table row -- should dedupe
      return [];
    });

    const { POST } = await import("@/app/api/categories/[catId]/cut/route");
    const res = await POST(makeReq({ athleteId: 1, mode: "move", toCategoryId: 97 }), { params: { catId: "113" } });
    expect(res.status).toBe(200);
    expect(emailPlayerIncoming).toHaveBeenCalledTimes(1); // deduped, not sent twice
    expect(emailPlayerIncoming).toHaveBeenCalledWith(expect.objectContaining({ to: "admin@efha.com" }));
  });

  it("never sends the director/admin alert on a release", async () => {
    sql.mockImplementation(async (strings) => {
      const text = strings.join("?");
      if (text.includes("FROM athletes WHERE id")) return [ATHLETE];
      if (text.includes("SELECT id, name, organization_id FROM age_categories WHERE id")) return [FROM_CAT];
      if (text.includes("FROM organizations WHERE id")) return [ORG];
      return [];
    });

    const { POST } = await import("@/app/api/categories/[catId]/cut/route");
    const res = await POST(makeReq({ athleteId: 1, mode: "release" }), { params: { catId: "113" } });
    expect(res.status).toBe(200);
    expect(emailPlayerIncoming).not.toHaveBeenCalled();
  });
});
