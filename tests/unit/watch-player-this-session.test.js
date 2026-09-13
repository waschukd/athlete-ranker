import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The star in Manage Groups used to flag the player for selectedSession + 1.
// A director building session 3's groups and starring a kid was flagging
// them for session 4, and had to go back to session 2 to flag anyone for
// session 3. The star now means: evaluators scoring THIS session watch this
// player closely. The read side (evaluator/scores) was always session-exact;
// only the page was off by one.

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const PAGE = strip(readFileSync(resolve(process.cwd(), "src/app/association/dashboard/category/[catId]/groups/page.jsx"), "utf8"));
const SCORES = strip(readFileSync(resolve(process.cwd(), "src/app/api/evaluator/scores/route.js"), "utf8"));

describe("the watch star applies to the session being managed", () => {
  it("flags for the selected session, not the next one", () => {
    expect(PAGE).toMatch(/const watchSession = selectedSession;/);
    expect(PAGE).not.toMatch(/selectedSession \+ 1/);
    expect(PAGE).not.toMatch(/nextSession/);
  });

  it("reads and writes the flag for that same session", () => {
    expect(PAGE).toMatch(/watch-players\?session_number=\$\{watchSession\}/);
    expect(PAGE).toMatch(/session_number: watchSession \}/);
  });

  it("tells the director which session the star is for", () => {
    expect(PAGE).toMatch(/watch this player closely in Session \$\{watchSession\}/);
  });

  it("the scoring screen reads the flag for the session being scored", () => {
    const block = SCORES.slice(SCORES.indexOf("FROM watch_players"), SCORES.indexOf("FROM watch_players") + 200);
    expect(block).toMatch(/session_number = \$\{/);
  });
});
