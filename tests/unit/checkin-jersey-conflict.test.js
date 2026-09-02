// Real incident: two different players got checked in with the same jersey
// colour AND number at once (a volunteer hands out the same bib twice, or two
// players both default to the session's first colour). findJerseyConflict()
// in the route blocks that at write time with a "Whoops" 409 instead of
// silently letting both scorecards collide. Mirrors the mocking conventions
// in tests/unit/checkin-actions.test.js, but matches sql calls by substring
// (mockSqlByQuery) rather than a positional queue -- this feature adds extra
// SELECTs ahead of several existing writes, which makes a strict Once-queue
// order fragile to get right across five different action branches.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
  signToken: vi.fn(),
  verifyToken: vi.fn(),
  getCurrentUser: vi.fn(),
  getAppUserId: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-checkin-suite";

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

function makeReq(body) {
  return new Request("http://test/api/checkin/sched1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Matches by substring against the joined tagged-template strings, first
// match wins. Anything unmatched (mostly INSERT/UPDATE writes whose return
// value nothing reads) falls through to an empty array.
function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings, ...values) => {
    const text = strings.join("?");
    for (const [match, result] of responses) {
      if (text.includes(match)) return typeof result === "function" ? result(values) : result;
    }
    return [];
  });
}

const AUTH = [
  ["SELECT age_category_id FROM evaluation_schedule", [{ age_category_id: "catX" }]],
  ["SELECT organization_id FROM age_categories", [{ organization_id: "orgX" }]],
];
const GUARD = ["FROM athletes WHERE id", [{ id: "ath1" }]];
const CS = ["SELECT id, team_colors FROM checkin_sessions", [{ id: "cs1", team_colors: null }]];
const CONFLICT_ROW = [{ athlete_id: "ath2", first_name: "Jane", last_name: "Doe" }];

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ email: "root@test", role: "super_admin" });
});

function insertRan(substring = "INSERT INTO player_checkins") {
  return sql.mock.calls.some(c => c[0].join("?").includes(substring));
}

describe("checkin action — jersey conflict", () => {
  it("blocks with 409 and does not write when the color+number is already checked in", async () => {
    mockSqlByQuery([
      ...AUTH, GUARD, CS,
      ["pc.checked_in = true", CONFLICT_ROW],
    ]);

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "checkin", athlete_id: "ath1", jersey_number: 5, team_color: "Blue" }), {
      params: { scheduleId: "sched1" },
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("jersey_conflict");
    expect(body.error).toBe("Whoops — Jane Doe is already checked in as Blue #5.");
    expect(insertRan()).toBe(false);
  });

  it("succeeds when no one else holds that color+number", async () => {
    mockSqlByQuery([
      ...AUTH, GUARD, CS,
      ["pc.checked_in = true", []],
    ]);

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "checkin", athlete_id: "ath1", jersey_number: 5, team_color: "Blue" }), {
      params: { scheduleId: "sched1" },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(insertRan()).toBe(true);
  });

  it("checks the conflict against the existing row's color when none is sent on this request", async () => {
    mockSqlByQuery([
      ...AUTH, GUARD, CS,
      ["SELECT team_color FROM player_checkins", [{ team_color: "Grey" }]],
      ["pc.checked_in = true", []],
    ]);

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    await POST(makeReq({ action: "checkin", athlete_id: "ath1", jersey_number: 7 }), {
      params: { scheduleId: "sched1" },
    });

    const conflictCall = sql.mock.calls.find(c => c[0].join("?").includes("pc.checked_in = true"));
    expect(conflictCall[3]).toBe("Grey"); // scheduleId, jerseyNumber, teamColor, excludeAthleteId
  });
});

describe("update_jersey action — jersey conflict", () => {
  it("blocks with 409 when the athlete is already checked in and the new number collides", async () => {
    mockSqlByQuery([
      ...AUTH, GUARD, CS,
      ["SELECT team_color, checked_in FROM player_checkins", [{ team_color: "Blue", checked_in: true }]],
      ["pc.checked_in = true", CONFLICT_ROW],
    ]);

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "update_jersey", athlete_id: "ath1", jersey_number: 5 }), {
      params: { scheduleId: "sched1" },
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("jersey_conflict");
    expect(insertRan()).toBe(false);
  });

  it("does not check for a conflict when the athlete is not yet checked in", async () => {
    mockSqlByQuery([
      ...AUTH, GUARD, CS,
      ["SELECT team_color, checked_in FROM player_checkins", [{ team_color: "Blue", checked_in: false }]],
    ]);

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "update_jersey", athlete_id: "ath1", jersey_number: 5 }), {
      params: { scheduleId: "sched1" },
    });

    expect(res.status).toBe(200);
    expect(sql.mock.calls.some(c => c[0].join("?").includes("pc.checked_in = true"))).toBe(false);
    expect(insertRan()).toBe(true);
  });
});

describe("move_team action — jersey conflict", () => {
  it("blocks with 409 when the athlete is already checked in and the new color collides", async () => {
    mockSqlByQuery([
      ...AUTH, GUARD, CS,
      ["SELECT jersey_number, checked_in FROM player_checkins", [{ jersey_number: 5, checked_in: true }]],
      ["pc.checked_in = true", CONFLICT_ROW],
    ]);

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "move_team", athlete_id: "ath1", team_color: "Blue" }), {
      params: { scheduleId: "sched1" },
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("jersey_conflict");
    expect(insertRan()).toBe(false);
  });

  it("does not check for a conflict when the athlete is not yet checked in", async () => {
    mockSqlByQuery([
      ...AUTH, GUARD, CS,
      ["SELECT jersey_number, checked_in FROM player_checkins", [{ jersey_number: 5, checked_in: false }]],
    ]);

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "move_team", athlete_id: "ath1", team_color: "Blue" }), {
      params: { scheduleId: "sched1" },
    });

    expect(res.status).toBe(200);
    expect(sql.mock.calls.some(c => c[0].join("?").includes("pc.checked_in = true"))).toBe(false);
  });
});

describe("add_player action — jersey conflict", () => {
  it("blocks with 409 when the new player's color+number is already checked in", async () => {
    mockSqlByQuery([
      ...AUTH, CS,
      ["JOIN age_categories ac ON ac.id = es.age_category_id", [{ organization_id: "orgX", cat_id: "catX", session_number: 1, group_number: 1 }]],
      ["INSERT INTO athletes", [{ id: "athNew", first_name: "New", last_name: "Kid" }]],
      ["FROM session_groups", []],
      ["pc.checked_in = true", CONFLICT_ROW],
    ]);

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "add_player", first_name: "New", last_name: "Kid", jersey_number: 5, team_color: "Blue" }), {
      params: { scheduleId: "sched1" },
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("jersey_conflict");
    // The athlete row itself was already created before the conflict check
    // (an accepted tradeoff) -- but it must not also be checked in.
    expect(insertRan("INSERT INTO player_checkins")).toBe(false);
  });
});

describe("add_existing action — jersey conflict", () => {
  it("blocks with 409, carrying forward the athlete's existing jersey/color", async () => {
    mockSqlByQuery([
      ...AUTH, GUARD,
      ["SELECT session_number, group_number FROM evaluation_schedule", [{ session_number: 1, group_number: 1 }]],
      ["FROM session_groups", []],
      ["SELECT id, team_colors FROM checkin_sessions", [{ id: "cs1", team_colors: null }]],
      ["SELECT jersey_number, team_color FROM player_checkins", [{ jersey_number: 5, team_color: "Blue" }]],
      ["pc.checked_in = true", CONFLICT_ROW],
    ]);

    const { POST } = await import("@/app/api/checkin/[scheduleId]/route");
    const res = await POST(makeReq({ action: "add_existing", athlete_id: "ath1" }), {
      params: { scheduleId: "sched1" },
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("jersey_conflict");
    expect(body.error).toBe("Whoops — Jane Doe is already checked in as Blue #5.");
    expect(insertRan()).toBe(false);
  });
});
