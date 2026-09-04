// Real incident: BAHA U9 (and other associations) showed "0/54 checked in"
// for Group 1 on the schedule summary, but the check-in page itself showed
// "0/29" for the exact same group. Root cause: player_checkins rows are
// seeded lazily and never cleaned up when a player is later reassigned to a
// different group for the same session -- the old query blindly counted
// every historical row a schedule had ever accumulated instead of the
// CURRENT roster, same as the check-in page computes it.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-checkin-summary";

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

function makeReq() { return new Request("http://test/api/categories/cat1/checkin-summary"); }

function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) if (text.includes(match)) return result;
    return [];
  });
}

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

  it("ignores stale checkin rows left behind by a player who moved to a different group", async () => {
    getSession.mockResolvedValue({ email: "root@test", role: "super_admin" });
    mockSqlByQuery([
      ["FROM age_categories", [{ organization_id: "org1" }]], // authorizeCategoryAccess (super_admin)
      ["FROM evaluation_schedule", [{ schedule_id: "s1", session_number: 1, group_number: 1 }]],
      ["FROM session_groups", [
        // Only athletes 1 and 2 are CURRENTLY assigned to group 1.
        { session_number: 1, group_number: 1, athlete_id: 1 },
        { session_number: 1, group_number: 1, athlete_id: 2 },
      ]],
      ["FROM athletes WHERE age_category_id", [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]],
      ["schedule_id = ANY(", [
        // Athletes 3 and 4 have stale rows for this schedule from before they
        // were moved to a different group -- neither is currently assigned.
        { schedule_id: "s1", athlete_id: 1, checked_in: true },
        { schedule_id: "s1", athlete_id: 3, checked_in: true },
        { schedule_id: "s1", athlete_id: 4, checked_in: false },
      ]],
    ]);
    const { GET } = await import("@/app/api/categories/[catId]/checkin-summary/route");
    const res = await GET(makeReq(), { params: { catId: "cat1" } });
    const body = await res.json();

    // Total must reflect the CURRENT roster (2), not the 3 historical rows
    // this schedule has accumulated. Checked-in must only count athlete 1
    // (currently assigned and checked in) -- athlete 3's stale "checked in"
    // row does not count since athlete 3 no longer belongs to this group.
    expect(body.sessions).toEqual([
      { schedule_id: "s1", session_number: 1, group_number: 1, checked_in: 1, total: 2 },
    ]);
  });

  it("falls back to the whole active roster when a session has never been grouped", async () => {
    getSession.mockResolvedValue({ email: "root@test", role: "super_admin" });
    mockSqlByQuery([
      ["FROM age_categories", [{ organization_id: "org1" }]],
      ["FROM evaluation_schedule", [{ schedule_id: "s1", session_number: 1, group_number: 1 }]],
      ["FROM session_groups", []], // no assignments exist anywhere for this session
      ["FROM athletes WHERE age_category_id", [{ id: 1 }, { id: 2 }, { id: 3 }]],
      ["schedule_id = ANY(", [
        { schedule_id: "s1", athlete_id: 1, checked_in: true },
      ]],
    ]);
    const { GET } = await import("@/app/api/categories/[catId]/checkin-summary/route");
    const res = await GET(makeReq(), { params: { catId: "cat1" } });
    const body = await res.json();

    expect(body.sessions[0]).toEqual({ schedule_id: "s1", session_number: 1, group_number: 1, checked_in: 1, total: 3 });
  });

  it("shows a group with zero current assignments as empty, not a whole-roster fallback, when the session IS otherwise grouped", async () => {
    getSession.mockResolvedValue({ email: "root@test", role: "super_admin" });
    mockSqlByQuery([
      ["FROM age_categories", [{ organization_id: "org1" }]],
      ["FROM evaluation_schedule", [
        { schedule_id: "s1", session_number: 1, group_number: 1 },
        { schedule_id: "s2", session_number: 1, group_number: 2 },
      ]],
      ["FROM session_groups", [
        // Only group 1 has assignments; group 2 is a real, legitimately
        // empty group -- it must NOT fall back to the whole active roster,
        // since the session as a whole has been grouped.
        { session_number: 1, group_number: 1, athlete_id: 1 },
      ]],
      ["FROM athletes WHERE age_category_id", [{ id: 1 }, { id: 2 }, { id: 3 }]],
      ["schedule_id = ANY(", []],
    ]);
    const { GET } = await import("@/app/api/categories/[catId]/checkin-summary/route");
    const res = await GET(makeReq(), { params: { catId: "cat1" } });
    const body = await res.json();

    expect(body.sessions.find(s => s.schedule_id === "s1").total).toBe(1);
    expect(body.sessions.find(s => s.schedule_id === "s2").total).toBe(0);
  });
});
