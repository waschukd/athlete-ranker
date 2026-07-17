// The parent "Add to calendar · Apple / Outlook" link.
//
// It's reachable without a cookie (parents have no account), so the token is the
// only thing standing between the internet and this endpoint. It must not be
// forgeable, and it must not be replayable against the staff calendar feeds,
// which expose every session an evaluator or SP can see.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-unit-tests";

const {
  signSessionIcsToken, verifySessionIcsToken,
  signCalendarToken, signSpCalendarToken, signScheduleToken,
} = await import("@/lib/calendar-token");

describe("session .ics token", () => {
  it("round-trips", () => {
    expect(verifySessionIcsToken(signSessionIcsToken(42))).toBe(42);
  });

  it("rejects a tampered signature", () => {
    const [id, sig] = signSessionIcsToken(42).split(".");
    const flipped = sig.slice(0, -1) + (sig.at(-1) === "a" ? "b" : "a");
    expect(verifySessionIcsToken(`${id}.${flipped}`)).toBeNull();
  });

  it("rejects a swapped id — you can't read another session by editing the number", () => {
    const sig = signSessionIcsToken(42).split(".")[1];
    expect(verifySessionIcsToken(`43.${sig}`)).toBeNull();
  });

  it("rejects junk", () => {
    for (const t of [null, undefined, "", "abc", "42", "42.", ".sig", "0.abc"]) {
      expect(verifySessionIcsToken(t)).toBeNull();
    }
  });

  it("is namespaced away from every staff feed token", () => {
    // A parent's link must never be replayable against a feed that lists every
    // session for an evaluator, an SP, or a whole category.
    const id = 7;
    const parent = signSessionIcsToken(id);
    for (const staff of [signCalendarToken(id), signSpCalendarToken(id), signScheduleToken(id)]) {
      expect(staff).not.toBe(parent);
      // And a staff token must not verify as a parent one.
      expect(verifySessionIcsToken(staff)).toBeNull();
    }
  });
});

describe("session.ics endpoint", () => {
  let sql, GET;
  beforeEach(async () => {
    vi.resetModules();
    sql = (await import("@/lib/db")).default;
    ({ GET } = await import("@/app/api/calendar/session.ics/route"));
  });

  const req = (t) => ({ url: `https://www.sidelinestar.com/api/calendar/session.ics${t ? `?t=${t}` : ""}` });

  it("403s without a token", async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(403);
  });

  it("403s on a forged token", async () => {
    const res = await GET(req("42.deadbeefdeadbeefdeadbeefdeadbeef"));
    expect(res.status).toBe(403);
  });

  it("serves an .ics for a valid token, with no group in it", async () => {
    sql.mockResolvedValueOnce([{
      id: 42, scheduled_date: "2026-09-06", start_time: "09:00", end_time: "10:00",
      location: "Community Rink", session_number: 1, status: "scheduled",
      category_name: "U11 House", org_name: "Demo Soci", session_type: "testing",
    }]);
    const res = await GET(req(signSessionIcsToken(42)));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/calendar");
    expect(res.headers.get("Content-Disposition")).toContain("session.ics");
    const body = await res.text();
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("Community Rink");
    expect(body).not.toMatch(/\bG\d\b|\bgroup\s*\d/i);
  });

  it("410s a cancelled session rather than adding a dead event to a calendar", async () => {
    sql.mockResolvedValueOnce([{ id: 42, status: "cancelled", scheduled_date: "2026-09-06", start_time: "09:00" }]);
    const res = await GET(req(signSessionIcsToken(42)));
    expect(res.status).toBe(410);
  });

  it("404s a missing session", async () => {
    sql.mockResolvedValueOnce([]);
    const res = await GET(req(signSessionIcsToken(999)));
    expect(res.status).toBe(404);
  });
});

describe("the route is public", () => {
  it("session.ics is in the middleware allowlist — parents have no cookie", async () => {
    const { readFileSync } = await import("node:fs");
    const mw = readFileSync("src/middleware.js", "utf8");
    expect(mw).toContain("/api/calendar/session.ics");
  });
});
