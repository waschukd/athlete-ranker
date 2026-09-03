// The "Rank by Category" table's own comment promises it "cannot disagree
// with the official ranking about the same player" (coach scores excluded
// the same way). That promise broke for round_robin categories once
// rankings.js started correcting for evaluator generosity/strictness but
// this route kept averaging raw scores -- this confirms the same correction
// now applies here too, gated the same way (round_robin only).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn(async () => ({ authorized: true, orgId: "orgX" })) }));
vi.mock("@/lib/categoryEvaluators", () => ({ getCoachUserIds: vi.fn(async () => []) }));

const { default: sql } = await import("@/lib/db");
const { getSession } = await import("@/lib/auth");

const ATHLETES = [
  { id: 1, first_name: "A1", last_name: "L1", position: "forward", helmet_number: null, is_active: true, cut_at: null },
  { id: 5, first_name: "A5", last_name: "L5", position: "forward", helmet_number: null, is_active: true, cut_at: null },
];

// Same shape as the rankings-evaluator-correction fixture: "hot" flat-9s
// athlete 1, "normal" flat-5s athlete 5, on one scoring category. Grand mean
// 7 -> both should land on a corrected 7.00 average for round_robin.
function rawRows() {
  return [
    { athlete_id: 1, scoring_category_id: 10, evaluator_id: "hot", session_number: 1, score: "9" },
    { athlete_id: 1, scoring_category_id: 10, evaluator_id: "hot", session_number: 1, score: "9" },
    { athlete_id: 1, scoring_category_id: 10, evaluator_id: "hot", session_number: 1, score: "9" },
    { athlete_id: 1, scoring_category_id: 10, evaluator_id: "hot", session_number: 1, score: "9" },
    { athlete_id: 1, scoring_category_id: 10, evaluator_id: "hot", session_number: 1, score: "9" },
    { athlete_id: 1, scoring_category_id: 10, evaluator_id: "hot", session_number: 1, score: "9" },
    { athlete_id: 1, scoring_category_id: 10, evaluator_id: "hot", session_number: 1, score: "9" },
    { athlete_id: 1, scoring_category_id: 10, evaluator_id: "hot", session_number: 1, score: "9" },
    { athlete_id: 5, scoring_category_id: 10, evaluator_id: "normal", session_number: 1, score: "5" },
    { athlete_id: 5, scoring_category_id: 10, evaluator_id: "normal", session_number: 1, score: "5" },
    { athlete_id: 5, scoring_category_id: 10, evaluator_id: "normal", session_number: 1, score: "5" },
    { athlete_id: 5, scoring_category_id: 10, evaluator_id: "normal", session_number: 1, score: "5" },
    { athlete_id: 5, scoring_category_id: 10, evaluator_id: "normal", session_number: 1, score: "5" },
    { athlete_id: 5, scoring_category_id: 10, evaluator_id: "normal", session_number: 1, score: "5" },
    { athlete_id: 5, scoring_category_id: 10, evaluator_id: "normal", session_number: 1, score: "5" },
    { athlete_id: 5, scoring_category_id: 10, evaluator_id: "normal", session_number: 1, score: "5" },
  ];
}

function mockRoute(evalFormat) {
  sql.mockReset();
  sql
    .mockResolvedValueOnce([{ id: 99, name: "Test Cat", scoring_scale: 10, evaluators_anonymous: false, eval_format: evalFormat }]) // category
    .mockResolvedValueOnce([{ id: 10, name: "Skating", applies_to: "all" }])                                                        // criteria
    .mockResolvedValueOnce(rawRows())                                                                                              // raw score rows
    .mockResolvedValueOnce(ATHLETES);                                                                                              // athletes
  getSession.mockResolvedValue({ email: "root@test", role: "super_admin" });
}

describe("skill-averages route — evaluator correction parity with rankings.js", () => {
  beforeEach(() => vi.clearAllMocks());

  it("equalizes hot vs normal evaluators for round_robin categories", async () => {
    mockRoute("round_robin");
    const { GET } = await import("@/app/api/categories/[catId]/skill-averages/route");
    const res = await GET(new Request("http://test/api/categories/99/skill-averages"), { params: { catId: "99" } });
    const body = await res.json();

    const a1 = body.athletes.find(a => a.athlete_id === 1);
    const a5 = body.athletes.find(a => a.athlete_id === 5);
    expect(a1.scores[10].avg).toBe(7);
    expect(a5.scores[10].avg).toBe(7);
    expect(a1.overall).toBe(7);
    expect(a5.overall).toBe(7);
  });

  it("leaves raw averages untouched for non-round_robin categories", async () => {
    mockRoute("standard");
    const { GET } = await import("@/app/api/categories/[catId]/skill-averages/route");
    const res = await GET(new Request("http://test/api/categories/99/skill-averages"), { params: { catId: "99" } });
    const body = await res.json();

    const a1 = body.athletes.find(a => a.athlete_id === 1);
    const a5 = body.athletes.find(a => a.athlete_id === 5);
    expect(a1.scores[10].avg).toBe(9);
    expect(a5.scores[10].avg).toBe(5);
  });
});
