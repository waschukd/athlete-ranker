import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Two bugs let evaluators keep showing up to cancelled sessions:
//
//  1. Cancelling releases sign-ups (status -> 'released') BEFORE
//     notifySessionChange runs, and that function picks recipients with
//     status='signed_up' -- so the rostered evaluators, the only people who
//     had to change their plans, were the only ones never emailed.
//
//  2. Every "my sessions" query filtered `es.status != 'cancelled'` on the
//     SIGN-UP. 'released' is not 'cancelled', and nothing checked the SESSION's
//     status, so a cancelled session stayed on the dashboard and kept
//     publishing into the evaluator's subscribed calendar.
//
// Both are invisible in normal use and only surface when someone drives to a
// rink for a session that is not happening, so they are pinned here.

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");

const SCHEDULE_ROUTE = "src/app/api/categories/[catId]/schedule/route.js";
const SESSIONS_ROUTE = "src/app/api/evaluator/sessions/route.js";
const CALENDAR_ROUTE = "src/app/api/evaluator/calendar/route.js";
const NOTIFY_LIB = "src/lib/scheduleNotify.js";

describe("cancelling a session still notifies the rostered evaluators", () => {
  const src = read(SCHEDULE_ROUTE);

  it("captures the roster before releasing or deleting sign-ups", () => {
    const capture = src.indexOf("FROM evaluator_session_signups ess");
    const release = src.indexOf("SET status = 'released'");
    const hardDelete = src.indexOf("DELETE FROM evaluator_session_signups");
    expect(capture).toBeGreaterThan(-1);
    expect(release).toBeGreaterThan(-1);
    expect(hardDelete).toBeGreaterThan(-1);
    // The capture must come first, or it finds nobody.
    expect(capture).toBeLessThan(release);
    expect(capture).toBeLessThan(hardDelete);
  });

  it("passes that roster to notifySessionChange on both cancel paths", () => {
    const calls = src.split("notifySessionChange({").slice(1);
    const cancelCalls = calls.filter(c => c.slice(0, 400).includes('changeType: "cancelled"'));
    expect(cancelCalls.length).toBe(2); // soft-cancel + hard remove
    for (const c of cancelCalls) expect(c.slice(0, 400)).toContain("alsoNotify");
  });

  it("notifySessionChange merges alsoNotify into its recipients", () => {
    const lib = read(NOTIFY_LIB);
    expect(lib).toMatch(/alsoNotify\s*=\s*\[\]/);
    expect(lib).toMatch(/for \(const e of alsoNotify\) add\(/);
  });
});

describe("cancelled sessions disappear from an evaluator's schedule", () => {
  it("the dashboard query filters the session status, not just the sign-up", () => {
    const src = read(SESSIONS_ROUTE);
    expect(src).toContain("sch.status <> 'cancelled'");
    expect(src).toContain("es.status NOT IN ('cancelled', 'released')");
  });

  it("the calendar feed filters the session status too", () => {
    const src = read(CALENDAR_ROUTE);
    expect(src).toContain("sch.status <> 'cancelled'");
    expect(src).toContain("es.status NOT IN ('cancelled', 'released')");
  });

  it("no evaluator-facing query still uses the bare != 'cancelled' sign-up filter", () => {
    // The exact shape of the original bug: filtering only the sign-up status.
    for (const p of [SESSIONS_ROUTE, CALENDAR_ROUTE]) {
      const src = read(p);
      const bare = src.match(/es\.status\s*!=\s*'cancelled'/g) || [];
      expect(bare, `${p} still filters only the sign-up status`).toHaveLength(0);
    }
  });
});
