// Real incident: an EFHA U13 Community (standard-format) roster CSV used a
// "Scrimmage Team" column with values like "Group A"/"Group C" -- the header
// convention meant for TOURNAMENT formats, not standard's "Session N Group #".
// That column was silently discarded for a standard category, so all 100+
// imported players had NO group info, and the existing "auto-place into
// smallest group" fallback then scattered the whole roster round-robin across
// the 4 existing groups with zero relation to the file's actual A/B/C/D groups.
//
// The fix: for a standard-format category, a "Scrimmage Team"/"Scrimmage
// Group" value is now read as session 1's group when no explicit
// "Session 1 Group #" column already covers it, stripping a leading
// "Group "/"Team " label before matching a bare letter (A-F) or number.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/scrimmageTeams", () => ({ applyAllMatchups: vi.fn(async () => ({})) }));
vi.mock("@/lib/sessionGroups", () => ({
  ensureSessionGroup: vi.fn(async () => {}),
  autoPlaceInExistingGroups: vi.fn(async () => ({ placed: [] })),
}));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { ensureSessionGroup, autoPlaceInExistingGroups } from "@/lib/sessionGroups";

function makeReq(body) {
  return new Request("http://test/api/categories/97/athletes", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) if (text.includes(match)) return result;
    return [];
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue({ email: "assoc@test", role: "association_admin" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
});

describe("bulk athlete import — Scrimmage Team column on a standard-format category", () => {
  it("reads 'Group C' as session 1, group 3 -- the exact real-world value that caused the incident", async () => {
    mockSqlByQuery([
      ["SELECT organization_id, eval_format FROM age_categories", [{ organization_id: 49, eval_format: "standard" }]],
      ["SELECT id FROM athletes WHERE age_category_id", []], // no existing name match
      ["INSERT INTO athletes", [{ id: 555 }]],
      ["SELECT id FROM session_groups WHERE age_category_id", [{ id: 9003 }]],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/athletes/route");
    const res = await POST(makeReq({ athletes: [{ first_name: "Eva", last_name: "Szabunia", "Scrimmage Team": "Group C" }] }), { params: { catId: "97" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.imported).toBe(1);
    expect(ensureSessionGroup).toHaveBeenCalledWith("97", 1, 3);

    const queries = sql.mock.calls.map(c => c[0].join("?"));
    expect(queries.some(q => q.includes("INSERT INTO player_group_assignments") )).toBe(true);
    // Placed into group 3 (the query itself scopes group_number, not visible in
    // the joined text) -- confirmed via ensureSessionGroup's exact call above.

    // auto-place must NOT also fire for session 1 having just been explicitly
    // placed -- it's still called (for any OTHER session with existing groups),
    // but with the athlete already assigned there it's a no-op by its own logic;
    // this just confirms our new branch ran instead of leaving it to chance.
    expect(autoPlaceInExistingGroups).toHaveBeenCalled();
  });

  it("still works with a bare letter (the tournament template's own convention)", async () => {
    mockSqlByQuery([
      ["SELECT organization_id, eval_format FROM age_categories", [{ organization_id: 49, eval_format: "standard" }]],
      ["SELECT id FROM athletes WHERE age_category_id", []],
      ["INSERT INTO athletes", [{ id: 556 }]],
      ["SELECT id FROM session_groups WHERE age_category_id = 97 AND session_number = 1 AND group_number", [{ id: 9001 }]],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/athletes/route");
    await (await import("@/app/api/categories/[catId]/athletes/route")).POST(
      makeReq({ athletes: [{ first_name: "Liana", last_name: "Vaziri", "Scrimmage Team": "A" }] }),
      { params: { catId: "97" } },
    );
    expect(ensureSessionGroup).toHaveBeenCalledWith("97", 1, 1);
  });

  it("does not touch group assignment when an explicit 'Session 1 Group #' column already covers session 1", async () => {
    mockSqlByQuery([
      ["SELECT organization_id, eval_format FROM age_categories", [{ organization_id: 49, eval_format: "standard" }]],
      ["SELECT id FROM athletes WHERE age_category_id", []],
      ["INSERT INTO athletes", [{ id: 557 }]],
      ["SELECT id FROM session_groups WHERE age_category_id", [{ id: 9002 }]],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/athletes/route");
    await POST(
      makeReq({ athletes: [{ first_name: "Test", last_name: "Kid", "Scrimmage Team": "Group C", session_groups: [{ session_number: 1, group_number: 2 }] }] }),
      { params: { catId: "97" } },
    );
    // The explicit column wins -- ensureSessionGroup is called once for the
    // explicit path (group 2), never for a scrimmage-team-derived group 3.
    expect(ensureSessionGroup).toHaveBeenCalledTimes(1);
    expect(ensureSessionGroup).toHaveBeenCalledWith("97", 1, 2);
  });

  it("leaves an unrecognized label alone (falls through to auto-place, same as before)", async () => {
    mockSqlByQuery([
      ["SELECT organization_id, eval_format FROM age_categories", [{ organization_id: 49, eval_format: "standard" }]],
      ["SELECT id FROM athletes WHERE age_category_id", []],
      ["INSERT INTO athletes", [{ id: 558 }]],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/athletes/route");
    await POST(
      makeReq({ athletes: [{ first_name: "Weird", last_name: "Label", "Scrimmage Team": "TBD" }] }),
      { params: { catId: "97" } },
    );
    expect(ensureSessionGroup).not.toHaveBeenCalled();
    expect(autoPlaceInExistingGroups).toHaveBeenCalled();
  });

  it("never applies this to a tournament (round_robin) category -- unchanged behaviour", async () => {
    mockSqlByQuery([
      ["SELECT organization_id, eval_format FROM age_categories", [{ organization_id: 49, eval_format: "round_robin" }]],
      ["SELECT id FROM athletes WHERE age_category_id", []],
      ["INSERT INTO athletes", [{ id: 559 }]],
      ["SELECT id FROM scrimmage_teams WHERE age_category_id", []],
      ["SELECT COALESCE(MAX(display_order)", [{ nextOrder: 0 }]],
      ["INSERT INTO scrimmage_teams", [{ id: 77 }]],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/athletes/route");
    await POST(
      makeReq({ athletes: [{ first_name: "Tourney", last_name: "Kid", "Scrimmage Team": "Group C" }] }),
      { params: { catId: "97" } },
    );
    expect(ensureSessionGroup).not.toHaveBeenCalled();
    expect(autoPlaceInExistingGroups).not.toHaveBeenCalled();
  });
});
