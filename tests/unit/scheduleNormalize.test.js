import { describe, it, expect } from "vitest";
import { gridToText, parseRows } from "../../src/lib/scheduleNormalize.js";

describe("gridToText", () => {
  it("numbers rows and drops fully-empty ones", () => {
    const t = gridToText([["A", "B"], ["", ""], ["C", "D"]]);
    expect(t).toBe("1: A | B\n3: C | D");
  });
  it("bounds columns", () => {
    const wide = [Array.from({ length: 30 }, (_, i) => `c${i}`)];
    expect(gridToText(wide, 400, 3)).toBe("1: c0 | c1 | c2");
  });
});

describe("parseRows", () => {
  it("parses a clean JSON object", () => {
    const raw = JSON.stringify({ rows: [
      { date: "2026-08-31", start_time: "17:00", end_time: "18:00", location: "KNRRC 1", age_group: "U11", division: "AA", session_type: "game", raw_label: "U11 AA TEAM 1 vs 2" },
    ] });
    const r = parseRows(raw);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ date: "2026-08-31", start_time: "17:00", session_type: "game", complete: true });
  });

  it("strips markdown code fences", () => {
    const raw = "```json\n{ \"rows\": [ { \"date\": \"2026-09-06\", \"start_time\": \"7:40\", \"raw_label\": \"U9 TIME TRIALS\", \"session_type\": \"testing\" } ] }\n```";
    const r = parseRows(raw);
    expect(r[0]).toMatchObject({ date: "2026-09-06", start_time: "07:40", session_type: "testing" });
  });

  it("normalizes single-digit hour to HH:MM", () => {
    const r = parseRows(JSON.stringify({ rows: [{ start_time: "7:05", raw_label: "x" }] }));
    expect(r[0].start_time).toBe("07:05");
  });

  it("flags incomplete rows (missing date or time) but keeps them", () => {
    const r = parseRows(JSON.stringify({ rows: [{ raw_label: "U13 SCRIMMAGE", session_type: "scrimmage" }] }));
    expect(r[0].complete).toBe(false);
    expect(r[0].date).toBe(null);
  });

  it("coerces an unknown session_type to 'other'", () => {
    const r = parseRows(JSON.stringify({ rows: [{ date: "2026-01-01", start_time: "10:00", session_type: "banquet", raw_label: "x" }] }));
    expect(r[0].session_type).toBe("other");
  });

  it("rejects invalid date/time formats", () => {
    const r = parseRows(JSON.stringify({ rows: [{ date: "Aug 31", start_time: "5pm", raw_label: "x" }] }));
    expect(r[0].date).toBe(null);
    expect(r[0].start_time).toBe(null);
  });

  it("returns [] on non-JSON", () => {
    expect(parseRows("sorry, I can't help with that")).toEqual([]);
  });

  it("accepts a bare array too", () => {
    const r = parseRows(JSON.stringify([{ date: "2026-05-05", start_time: "12:00", raw_label: "y" }]));
    expect(r).toHaveLength(1);
  });
});
