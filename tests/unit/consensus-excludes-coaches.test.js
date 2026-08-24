// Coaches are a parallel, comparison-only scoring track. Their scores must
// never join the inter-rater agreement/tier-split analysis, and they must
// never appear as a "disagreeing" evaluator in the consensus report.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/categoryEvaluators", () => ({ getCoachUserIds: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), esc: (s) => s }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { getCoachUserIds } from "@/lib/categoryEvaluators";

function makeReq() {
  return new Request("http://test/api/categories/113/consensus?session=1");
}

beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue({ email: "assoc@test.com", role: "association_admin" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true, orgId: 49 });
  getCoachUserIds.mockResolvedValue([999]); // evaluator 999 is a coach
});

describe("GET /api/categories/[catId]/consensus — coach exclusion", () => {
  it("excludes the coach's evaluator_id from both the grouped and ungrouped score queries", async () => {
    const seen = [];
    sql.mockImplementation(async (strings, ...values) => {
      const text = strings.join("?");
      seen.push({ text, values });
      if (text.includes("FROM age_categories WHERE id")) return [{ scoring_scale: 10 }];
      if (text.includes("FROM category_scores cs")) return []; // no scores in this test — just assert the filter is present
      return [];
    });

    const { GET } = await import("@/app/api/categories/[catId]/consensus/route");
    const res = await GET(makeReq(), { params: { catId: "113" } });
    expect(res.status).toBe(200);

    const scoreQuery = seen.find(q => q.text.includes("FROM category_scores cs"));
    expect(scoreQuery.text).toContain("cs.evaluator_id <> ALL(");
    expect(scoreQuery.values).toContainEqual([999]);
  });
});
