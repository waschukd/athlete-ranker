// The AI scouting narrative used to compute its own "Approximate Rank" via a
// raw AVG(score) query, independent of computeCategoryRankings -- for
// round_robin categories that could name a different rank than the Rankings
// tab for the exact same player. It now reads from the same single source of
// truth as every other ranking display.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), getAppUserId: vi.fn(async () => 1) }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn(async () => ({ authorized: true, orgId: "orgX" })) }));
vi.mock("@/lib/rateLimit", () => ({ checkAndRecord: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/aiModel", () => ({ AI_MODEL: "test-model" }));
vi.mock("@/lib/rankings", () => ({
  computeCategoryRankings: vi.fn(async () => ({
    athletes: [
      { id: 7, rank: 3 },
      { id: 8, rank: 1 },
      { id: 9, rank: 2 },
    ],
    goalies: [],
  })),
}));

const { default: sql } = await import("@/lib/db");
const { getSession } = await import("@/lib/auth");
const { computeCategoryRankings } = await import("@/lib/rankings");

function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) if (text.includes(match)) return result;
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";
  getSession.mockResolvedValue({ email: "root@test", role: "super_admin" });
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ content: [{ text: "A scouting report." }] }),
  }));
});

describe("scouting report — rank comes from the official ranking pipeline", () => {
  it("uses computeCategoryRankings' rank/pool size, not a raw AVG(score) query", async () => {
    mockSqlByQuery([
      ["FROM athletes WHERE id", [{ id: 7 }]],                                       // IDOR guard
      ["SELECT first_name, last_name, position FROM athletes", [{ first_name: "Sam", last_name: "Lee", position: "forward" }]],
      ["FROM age_categories", [{ name: "U13 AA", scoring_scale: 10 }]],
      ["FROM player_notes", [{ session_number: 1, note_text: "Strong on the forecheck.", evaluator_name: "Coach" }]],
      ["FROM category_scores", []],
    ]);

    const { POST } = await import("@/app/api/athletes/[athleteId]/scouting/route");
    const req = new Request("http://test/api/athletes/7/scouting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catId: "99" }),
    });
    const res = await POST(req, { params: { athleteId: "7" } });
    expect(res.status).toBe(200);

    expect(computeCategoryRankings).toHaveBeenCalledWith("99");
    const [, fetchOpts] = global.fetch.mock.calls[0];
    const sentPrompt = JSON.parse(fetchOpts.body).messages[0].content;
    expect(sentPrompt).toContain("Approximate Rank: 3 of 3");
  });
});
