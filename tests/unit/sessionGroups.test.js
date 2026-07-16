// Guard against the "Manage groups says there are none" bug class.
//
// evaluation_schedule.group_number and session_groups are two halves of the same
// fact. The Schedule tab reads the first; Manage groups / auto-assign read the
// second. bulk-onboard grew its own schedule INSERT without creating the group
// row, so every association onboarded through "Set up entire association" had
// working schedules and broken group management (92 rows across 12 categories
// before the backfill).
//
// A unit test can't catch a missing call in a route that talks to the DB the
// whole way down, so this asserts the coupling structurally: any API route that
// writes a scheduled slot with a group number must also ensure the group exists.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".js") || p.endsWith(".jsx")) out.push(p);
  }
  return out;
}

describe("session_groups stays in sync with the schedule", () => {
  const apiFiles = walk("src/app/api");

  const writers = apiFiles.filter(f => {
    const src = readFileSync(f, "utf8");
    // On the hook: routes inserting a slot bound to a category AND a group.
    // session_groups is FK'd to age_category_id, so SP testing events — which
    // hang off service_provider_id with a NULL category — genuinely can't have
    // one and are correctly exempt.
    const inserts = src.match(/INSERT INTO evaluation_schedule\s*\(([^)]*)\)/gs) || [];
    return inserts.some(cols => /age_category_id/.test(cols) && /group_number/.test(cols));
  });

  it("finds the routes that write scheduled groups", () => {
    // If this drops to zero the regex has rotted and the test below is vacuous.
    expect(writers.length).toBeGreaterThan(0);
  });

  it.each(writers)("%s also ensures the session_groups row exists", (file) => {
    const src = readFileSync(file, "utf8");
    expect(
      src.includes("ensureSessionGroup"),
      `${file} inserts evaluation_schedule with a group_number but never calls ` +
      `ensureSessionGroup(). The Schedule tab will show groups while "Manage ` +
      `groups" reports "No groups found. Upload a schedule first." ` +
      `Import it from @/lib/sessionGroups.`,
    ).toBe(true);
  });

  it("there is exactly one definition of ensureSessionGroup", () => {
    // It used to be a private helper inside the schedule route, which is how a
    // second writer came to exist without it. Keep it in one place.
    const defs = walk("src")
      .filter(f => /(async )?function ensureSessionGroup\s*\(/.test(readFileSync(f, "utf8")))
      .map(f => f.replace(/\\/g, "/"));
    expect(defs).toEqual(["src/lib/sessionGroups.js"]);
  });
});
