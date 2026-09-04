// Real incident: BAHA's U13 AA category (already live, mid-tryout) crashed
// with a bare 500 when the Setup -> Scoring step was saved with an empty
// scoring_scale field. scoring_scale/scoring_increment are real INTEGER/
// NUMERIC columns -- an empty string fails the Postgres cast with an
// uncaught exception, and the route's catch-all swallowed it with zero
// logging, so there was no trace of what actually broke. Because the crash
// landed on the UPDATE (before the DELETE that recreates scoring_categories),
// no live data was lost -- but a payload that got even slightly further
// (e.g. a valid scoring_scale but no `categories` array) could have wiped a
// live category's scoring criteria without recreating them. This validates
// the input up front and rejects with a real 400 message instead.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), getAppUserId: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/scheduleNotify", () => ({ notifySessionChange: vi.fn() }));

import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

function makeReq(body) {
  return new Request("http://test/api/categories/66/setup", {
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
  getSession.mockResolvedValue({ email: "assoc@test", role: "association_admin", name: "Lisa" });
  getAppUserId.mockResolvedValue("user1");
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
  mockSqlByQuery([
    ["SELECT setup_complete", [{ setup_complete: true, organization_id: 37, created_at: "2026-07-14" }]],
  ]);
});

describe("POST /api/categories/[catId]/setup — scoring step validation", () => {
  it("rejects an empty scoring_scale with a real 400 instead of crashing", async () => {
    const { POST } = await import("@/app/api/categories/[catId]/setup/route");
    const res = await POST(makeReq({
      step: "scoring",
      data: { scoring_scale: "", scoring_increment: "0.5", categories: [{ name: "Skating" }] },
    }), { params: { catId: "66" } });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/scoring scale/i);
    // The DELETE that would wipe scoring_categories must never run on a
    // rejected payload.
    expect(sql.mock.calls.some(c => c[0].join("?").includes("DELETE FROM scoring_categories"))).toBe(false);
  });

  it("rejects an empty scoring_increment the same way", async () => {
    const { POST } = await import("@/app/api/categories/[catId]/setup/route");
    const res = await POST(makeReq({
      step: "scoring",
      data: { scoring_scale: "10", scoring_increment: "", categories: [{ name: "Skating" }] },
    }), { params: { catId: "66" } });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/scoring increment/i);
  });

  it("rejects a missing categories array before touching the DB", async () => {
    const { POST } = await import("@/app/api/categories/[catId]/setup/route");
    const res = await POST(makeReq({
      step: "scoring",
      data: { scoring_scale: "10", scoring_increment: "0.5" },
    }), { params: { catId: "66" } });

    expect(res.status).toBe(400);
    expect(sql.mock.calls.some(c => c[0].join("?").includes("UPDATE age_categories"))).toBe(false);
  });

  it("saves normally with a valid payload (no scoring categories existed yet)", async () => {
    mockSqlByQuery([
      ["SELECT setup_complete", [{ setup_complete: true, organization_id: 37, created_at: "2026-07-14" }]],
      ["SELECT id, display_order FROM scoring_categories", []],
      ["UPDATE age_categories", []],
      ["INSERT INTO scoring_categories", []],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/setup/route");
    const res = await POST(makeReq({
      step: "scoring",
      data: {
        scoring_scale: "10", scoring_increment: "0.5", position_tagging: true,
        categories: [{ name: "Skating", applies_to: "all" }, { name: "Puck Skills", applies_to: "all" }],
      },
    }), { params: { catId: "66" } });

    expect(res.status).toBe(200);
    const updateCall = sql.mock.calls.find(c => c[0].join("?").includes("UPDATE age_categories"));
    expect(updateCall[1]).toBe(10);   // scoringScale bound as a real number, not ""
    expect(updateCall[2]).toBe(0.5);  // scoringIncrement bound as a real number
    expect(sql.mock.calls.filter(c => c[0].join("?").includes("INSERT INTO scoring_categories")).length).toBe(2);
  });

  // Real incident: BAHA's U11/U13/U15 AA were all mid-tryout with real
  // category_scores already recorded against their scoring_categories rows.
  // The old blanket DELETE-then-recreate threw a foreign-key violation on
  // every single re-save of this step from then on, with no way to ever
  // save it again short of deleting live scores.
  it("updates existing scoring categories in place instead of deleting them once scores exist", async () => {
    mockSqlByQuery([
      ["SELECT setup_complete", [{ setup_complete: true, organization_id: 37, created_at: "2026-07-14" }]],
      ["SELECT id, display_order FROM scoring_categories", [{ id: 492, display_order: 0 }, { id: 493, display_order: 1 }]],
      ["UPDATE age_categories", []],
      ["UPDATE scoring_categories", []],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/setup/route");
    const res = await POST(makeReq({
      step: "scoring",
      data: {
        scoring_scale: "10", scoring_increment: "0.5",
        categories: [{ name: "Skating (renamed)", applies_to: "all" }, { name: "Puck Skills", applies_to: "all" }],
      },
    }), { params: { catId: "66" } });

    expect(res.status).toBe(200);
    expect(sql.mock.calls.some(c => c[0].join("?").includes("DELETE FROM scoring_categories"))).toBe(false);
    const updateCalls = sql.mock.calls.filter(c => c[0].join("?").includes("UPDATE scoring_categories"));
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0][1]).toBe("Skating (renamed)");
  });

  it("rejects removing a scoring category that already has recorded scores", async () => {
    mockSqlByQuery([
      ["SELECT setup_complete", [{ setup_complete: true, organization_id: 37, created_at: "2026-07-14" }]],
      ["SELECT id, display_order FROM scoring_categories", [{ id: 492, display_order: 0 }, { id: 493, display_order: 1 }]],
      ["SELECT 1 FROM category_scores WHERE scoring_category_id", [{ "?column?": 1 }]],
    ]);

    const { POST } = await import("@/app/api/categories/[catId]/setup/route");
    const res = await POST(makeReq({
      step: "scoring",
      data: { scoring_scale: "10", scoring_increment: "0.5", categories: [{ name: "Skating", applies_to: "all" }] },
    }), { params: { catId: "66" } });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already has recorded scores/i);
    // Must reject before touching age_categories or scoring_categories at all.
    expect(sql.mock.calls.some(c => c[0].join("?").includes("UPDATE age_categories"))).toBe(false);
  });
});
