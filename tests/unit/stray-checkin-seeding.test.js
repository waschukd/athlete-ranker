import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// applySnakeDraftColors resolved each group to its own schedule row, then fell
// back to GROUP 1's schedule when it could not:
//
//   const scheduleId = scheduleByGroup[group.group_number] || scheduleByGroup[1];
//
// So an unresolvable group filed every one of its players against group 1 --
// silently, no error, no log. It produced 919 check-in rows across 12 divisions
// for groups those players are not in, including a live BAHA U9 House session.
//
// Skipping is the correct behaviour: a group with no schedule has no check-in
// to seed.

const RAW = readFileSync(resolve(process.cwd(), "src/lib/sessionGroups.js"), "utf8");
// Strip comments: the fix is DESCRIBED in a comment that names the old
// expression, and matching prose would fail on the very text explaining it.
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("group colour seeding never misfiles players into another group", () => {
  it("does not fall back to group 1's schedule", () => {
    expect(SRC).not.toMatch(/scheduleByGroup\[\s*1\s*\]/);
  });

  it("resolves a group strictly to its own schedule", () => {
    expect(SRC).toMatch(/const scheduleId = scheduleByGroup\[group\.group_number\];/);
  });

  it("skips a group with no schedule instead of seeding it", () => {
    // The guard immediately after the lookup is what makes skipping safe.
    const at = SRC.indexOf("const scheduleId = scheduleByGroup[group.group_number];");
    expect(at).toBeGreaterThan(-1);
    expect(SRC.slice(at, at + 200)).toMatch(/if \(!scheduleId\) continue;/);
  });
});
