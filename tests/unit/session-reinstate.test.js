import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Reinstating a cancelled session used to bring the session back with nobody on
// it. Cancelling releases every sign-up (status -> 'released'); un-cancelling
// only ever changed the wording of the email, so the sign-ups stayed released.
// The evaluators were never told the session was back on and could not get into
// it -- an admin had to remove and re-add each one by hand.
//
// This got sharper once the dashboard started (correctly) filtering out
// 'released' rows: before that a stranded sign-up at least still showed.
//
// EFHA hit it twice in two days on U18 AA, so the ordering and the
// released-only scope are pinned here.

const SRC = readFileSync(resolve(process.cwd(), "src/app/api/categories/[catId]/schedule/route.js"), "utf8");

describe("reinstating a session restores its roster", () => {
  it("puts released sign-ups back to signed_up", () => {
    expect(SRC).toMatch(/UPDATE evaluator_session_signups SET status = 'signed_up'/);
    expect(SRC).toMatch(/status = 'released'/);
  });

  it("only restores 'released' — never an evaluator's own cancellation", () => {
    // A 'cancelled' sign-up is the evaluator withdrawing themselves. Bringing
    // that back would put someone on a session they deliberately dropped.
    const restore = SRC.slice(SRC.indexOf("SET status = 'signed_up'"));
    const where = restore.slice(0, 200);
    expect(where).toContain("status = 'released'");
    expect(where).not.toContain("status = 'cancelled'");
  });

  it("restores BEFORE notifying, so the restored evaluators actually get the email", () => {
    // notifySessionChange picks recipients with status='signed_up'. Restoring
    // after it runs would email everyone except the people who needed it.
    const restoreAt = SRC.indexOf("SET status = 'signed_up'");
    const notifyAt = SRC.indexOf('changeType: reinstating ? "reinstated"');
    expect(restoreAt).toBeGreaterThan(-1);
    expect(notifyAt).toBeGreaterThan(-1);
    expect(restoreAt).toBeLessThan(notifyAt);
  });

  it("is gated on reinstating, not run on every edit", () => {
    const before = SRC.slice(0, SRC.indexOf("SET status = 'signed_up'"));
    expect(before.lastIndexOf("if (reinstating)")).toBeGreaterThan(before.lastIndexOf("const changes = []"));
  });

  it("reports how many were restored so the caller can surface it", () => {
    expect(SRC).toMatch(/restored\s*=\s*back\.length/);
    expect(SRC).toMatch(/restored\s*\}\)/);
  });
});
