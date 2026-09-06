import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A door running several groups at once opens a check-in window per group.
// The checkin-token cookie is per BROWSER, not per tab, so a single schedule_id
// meant each new window silently invalidated every older one. Those tabs then
// 403'd, and the page reported it as "No connection" -- so volunteers logged out
// and back in between scans while BAHA was scanning 300+ kids.
//
// Two things have to hold: the token carries a LIST, and an auth failure is
// never described as a network failure.

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const ENTRY = read("src/app/api/checkin/entry/route.js");
const VERIFY = read("src/app/api/checkin/[scheduleId]/route.js");
const PAGE = read("src/app/checkin/[scheduleId]/page.jsx");

describe("check-in token holds multiple sessions", () => {
  it("entry merges the new schedule with whatever the cookie already holds", () => {
    expect(ENTRY).toMatch(/schedule_ids/);
    expect(ENTRY).toMatch(/jwtVerify/);
    // Must READ the existing cookie, or every window still clobbers the last.
    expect(ENTRY).toMatch(/cookies\(\)\.get\("checkin-token"\)/);
  });

  it("de-duplicates so reopening the same session cannot fill the list", () => {
    expect(ENTRY).toMatch(/filter\(id => id !== Number\(entry\.schedule_id\)\)/);
  });

  it("caps the list rather than growing an unbounded cookie", () => {
    expect(ENTRY).toMatch(/MAX_SCHEDULES/);
    expect(ENTRY).toMatch(/\.slice\(0, MAX_SCHEDULES\)/);
  });

  it("still writes schedule_id, so a token read by an older deploy works", () => {
    expect(ENTRY).toMatch(/schedule_id: entry\.schedule_id/);
  });

  it("the verifier accepts any schedule in the list", () => {
    expect(VERIFY).toMatch(/payload\.schedule_ids/);
    expect(VERIFY).toMatch(/allowed\.includes\(String\(scheduleId\)\)/);
  });

  it("the verifier still accepts a pre-change single-id token", () => {
    expect(VERIFY).toMatch(/\[String\(payload\.schedule_id\)\]/);
  });
});

describe("an auth failure is not reported as a network failure", () => {
  it("401/403 gets its own message naming the real fix", () => {
    expect(PAGE).toMatch(/res\.status === 401 \|\| res\.status === 403/);
    expect(PAGE).toMatch(/Re-enter the session code/);
  });

  it("the connection message is reserved for cases that are not 401/403", () => {
    // The old code sent every non-OK response to the connection banner, which is
    // what sent volunteers to log out and back in.
    const branch = PAGE.slice(PAGE.indexOf("if (!res.ok)"), PAGE.indexOf("} else {", PAGE.indexOf("if (!res.ok)")) + 400);
    const connIdx = branch.indexOf("check your connection");
    const authIdx = branch.indexOf("res.status === 401");
    expect(authIdx).toBeGreaterThan(-1);
    expect(connIdx).toBeGreaterThan(authIdx);
  });

  it("reassures that nothing already checked in is lost", () => {
    expect(PAGE).toMatch(/nothing you have already checked in is lost/i);
  });
});
