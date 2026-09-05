// Real incident: the check-in screen listed players in RANK order (via
// player_group_assignments.display_order, set to the athlete's overall rank
// when groups are built -- see categories/[catId]/groups/route.js) instead
// of alphabetically. That silently told every volunteer running the check-in
// table who was ranked where within each group, just from list position.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(), signToken: vi.fn(), verifyToken: vi.fn(),
  getCurrentUser: vi.fn(), getAppUserId: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock("@/lib/categoryEvaluators", () => ({ resolveEvaluatorKind: vi.fn(async () => "skater") }));
vi.mock("@/lib/helmetMode", () => ({ resolveHelmetMode: vi.fn(async () => false) }));

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-checkin-order-suite";

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

function makeReq() {
  return new Request("http://test/api/checkin/sched1", { method: "GET" });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("GET /api/checkin/[scheduleId] — roster order", () => {
  it("returns the group's roster alphabetically, not in rank (display_order) order", async () => {
    getSession.mockResolvedValue({ email: "vol@test", role: "super_admin" });

    // Rank order (best to worst): Charlie Young (#1), Amy Baker (#2), Zeb
    // Adams (#3) -- the exact reverse of alphabetical by last name.
    const RANK_ORDERED = [
      { id: 1, first_name: "Charlie", last_name: "Young", checkin_id: "c1", jersey_number: null, team_color: "Red", checked_in: false, checked_in_at: null, display_order: 1 },
      { id: 2, first_name: "Amy", last_name: "Baker", checkin_id: "c2", jersey_number: null, team_color: "Blue", checked_in: false, checked_in_at: null, display_order: 2 },
      { id: 3, first_name: "Zeb", last_name: "Adams", checkin_id: "c3", jersey_number: null, team_color: "Red", checked_in: false, checked_in_at: null, display_order: 3 },
    ];
    const ALPHA_ORDERED = [RANK_ORDERED[2], RANK_ORDERED[1], RANK_ORDERED[0]]; // Adams, Baker, Young

    sql
      .mockResolvedValueOnce([{ age_category_id: "cat1" }])                 // authorizeCheckin
      .mockResolvedValueOnce([{ organization_id: "org1" }])                 // authorizeCategoryAccess (super_admin)
      .mockResolvedValueOnce([{                                            // scheduleInfo
        id: "sched1", category_id: "cat1", category_name: "U9",
        session_number: 2, group_number: 1, eval_format: "standard",
        sticky_jersey_numbers: false, org_name: "Test Org", position_tagging: false,
      }])
      .mockResolvedValueOnce([{ id: "cs1", team_colors: ["Red", "Blue"] }]) // checkinSession (exists)
      .mockResolvedValueOnce([])                                           // UPDATE checkin_sessions
      .mockResolvedValueOnce([{ id: "sg1" }])                              // sessionGroup
      .mockResolvedValueOnce([{ n: 3 }])                                   // assignedInSession -> useGroup=true
      .mockResolvedValueOnce(RANK_ORDERED)                                 // internal rank-ordered fetch (color seeding only)
      .mockResolvedValueOnce(ALPHA_ORDERED)                                // re-fetch actually returned to the client
      .mockResolvedValueOnce([{ id: "u1" }])                               // goalie check: users lookup
      .mockResolvedValueOnce([{ id: "u1" }])                               // my_closed: users lookup
      .mockResolvedValueOnce([]);                                          // my_closed: evaluator_session_signups

    const { GET } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await GET(makeReq(), { params: { scheduleId: "sched1" } });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.athletes.map(a => `${a.first_name} ${a.last_name}`)).toEqual([
      "Zeb Adams", "Amy Baker", "Charlie Young",
    ]);
  });
});
