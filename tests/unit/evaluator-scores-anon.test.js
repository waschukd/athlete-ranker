import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), getAppUserId: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

function makeReq() {
  return new Request(
    "http://test/api/evaluator/scores?schedule_id=s1&category_id=cat1"
  );
}

// The GET legacy path issues sql calls in this order:
//   1. getAppUserId → SELECT id FROM users (local helper)
//   2. SELECT evaluators_anonymous FROM age_categories
//   3. resolveHelmetMode → COALESCE(cat/org identify_by_helmet)
//   4. athletes query
//   5. scoring_categories query
function mockGetSql({ anonymous }) {
  sql.mockResolvedValueOnce([{ id: "u1" }]); // getAppUserId users lookup
  sql.mockResolvedValueOnce([{ evaluators_anonymous: anonymous }]); // flag
  sql.mockResolvedValueOnce([{ helmet: false }]); // resolveHelmetMode
  sql.mockResolvedValueOnce([
    {
      id: "a1",
      first_name: "Jane",
      last_name: "Doe",
      external_id: "EXT-123",
      position: "F",
      jersey_number: 7,
      team_color: "red",
      checked_in: true,
      scores: [],
    },
  ]); // athletes
  sql.mockResolvedValueOnce([{ id: "sc1", name: "Skating" }]); // scoring cats
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
  getSession.mockResolvedValue({ email: "e@test", role: "evaluator" });
});

describe("GET /api/evaluator/scores — anonymous evaluation privacy", () => {
  it("NULLs athlete names + external_id when category is anonymous", async () => {
    mockGetSql({ anonymous: true });
    const { GET } = await import("@/app/api/evaluator/scores/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.athletes).toHaveLength(1);
    const a = body.athletes[0];
    expect(a.first_name).toBeNull();
    expect(a.last_name).toBeNull();
    expect(a.external_id).toBeNull();
    // Non-identifying fields still present for jersey-based UI
    expect(a.jersey_number).toBe(7);
    expect(a.team_color).toBe("red");
    expect(a.position).toBe("F");
  });

  it("returns athlete names when category is NOT anonymous", async () => {
    mockGetSql({ anonymous: false });
    const { GET } = await import("@/app/api/evaluator/scores/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    const a = body.athletes[0];
    expect(a.first_name).toBe("Jane");
    expect(a.last_name).toBe("Doe");
    expect(a.external_id).toBe("EXT-123");
  });

  it("defaults to anonymous (NULL names) when the flag lookup is missing/null", async () => {
    sql.mockResolvedValueOnce([{ id: "u1" }]); // getAppUserId
    sql.mockResolvedValueOnce([]); // flag lookup returns no row
    sql.mockResolvedValueOnce([{ helmet: false }]); // resolveHelmetMode
    sql.mockResolvedValueOnce([
      { id: "a1", first_name: "Jane", last_name: "Doe", external_id: "EXT", scores: [] },
    ]);
    sql.mockResolvedValueOnce([]);
    const { GET } = await import("@/app/api/evaluator/scores/route");
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.athletes[0].first_name).toBeNull();
    expect(body.athletes[0].last_name).toBeNull();
    expect(body.athletes[0].external_id).toBeNull();
  });
});
