import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Real complaint: session 2's groups are built FROM session 1's results, so
// the movement-flag "suggestions" (comparing a player's overall ranking
// against their current group) were comparing them against the exact data
// that already placed them there -- circular, not a new signal, and read as
// confusing rather than useful. Suggestions should only start at session 3+,
// once there's a genuinely later session's worth of results to flag against.

const PAGE = readFileSync(
  resolve(process.cwd(), "src/app/association/dashboard/category/[catId]/groups/page.jsx"),
  "utf8"
);

describe("Manage Groups movement suggestions only apply from session 3 onward", () => {
  it("the movement computation bails out below session 3", () => {
    const memoBody = PAGE.slice(PAGE.indexOf("const movement = useMemo"), PAGE.indexOf("}, [groups, groupPlayers, rankedAthletes, sdThreshold, selectedSession]);"));
    expect(memoBody).toMatch(/if \(!selectedSession \|\| selectedSession < 3\) return \{ up, down, why, pri \};/);
  });

  it("the movement flags meter (and sensitivity control) only render for session 3+", () => {
    const meterBlock = PAGE.slice(PAGE.indexOf("Movement flags meter"), PAGE.indexOf("Pre-assign jersey numbers"));
    expect(meterBlock).toMatch(/selectedSession >= 3 \?/);
  });

  it("the jersey pre-assign toggle still renders regardless of session -- unrelated to movement suggestions", () => {
    // It sits in the same row but outside the selectedSession >= 3 branch.
    const meterBlock = PAGE.slice(PAGE.indexOf("Movement flags meter"), PAGE.indexOf("Pre-assign jersey numbers") + 30);
    const afterTernary = meterBlock.slice(meterBlock.indexOf(") : <div />}"));
    expect(afterTernary).toMatch(/setJerseyMode/);
  });
});
