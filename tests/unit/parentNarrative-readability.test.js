// Real incident: a Fuzion U9 evaluator note read "Tall skateroff balance
// worksheet." -- a garbled, likely voice-dictation or fast-typing error that
// isn't real English. Nothing stopped the model from selecting it for
// verbatim display in "What the evaluators saw," which would read as broken
// and unprofessional to a parent. There's no reliable regex/dictionary way
// to catch every garbled note, so this is delegated to the model (which
// already reads and judges every note for contradiction/consistency) rather
// than a fragile heuristic that would also misfire on legitimate hockey
// shorthand and abbreviations.

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

describe("the prompt tells the model to skip garbled/unreadable notes", () => {
  it("includes an explicit readability rule with the real reported example", async () => {
    const getPrompt = capturePrompt();
    sql.mockResolvedValueOnce([]);
    await generateParentNarrative({
      token: "tok1", athlete: {}, category: {}, skillProfile: [], testingProfile: [], progress: [], notes: [],
    });
    const prompt = getPrompt();
    expect(prompt).toMatch(/READABILITY RULE/);
    expect(prompt).toMatch(/garbled, incoherent/i);
  });

  it("allows selecting fewer notes (or none) rather than including a garbled one", async () => {
    const getPrompt = capturePrompt();
    sql.mockResolvedValueOnce([]);
    await generateParentNarrative({
      token: "tok1", athlete: {}, category: {}, skillProfile: [], testingProfile: [], progress: [], notes: [],
    });
    expect(getPrompt()).toMatch(/fine to select fewer/i);
  });
});
