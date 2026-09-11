// Real gap flagged in a pre-tryout-weekend trust audit: the code has always
// scoped this correctly (buildCoachesReport builds every team, then the route
// picks out only the one the token names), but nothing pinned that against a
// future regression -- e.g. someone "simplifying" this to return the whole
// report.teams array would silently hand every coach every other team's
// roster and ranking. This test fails loudly if that ever happens.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/calendar-token", () => ({ verifyCoachReportToken: vi.fn() }));
vi.mock("@/lib/coachesReport", () => ({ buildCoachesReport: vi.fn() }));

import sql from "@/lib/db";
import { verifyCoachReportToken } from "@/lib/calendar-token";
import { buildCoachesReport } from "@/lib/coachesReport";

function makeReq(token) {
  return new Request(`http://test/api/coach-report/${token}`);
}

const TWO_TEAM_REPORT = {
  category: { name: "U13 AA", org_name: "EFHA" },
  teams: [
    { id: 10, name: "Red", players: [{ name: "Alex Athlete" }], ranking: [1] },
    { id: 11, name: "Blue", players: [{ name: "Sam Skater" }], ranking: [1] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  buildCoachesReport.mockResolvedValue(TWO_TEAM_REPORT);
});

describe("GET /api/coach-report/[token] — one team per token", () => {
  it("a token for team 10 never returns team 11's roster", async () => {
    verifyCoachReportToken.mockReturnValue(10);
    sql.mockResolvedValueOnce([{ id: 10, age_category_id: 113 }]);

    const { GET } = await import("@/app/api/coach-report/[token]/route");
    const res = await GET(makeReq("token-for-team-10"), { params: { token: "token-for-team-10" } });
    const body = await res.json();

    expect(body.team.id).toBe(10);
    expect(body.team.players).toEqual([{ name: "Alex Athlete" }]);
    // The other team must not appear anywhere in the payload.
    expect(JSON.stringify(body)).not.toContain("Sam Skater");
    expect(JSON.stringify(body)).not.toContain("\"id\":11");
  });

  it("a token for team 11 never returns team 10's roster", async () => {
    verifyCoachReportToken.mockReturnValue(11);
    sql.mockResolvedValueOnce([{ id: 11, age_category_id: 113 }]);

    const { GET } = await import("@/app/api/coach-report/[token]/route");
    const res = await GET(makeReq("token-for-team-11"), { params: { token: "token-for-team-11" } });
    const body = await res.json();

    expect(body.team.id).toBe(11);
    expect(JSON.stringify(body)).not.toContain("Alex Athlete");
  });

  it("403s an invalid/expired token before touching the DB", async () => {
    verifyCoachReportToken.mockReturnValue(null);
    const { GET } = await import("@/app/api/coach-report/[token]/route");
    const res = await GET(makeReq("garbage"), { params: { token: "garbage" } });
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });
});
