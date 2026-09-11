// Real gap flagged in a pre-tryout-weekend trust audit: report_links.token
// resolves to exactly one athlete_id, and buildAthleteReport is always called
// with that resolved id -- never a client-supplied one. The code is correct
// today; this pins it so a future refactor can't reintroduce a path where a
// token for one player renders another player's name or scores.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/reportProvider", () => ({
  resolveReportProvider: vi.fn().mockResolvedValue({}),
  isPurchasable: vi.fn().mockReturnValue(true),
  resolveReportPrice: vi.fn().mockResolvedValue({ priceCents: 3499 }),
}));
vi.mock("@/lib/analytics", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({
  checkAndRecord: vi.fn().mockResolvedValue({ allowed: true }),
  clientIp: vi.fn().mockReturnValue("1.2.3.4"),
}));
vi.mock("@/lib/reportData", () => ({ buildAthleteReport: vi.fn() }));
vi.mock("@/lib/parentNarrative", () => ({ generateParentNarrative: vi.fn() }));

import sql from "@/lib/db";
import { buildAthleteReport } from "@/lib/reportData";

function makeReq(token) {
  return new Request(`http://test/api/report/${token}`);
}

// Two different families' report links -- different tokens, different
// athletes, same org/category.
const LINKS = {
  "token-for-alex": { token: "token-for-alex", athlete_id: 501, age_category_id: 113, organization_id: 16, is_active: true, created_at: new Date(), org_name: "EFHA" },
  "token-for-sam": { token: "token-for-sam", athlete_id: 502, age_category_id: 113, organization_id: 16, is_active: true, created_at: new Date(), org_name: "EFHA" },
};

const REPORTS = {
  501: { athlete: { first_name: "Alex", last_name: "Athlete", position: "F", external_id: "A1" }, category: { name: "U13 AA", scoring_scale: 10 }, total_athletes: 40, skillProfile: [{ name: "Skating", value: 8 }] },
  502: { athlete: { first_name: "Sam", last_name: "Skater", position: "D", external_id: "A2" }, category: { name: "U13 AA", scoring_scale: 10 }, total_athletes: 40, skillProfile: [{ name: "Skating", value: 6 }] },
};

beforeEach(() => {
  vi.clearAllMocks();
  buildAthleteReport.mockImplementation(async (catId, athleteId) => REPORTS[athleteId] || null);
});

function mockLinkLookup(token) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    if (text.includes("FROM report_links rl")) return [LINKS[token]];
    if (text.includes("FROM report_purchases")) return [];
    return [];
  });
}

describe("GET /api/report/[token] — per-athlete scoping", () => {
  it("a token for Alex never returns Sam's name or scores", async () => {
    mockLinkLookup("token-for-alex");
    const { GET } = await import("@/app/api/report/[token]/route");
    const res = await GET(makeReq("token-for-alex"), { params: { token: "token-for-alex" } });
    const body = await res.json();

    expect(buildAthleteReport).toHaveBeenCalledWith(113, 501);
    expect(body.athlete.first_name).toBe("Alex");
    expect(JSON.stringify(body)).not.toContain("Sam");
  });

  it("a token for Sam never returns Alex's name or scores", async () => {
    mockLinkLookup("token-for-sam");
    const { GET } = await import("@/app/api/report/[token]/route");
    const res = await GET(makeReq("token-for-sam"), { params: { token: "token-for-sam" } });
    const body = await res.json();

    expect(buildAthleteReport).toHaveBeenCalledWith(113, 502);
    expect(body.athlete.first_name).toBe("Sam");
    expect(JSON.stringify(body)).not.toContain("Alex");
  });

  it("404s a token that doesn't match any active report_links row", async () => {
    sql.mockImplementation(async (strings) => {
      const text = strings.join("?");
      if (text.includes("FROM report_links rl")) return [];
      return [];
    });
    const { GET } = await import("@/app/api/report/[token]/route");
    const res = await GET(makeReq("garbage"), { params: { token: "garbage" } });
    expect(res.status).toBe(404);
    expect(buildAthleteReport).not.toHaveBeenCalled();
  });

  it("free preview masks the last name to an initial and never ships the full skill profile", async () => {
    mockLinkLookup("token-for-alex");
    const { GET } = await import("@/app/api/report/[token]/route");
    const res = await GET(makeReq("token-for-alex"), { params: { token: "token-for-alex" } });
    const body = await res.json();
    expect(body.athlete.last_name).toBe("A.");
    expect(body.purchased).toBe(false);
    expect(body.locked).toContain("notes");
  });
});
