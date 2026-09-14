// Dan's example: a bottom-ranked skater must never get a "good skater"
// comment quoted next to their actual grade. The note-vs-note consistency
// rule already caught contradictions BETWEEN selected notes, but nothing
// checked a note against the skill/testing NUMBERS themselves. A real-corpus
// scan showed a standalone regex guard (noteContradictionGuard.js) is too
// blunt for open-ended coaching text -- this pins the AI-driven instruction
// instead, since the model already judges note-vs-note consistency here and
// is far better suited to judge note-vs-data consistency too.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/aiModel", () => ({ AI_MODEL: "claude-test" }));

import sql from "@/lib/db";
import { generateParentNarrative } from "@/lib/parentNarrative";

function capturePrompt() {
  let sentBody = null;
  global.fetch = vi.fn().mockImplementation(async (url, opts) => {
    sentBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ content: [{ type: "tool_use", name: "submit_narrative", input: { narrative: "story", selected_notes: [] } }] }) };
  });
  return () => sentBody.messages[0].content;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterEach(() => { delete global.fetch; });

describe("the note-selection prompt includes a data-consistency instruction", () => {
  it("tells the model to cross-check a note's skill verdict against that skill's own numbers", async () => {
    const getPrompt = capturePrompt();
    sql.mockResolvedValueOnce([]);
    await generateParentNarrative({
      token: "tok1", athlete: {}, category: {}, skillProfile: [], testingProfile: [], progress: [], notes: [],
    });
    const prompt = getPrompt();
    expect(prompt).toMatch(/DATA-CONSISTENCY RULE/i);
    expect(prompt).toMatch(/contradict the SKILL PROFILE/i);
  });

  it("still allows a compliment paired with a different, unrelated area to improve", async () => {
    const getPrompt = capturePrompt();
    sql.mockResolvedValueOnce([]);
    await generateParentNarrative({
      token: "tok1", athlete: {}, category: {}, skillProfile: [], testingProfile: [], progress: [], notes: [],
    });
    expect(getPrompt()).toMatch(/normal coaching, not a contradiction/i);
  });
});
