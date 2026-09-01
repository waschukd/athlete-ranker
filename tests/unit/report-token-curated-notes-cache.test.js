// The parent report's narrative paragraph AND its curated (non-contradictory)
// note selection are generated together by the same AI call and cached on
// report_links. This pins the caching/regeneration decision: regenerate
// whenever EITHER piece is missing (covers a report generated before
// selected_notes existed, or one where the prior call somehow only produced
// one of the two), reuse both when present, and degrade gracefully when the
// AI is unavailable.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({
  checkAndRecord: vi.fn().mockResolvedValue({ allowed: true }),
  clientIp: vi.fn().mockReturnValue("9.9.9.9"),
}));
vi.mock("@/lib/reportProvider", () => ({
  resolveReportProvider: vi.fn().mockResolvedValue({}),
  isPurchasable: vi.fn().mockReturnValue(true),
  resolveReportPrice: vi.fn().mockResolvedValue({ priceCents: 3499 }),
}));
vi.mock("@/lib/reportData", () => ({
  buildAthleteReport: vi.fn().mockResolvedValue({
    athlete: { first_name: "Brylee", last_name: "King" },
    category: { name: "U15 AA" },
    total_athletes: 20,
    standing: { tier: "Development", band: "12-20", total: 20 },
    skillProfile: [], goalieSkillsProfile: [], testingProfile: [], progress: [],
    notes: [{ session_number: 1, note_text: "Good skater" }, { session_number: 2, note_text: "Weaker skater" }],
    serviceProvider: null, trainingProviders: [],
  }),
}));
vi.mock("@/lib/parentNarrative", () => ({ generateParentNarrative: vi.fn() }));

import sql from "@/lib/db";
import { generateParentNarrative } from "@/lib/parentNarrative";
import { GET } from "@/app/api/report/[token]/route";

function makeReq() {
  return new Request("http://test/api/report/tok123", { headers: { "x-forwarded-for": "9.9.9.9" } });
}

const LINK_BASE = { organization_id: 49, athlete_id: 1, age_category_id: 114, org_name: "EFHA", created_at: new Date().toISOString() };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("GET /api/report/[token] — narrative + curated notes caching", () => {
  it("reuses both from cache without calling the AI when both are already stored", async () => {
    sql.mockResolvedValueOnce([{ ...LINK_BASE, narrative_summary: "Cached narrative.", selected_notes: [{ session_number: 2, note_text: "Weaker skater" }] }]);
    sql.mockResolvedValueOnce([{ id: 1 }]); // report_purchases: purchased

    const res = await GET(makeReq(), { params: { token: "tok123" } });
    const data = await res.json();

    expect(generateParentNarrative).not.toHaveBeenCalled();
    expect(data.narrativeSummary).toBe("Cached narrative.");
    expect(data.curatedNotes).toEqual([{ session_number: 2, note_text: "Weaker skater" }]);
  });

  it("regenerates when selected_notes is missing even though narrative_summary is cached", async () => {
    sql.mockResolvedValueOnce([{ ...LINK_BASE, narrative_summary: "Old cached narrative.", selected_notes: null }]);
    sql.mockResolvedValueOnce([{ id: 1 }]);
    generateParentNarrative.mockResolvedValueOnce({
      ok: true, narrative: "Fresh narrative.",
      selectedNotes: [{ session_number: 2, note_text: "Weaker skater" }],
    });

    const res = await GET(makeReq(), { params: { token: "tok123" } });
    const data = await res.json();

    expect(generateParentNarrative).toHaveBeenCalledTimes(1);
    expect(data.narrativeSummary).toBe("Fresh narrative.");
    expect(data.curatedNotes).toEqual([{ session_number: 2, note_text: "Weaker skater" }]);
  });

  it("regenerates when nothing is cached yet (brand new report)", async () => {
    sql.mockResolvedValueOnce([{ ...LINK_BASE, narrative_summary: null, selected_notes: null }]);
    sql.mockResolvedValueOnce([{ id: 1 }]);
    generateParentNarrative.mockResolvedValueOnce({
      ok: true, narrative: "Brand new narrative.",
      selectedNotes: [{ session_number: 1, note_text: "Good skater" }],
    });

    const res = await GET(makeReq(), { params: { token: "tok123" } });
    const data = await res.json();
    expect(data.narrativeSummary).toBe("Brand new narrative.");
    expect(data.curatedNotes).toEqual([{ session_number: 1, note_text: "Good skater" }]);
  });

  it("falls back to null curatedNotes (raw notes on the client) when the AI call fails", async () => {
    sql.mockResolvedValueOnce([{ ...LINK_BASE, narrative_summary: null, selected_notes: null }]);
    sql.mockResolvedValueOnce([{ id: 1 }]);
    generateParentNarrative.mockResolvedValueOnce({ ok: false, error: "AI service unavailable." });

    const res = await GET(makeReq(), { params: { token: "tok123" } });
    const data = await res.json();
    expect(data.narrativeSummary).toBeNull();
    expect(data.curatedNotes).toBeNull();
    expect(data.notes).toEqual([{ session_number: 1, note_text: "Good skater" }, { session_number: 2, note_text: "Weaker skater" }]);
  });

  it("never calls the AI when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    sql.mockResolvedValueOnce([{ ...LINK_BASE, narrative_summary: null, selected_notes: null }]);
    sql.mockResolvedValueOnce([{ id: 1 }]);

    const res = await GET(makeReq(), { params: { token: "tok123" } });
    const data = await res.json();
    expect(generateParentNarrative).not.toHaveBeenCalled();
    expect(data.curatedNotes).toBeNull();
  });
});
