import { describe, it, expect } from "vitest";
import { isoDay, fmtDay } from "../../scripts/_db.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HELPER = readFileSync(resolve(process.cwd(), "scripts/_db.mjs"), "utf8");

// Scripts call neon() directly and skip src/lib/db.js, so a DATE column reaches
// them as a Date at LOCAL midnight instead of the "YYYY-MM-DD" string the app
// gets. Formatters that are correct in the app are therefore wrong in a script,
// and both failure modes have already shipped:
//
//   String(d).slice(0,10)  -> "Mon Sep 07" -> Invalid Date. This nearly went out
//                             in a termination email with 8 unreadable lines.
//   local midnight rendered with timeZone:"UTC" -> right day only WEST of UTC.
//                             An evaluator reinstatement email was correct only
//                             because it happened to run from Toronto.
//
// These have to hold for a Date and a string alike, or the next script that
// emails a date is a coin flip.

const D = (y, m, d) => new Date(y, m - 1, d); // local midnight, as the driver builds it

describe("isoDay", () => {
  it("reads the calendar day off a local-midnight Date", () => {
    expect(isoDay(D(2026, 9, 7))).toBe("2026-09-07");
  });

  it("passes a plain date string straight through", () => {
    expect(isoDay("2026-09-07")).toBe("2026-09-07");
    expect(isoDay("2026-09-07T00:00:00.000Z")).toBe("2026-09-07");
  });

  it("does not shift the day near midnight in either direction", () => {
    // Jan 1 and Dec 31 are where a UTC read flips the year, not just the day.
    expect(isoDay(D(2027, 1, 1))).toBe("2027-01-01");
    expect(isoDay(D(2026, 12, 31))).toBe("2026-12-31");
  });

  it("pads single-digit months and days", () => {
    expect(isoDay(D(2026, 3, 5))).toBe("2026-03-05");
  });

  it("returns null for nothing rather than a bogus day", () => {
    for (const v of [null, undefined, "", new Date("nonsense")]) expect(isoDay(v)).toBeNull();
  });

  it("refuses a value that is not a date at all", () => {
    // The old code happily sliced "Mon Sep 07 2026" down to "Mon Sep 07".
    expect(isoDay("Mon Sep 07 2026 00:00:00 GMT-0400")).toBeNull();
  });
});

describe("fmtDay", () => {
  it("formats a Date and an equivalent string identically", () => {
    expect(fmtDay(D(2026, 9, 7))).toBe(fmtDay("2026-09-07"));
  });

  it("names the right weekday", () => {
    // 2026-09-07 is a Monday. Off-by-one shows up here first.
    expect(fmtDay("2026-09-07")).toMatch(/Mon/);
    expect(fmtDay("2026-09-07")).toMatch(/Sep/);
    expect(fmtDay("2026-09-07")).toMatch(/7/);
    expect(fmtDay("2026-09-07")).toMatch(/2026/);
  });

  it("never renders Invalid Date", () => {
    for (const v of [D(2026, 9, 7), "2026-09-07", "2026-09-07T04:00:00.000Z"]) {
      expect(fmtDay(v)).not.toMatch(/Invalid/);
    }
  });

  it("says TBD for a missing date instead of failing", () => {
    expect(fmtDay(null)).toBe("TBD");
    expect(fmtDay(undefined)).toBe("TBD");
  });
});

describe("the shared helper is what scripts use", () => {
  it("sets the DATE type parser, matching src/lib/db.js", () => {
    expect(HELPER).toMatch(/types\.setTypeParser\(1082/);
  });

  it("does not format via a timeZone option -- that is the bug", () => {
    const code = HELPER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/timeZone:/);
  });
});
