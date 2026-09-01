// The internal director/SP report preview (/api/athletes/[athleteId]/report)
// reuses the same non-contradictory note selection as the parent report, but
// its notes carry evaluator names (directors are authorized to see who wrote
// what) -- the AI call must never see those names (same privacy bar as the
// parent-facing call), so names get stripped before selection and
// re-attached to the chosen notes afterward.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/authorize", () => ({ authorizeCategoryAccess: vi.fn() }));
vi.mock("@/lib/reportData", () => ({ buildAthleteReport: vi.fn() }));
vi.mock("@/lib/parentNarrative", () => ({ generateParentNarrative: vi.fn() }));

import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { buildAthleteReport } from "@/lib/reportData";
import { generateParentNarrative } from "@/lib/parentNarrative";

const REPORT_BASE = {
  athlete: { first_name: "Brylee", last_name: "King" },
  category: { name: "U15 AA" },
  standing: null, skillProfile: [], goalieSkillsProfile: [], testingProfile: [], progress: [],
  notes: [], serviceProvider: null, trainingProviders: [], total_athletes: 20,
};

function mockSqlByQuery(responses) {
  sql.mockImplementation(async (strings) => {
    const text = strings.join("?");
    for (const [match, result] of responses) if (text.includes(match)) return result;
    return [];
  });
}

const NAMED_NOTES = [
  { session_number: 1, note_text: "Good skater, hard worker", created_at: "2026-08-01", evaluator_name: "Coach A" },
  { session_number: 2, note_text: "Weaker skater, lacking puck strength", created_at: "2026-08-08", evaluator_name: "Coach B" },
];

beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue({ email: "director@efha.com", role: "director" });
  authorizeCategoryAccess.mockResolvedValue({ authorized: true });
  buildAthleteReport.mockResolvedValue(REPORT_BASE);
  process.env.ANTHROPIC_API_KEY = "test-key";
});

it("strips evaluator names before the AI call, then re-attaches them to the selected notes", async () => {
  mockSqlByQuery([
    ["FROM athletes WHERE id", [{ id: 1 }]],
    ["FROM category_sessions", []],
    ["FROM category_scores cs", []],
    ["FROM testing_drill_results", []],
    ["FROM player_notes pn", NAMED_NOTES],
  ]);
  generateParentNarrative.mockResolvedValueOnce({
    ok: true,
    narrative: "A story.",
    selectedNotes: [{ session_number: 2, note_text: "Weaker skater, lacking puck strength" }],
  });

  const { GET } = await import("@/app/api/athletes/[athleteId]/report/route");
  const res = await GET(new Request("http://test/api/athletes/1/report?cat=114"), { params: { athleteId: "1" } });
  const data = await res.json();

  // The AI never saw evaluator names.
  const [{ notes: notesArg }] = generateParentNarrative.mock.calls[0];
  expect(notesArg.every(n => !("evaluator_name" in n))).toBe(true);

  // But the final curatedNotes sent to the client has the name back.
  expect(data.curatedNotes).toEqual([NAMED_NOTES[1]]);
  expect(data.narrativeSummary).toBe("A story.");
});

it("degrades to null narrative/curatedNotes when there are no notes at all", async () => {
  mockSqlByQuery([
    ["FROM athletes WHERE id", [{ id: 1 }]],
    ["FROM category_sessions", []],
    ["FROM category_scores cs", []],
    ["FROM testing_drill_results", []],
    ["FROM player_notes pn", []],
  ]);

  const { GET } = await import("@/app/api/athletes/[athleteId]/report/route");
  const res = await GET(new Request("http://test/api/athletes/1/report?cat=114"), { params: { athleteId: "1" } });
  const data = await res.json();

  expect(generateParentNarrative).not.toHaveBeenCalled();
  expect(data.curatedNotes).toBeNull();
  expect(data.narrativeSummary).toBeNull();
});
