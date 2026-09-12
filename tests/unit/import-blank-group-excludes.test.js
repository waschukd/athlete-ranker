import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// BAHA U15 House runs only BC players in session 1 (two groups) and brings the
// NBC players in from session 2. Their upload had "Session 1 Group #" filled
// in for BC players and blank for NBC players -- the only sensible way to say
// "not in session 1". But blank cells are stripped client-side, and the
// auto-place fallback then dropped every NBC kid into session 1's smallest
// group. 87 of 88 landed in one group and there was no way to express
// "not this session" through the file at all.
//
// The fix is opt-in per organization. Every other association keeps the
// behaviour their uploads have had all season.

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ROUTE = strip(read("src/app/api/categories/[catId]/athletes/route.js"));
const LIB = strip(read("src/lib/sessionGroups.js"));

describe("auto-place can be told to stay out of a session", () => {
  it("accepts skipSessions", () => {
    expect(LIB).toMatch(/export async function autoPlaceInExistingGroups\(catId, athleteId, position, \{ skipSessions = \[\] \} = \{\}\)/);
  });

  it("skips those sessions before doing anything else in the loop", () => {
    const fn = LIB.slice(LIB.indexOf("export async function autoPlaceInExistingGroups"));
    const loop = fn.slice(fn.indexOf("for (const { session_number } of sessions)"));
    expect(loop.slice(0, 120)).toMatch(/if \(skip\.has\(Number\(session_number\)\)\) continue;/);
  });

  it("still honours a locked session regardless", () => {
    expect(LIB).toMatch(/if \(locked\?\.groups_locked_at\) continue;/);
  });
});

describe("the import infers which sessions the file controls", () => {
  it("collects every session number any row names a group in", () => {
    expect(ROUTE).toMatch(/body\.athletes\.flatMap\(a => \(Array\.isArray\(a\.session_groups\)/);
    expect(ROUTE).toMatch(/\.map\(sg => parseInt\(sg\.session_number\)\)\.filter\(Boolean\)/);
  });

  it("passes them to auto-place", () => {
    expect(ROUTE).toMatch(/autoPlaceInExistingGroups\(catId, athleteId, position, \{ skipSessions: fileSessions \}\)/);
  });
});

describe("it is opt-in per organization", () => {
  it("reads the org flag and defaults it off", () => {
    expect(ROUTE).toMatch(/COALESCE\(o\.blank_group_excludes, false\)/);
  });

  it("only computes fileSessions when the flag is on", () => {
    const block = ROUTE.slice(ROUTE.indexOf("let fileSessions = []"), ROUTE.indexOf("for (const athlete of body.athletes)"));
    expect(block).toMatch(/if \(orgFlag\?\.on\) \{/);
    // Off => stays [] => auto-place behaves exactly as before.
    expect(block).toMatch(/let fileSessions = \[\];/);
  });

  it("behaves as before if the column has not been migrated", () => {
    const block = ROUTE.slice(ROUTE.indexOf("let fileSessions = []"), ROUTE.indexOf("for (const athlete of body.athletes)"));
    expect(block).toMatch(/catch \{/);
  });

  it("the enabling script creates the column with a false default", () => {
    expect(read("scripts/enable-blank-group-excludes.mjs")).toMatch(/ADD COLUMN IF NOT EXISTS blank_group_excludes BOOLEAN NOT NULL DEFAULT false/);
  });
});
