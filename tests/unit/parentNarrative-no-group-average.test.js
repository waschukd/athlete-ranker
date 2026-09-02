// Real incident: Brynlee King's narrative said "sat right at the group
// average", "matched the group average exactly", and "against a group
// average of 7.519" -- explicit peer-comparison language the report doesn't
// use in prose (the comparison already lives in the report's own tables/
// charts). The prompt itself used to actively suggest this ("a stat that
// exactly matches the group average" as an example, "naming one test's time
// next to its group average is fine and encouraged"), so this pins the
// prompt text itself, not just a rule that could be ignored.

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

describe("the prompt no longer invites literal group-average language", () => {
  it("never suggests a 'matches the group average' example", async () => {
    const getPrompt = capturePrompt();
    sql.mockResolvedValueOnce([]);
    await generateParentNarrative({
      token: "tok1", athlete: {}, category: {}, skillProfile: [], testingProfile: [], progress: [], notes: [],
    });
    expect(getPrompt()).not.toMatch(/matches the group average/i);
  });

  it("no longer tells the model naming a test's group average is encouraged", async () => {
    const getPrompt = capturePrompt();
    sql.mockResolvedValueOnce([]);
    await generateParentNarrative({
      token: "tok1", athlete: {}, category: {}, skillProfile: [], testingProfile: [], progress: [], notes: [],
    });
    expect(getPrompt()).not.toMatch(/next to its group average is fine and encouraged/i);
  });

  it("includes an explicit rule banning the phrase in prose", async () => {
    const getPrompt = capturePrompt();
    sql.mockResolvedValueOnce([]);
    await generateParentNarrative({
      token: "tok1", athlete: {}, category: {}, skillProfile: [], testingProfile: [], progress: [], notes: [],
    });
    const prompt = getPrompt();
    expect(prompt).toMatch(/NO-COMPARISON-LANGUAGE RULE/);
    expect(prompt).toMatch(/never use the phrase "group average/i);
  });
});
