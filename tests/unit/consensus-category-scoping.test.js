// Real gap found in a pre-tryout-weekend security audit: authorizeCategoryAccess
// only proves an evaluator has SOME active membership in the org that runs a
// category -- it never checks they're actually assigned to that specific
// category/group/session. An evaluator signed up only for, say, U9 Group 1
// could pass a U15 group's schedule_id here and get back real evaluator
// names plus raw per-category scores for a group they have no assignment to.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/scoring", () => ({ getTier: vi.fn() }));
vi.mock("@/lib/categoryEvaluators", () => ({ getCoachUserIds: vi.fn().mockResolvedValue([]) }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

function makeReq(qs) {
  return new Request(`http://test/api/categories/113/consensus?${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
});

describe("GET /api/categories/[catId]/consensus — category/group scoping", () => {
  it("403s an evaluator who is not signed up for the requested schedule", async () => {
    getSession.mockResolvedValue({ email: "eval@test", role: "association_evaluator" });
    sql.mockImplementation(async (strings) => {
      const text = strings.join("?");
      if (text.includes("SELECT id FROM users WHERE email")) return [{ id: 500 }];
      if (text.includes("FROM evaluator_session_signups WHERE user_id")) return []; // not signed up for this schedule
      return [];
    });

    const { GET } = await import("@/app/api/categories/[catId]/consensus/route");
    const res = await GET(makeReq("schedule_id=999&session=1"), { params: { catId: "113" } });
    expect(res.status).toBe(403);
  });

  it("403s an evaluator who omits schedule_id entirely (the unscoped fallback)", async () => {
    getSession.mockResolvedValue({ email: "eval@test", role: "association_evaluator" });
    sql.mockResolvedValue([]);
    const { GET } = await import("@/app/api/categories/[catId]/consensus/route");
    const res = await GET(makeReq("session=1"), { params: { catId: "113" } });
    expect(res.status).toBe(403);
  });

  it("allows an evaluator who IS signed up for the requested schedule", async () => {
    getSession.mockResolvedValue({ email: "eval@test", role: "association_evaluator" });
    sql.mockImplementation(async (strings) => {
      const text = strings.join("?");
      if (text.includes("SELECT id FROM users WHERE email")) return [{ id: 500 }];
      if (text.includes("FROM evaluator_session_signups WHERE user_id")) return [{ id: 1 }]; // signed up
      if (text.includes("FROM age_categories WHERE id")) return [{ scoring_scale: 10 }];
      if (text.includes("SELECT group_number FROM evaluation_schedule")) return [{ group_number: 1 }];
      return [];
    });

    const { GET } = await import("@/app/api/categories/[catId]/consensus/route");
    const res = await GET(makeReq("schedule_id=999&session=1"), { params: { catId: "113" } });
    expect(res.status).toBe(200);
  });

  it("skips the signup check entirely for a director/admin role", async () => {
    getSession.mockResolvedValue({ email: "director@test", role: "director" });
    sql.mockImplementation(async (strings) => {
      const text = strings.join("?");
      if (text.includes("FROM age_categories WHERE id")) return [{ scoring_scale: 10 }];
      if (text.includes("SELECT group_number FROM evaluation_schedule")) return [{ group_number: 1 }];
      return [];
    });

    const { GET } = await import("@/app/api/categories/[catId]/consensus/route");
    const res = await GET(makeReq("schedule_id=999&session=1"), { params: { catId: "113" } });
    expect(res.status).toBe(200);
    const signupCheck = sql.mock.calls.find(c => c[0].join("?").includes("FROM evaluator_session_signups WHERE user_id"));
    expect(signupCheck).toBeUndefined();
  });
});
