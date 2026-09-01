// generateParentNarrative resolves the model's chosen note INDICES back into
// real {session_number, note_text} objects (never trusting the model to echo
// text verbatim), caps the count, drops anything out of range, and only
// writes to report_links when a token is given (the internal director/SP
// preview reuses this with no report_links row to cache against).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/aiModel", () => ({ AI_MODEL: "claude-test" }));

import sql from "@/lib/db";
import { generateParentNarrative } from "@/lib/parentNarrative";

const NOTES = [
  { session_number: 1, note_text: "Skates well, vision with puck needs improvement" },
  { session_number: 1, note_text: "Good skater, hard worker" },
  { session_number: 2, note_text: "Weaker skater, lacking puck strength" },
  { session_number: 2, note_text: "Loses puck easily. Finds open areas during breakouts" },
];

function mockAnthropicResponse(input) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ content: [{ type: "tool_use", name: "submit_narrative", input }] }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterEach(() => { delete global.fetch; });

describe("generateParentNarrative — note selection", () => {
  it("resolves selected indices to real note objects, in the model's order", async () => {
    mockAnthropicResponse({ narrative: "A story.", selected_notes: [2, 3] });
    sql.mockResolvedValueOnce([]);

    const result = await generateParentNarrative({ token: "tok1", athlete: { first_name: "Brylee" }, category: { name: "U15 AA" }, skillProfile: [], testingProfile: [], progress: [], notes: NOTES });

    expect(result.ok).toBe(true);
    expect(result.selectedNotes).toEqual([NOTES[2], NOTES[3]]);
  });

  it("drops out-of-range indices rather than crashing", async () => {
    mockAnthropicResponse({ narrative: "A story.", selected_notes: [0, 99, -1] });
    sql.mockResolvedValueOnce([]);

    const result = await generateParentNarrative({ token: "tok1", athlete: {}, category: {}, skillProfile: [], testingProfile: [], progress: [], notes: NOTES });
    expect(result.selectedNotes).toEqual([NOTES[0]]);
  });

  it("caps the selection at 6 even if the model returns more", async () => {
    mockAnthropicResponse({ narrative: "A story.", selected_notes: [0, 1, 2, 3, 0, 1, 2, 3] });
    sql.mockResolvedValueOnce([]);

    const result = await generateParentNarrative({ token: "tok1", athlete: {}, category: {}, skillProfile: [], testingProfile: [], progress: [], notes: NOTES });
    expect(result.selectedNotes.length).toBeLessThanOrEqual(6);
  });

  it("treats a missing selected_notes field as an empty selection, not an error", async () => {
    mockAnthropicResponse({ narrative: "A story." });
    sql.mockResolvedValueOnce([]);

    const result = await generateParentNarrative({ token: "tok1", athlete: {}, category: {}, skillProfile: [], testingProfile: [], progress: [], notes: NOTES });
    expect(result.ok).toBe(true);
    expect(result.selectedNotes).toEqual([]);
  });

  it("persists narrative + selected_notes together when a token is given", async () => {
    mockAnthropicResponse({ narrative: "A story.", selected_notes: [1] });
    sql.mockResolvedValueOnce([]);

    await generateParentNarrative({ token: "tok1", athlete: {}, category: {}, skillProfile: [], testingProfile: [], progress: [], notes: NOTES });

    expect(sql).toHaveBeenCalledTimes(1);
    const query = sql.mock.calls[0][0].join("?");
    expect(query).toContain("UPDATE report_links");
    expect(query).toContain("selected_notes");
  });

  it("never touches the database when token is null (internal preview reuse)", async () => {
    mockAnthropicResponse({ narrative: "A story.", selected_notes: [1] });

    const result = await generateParentNarrative({ token: null, athlete: {}, category: {}, skillProfile: [], testingProfile: [], progress: [], notes: NOTES });
    expect(result.ok).toBe(true);
    expect(sql).not.toHaveBeenCalled();
  });

  it("still requires narrative -- a tool call missing it is a malformed response", async () => {
    mockAnthropicResponse({ selected_notes: [0] });
    const result = await generateParentNarrative({ token: "tok1", athlete: {}, category: {}, skillProfile: [], testingProfile: [], progress: [], notes: NOTES });
    expect(result.ok).toBe(false);
  });
});
