// Real incident (BAHA "Grant factor"): a systematically generous evaluator
// only ever got corrected for it after the fact, in the rankings math, never
// surfaced to the person actually causing it. This combines that personal-
// bias signal with the existing group-range calibration into one popup
// payload for an evaluator opening a session.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), getAppUserId: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));

import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

function makeUrl({ catId = "66", sessionNumber = "2", groupNumber = "1" } = {}) {
  return new Request(`http://test/api/evaluator/session-guidance?category_id=${catId}&session_number=${sessionNumber}&group_number=${groupNumber}`);
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
  getSession.mockResolvedValue({ email: "eval@test", role: "service_provider_evaluator" });
  getAppUserId.mockResolvedValue(113);
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
});

describe("GET /api/evaluator/session-guidance", () => {
  it("returns applicable:false for a testing session (no group scoring)", async () => {
    mockSqlByQuery([
      ["SELECT scoring_scale", [{ scoring_scale: 10 }]],
      ["SELECT session_type", [{ session_type: "testing" }]],
    ]);
    const { GET } = await import("@/app/api/evaluator/session-guidance/route");
    const res = await GET(makeUrl({ sessionNumber: "1" }));
    const body = await res.json();
    expect(body).toEqual({ applicable: false });
  });

  it("returns a suggested range for group 1 when nobody has been scored yet", async () => {
    mockSqlByQuery([
      ["SELECT scoring_scale", [{ scoring_scale: 10 }]],
      ["SELECT session_type", [{ session_type: "scrimmage" }]],
      ["FROM session_groups", [{ n: 4 }]],
      ["WITH scored AS", []], // no scores yet this session
      ["FROM category_scores WHERE age_category_id", [{ total_n: 0, grand_mean: null, my_n: 0, my_mean: null }]],
    ]);
    const { GET } = await import("@/app/api/evaluator/session-guidance/route");
    const res = await GET(makeUrl({ groupNumber: "1" }));
    const body = await res.json();

    expect(body.applicable).toBe(true);
    expect(body.suggested_range).toEqual({ low: 7, high: 10 });
    expect(body.established_range).toBeNull();
    expect(body.prior_floor).toBeNull();
    expect(body.bias).toBeNull();
  });

  it("uses the established range and prior-group floor once real scores exist", async () => {
    mockSqlByQuery([
      ["SELECT scoring_scale", [{ scoring_scale: 10 }]],
      ["SELECT session_type", [{ session_type: "scrimmage" }]],
      ["FROM session_groups", [{ n: 4 }]],
      ["WITH scored AS", [
        { group_number: 1, floor: 6.5, ceiling: 9.0, athletes_counted: 12 },
      ]],
      ["FROM category_scores WHERE age_category_id", [{ total_n: 100, grand_mean: 6.0, my_n: 0, my_mean: null }]],
    ]);
    const { GET } = await import("@/app/api/evaluator/session-guidance/route");
    const res = await GET(makeUrl({ groupNumber: "2" }));
    const body = await res.json();

    expect(body.established_range).toBeNull(); // group 2 itself has no scores yet
    expect(body.prior_floor).toBe(6.5); // group 1's floor
  });

  it("surfaces a personal bias message once the evaluator has enough scores and a real gap", async () => {
    mockSqlByQuery([
      ["SELECT scoring_scale", [{ scoring_scale: 10 }]],
      ["SELECT session_type", [{ session_type: "scrimmage" }]],
      ["FROM session_groups", [{ n: 4 }]],
      ["WITH scored AS", []],
      ["FROM category_scores WHERE age_category_id", [{ total_n: 200, grand_mean: 5.7, my_n: 30, my_mean: 6.9 }]],
    ]);
    const { GET } = await import("@/app/api/evaluator/session-guidance/route");
    const res = await GET(makeUrl({ groupNumber: "1" }));
    const body = await res.json();

    expect(body.bias).toEqual({ delta: 1.2, direction: "higher", sample_size: 30 });
  });

  it("stays silent on bias when the evaluator doesn't have enough scores yet", async () => {
    mockSqlByQuery([
      ["SELECT scoring_scale", [{ scoring_scale: 10 }]],
      ["SELECT session_type", [{ session_type: "scrimmage" }]],
      ["FROM session_groups", [{ n: 4 }]],
      ["WITH scored AS", []],
      ["FROM category_scores WHERE age_category_id", [{ total_n: 200, grand_mean: 5.7, my_n: 3, my_mean: 9.0 }]],
    ]);
    const { GET } = await import("@/app/api/evaluator/session-guidance/route");
    const res = await GET(makeUrl({ groupNumber: "1" }));
    const body = await res.json();

    expect(body.bias).toBeNull();
  });

  it("stays silent on bias when the gap is too small to act on", async () => {
    mockSqlByQuery([
      ["SELECT scoring_scale", [{ scoring_scale: 10 }]],
      ["SELECT session_type", [{ session_type: "scrimmage" }]],
      ["FROM session_groups", [{ n: 4 }]],
      ["WITH scored AS", []],
      ["FROM category_scores WHERE age_category_id", [{ total_n: 200, grand_mean: 5.7, my_n: 30, my_mean: 5.8 }]],
    ]);
    const { GET } = await import("@/app/api/evaluator/session-guidance/route");
    const res = await GET(makeUrl({ groupNumber: "1" }));
    const body = await res.json();

    expect(body.bias).toBeNull();
  });
});
