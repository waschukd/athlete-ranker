import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isSessionPast } from "@/lib/sessionTiming";

// Session end/start times are local "HH:MM:SS" wall-clock strings with no
// timezone, combined with scheduled_date's date portion -- so pin the fake
// "now" to a plain local Date to keep this test independent of the runner's
// own timezone.
function localDateTime(y, m, d, h, min) {
  return new Date(y, m - 1, d, h, min);
}

describe("isSessionPast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is not past while the session is still running", () => {
    vi.setSystemTime(localDateTime(2026, 8, 22, 18, 30));
    const s = { scheduled_date: "2026-08-22T06:00:00.000Z", start_time: "18:00:00", end_time: "19:00:00" };
    expect(isSessionPast(s)).toBe(false);
  });

  it("is not past immediately after end_time (still within the 4h grace window)", () => {
    vi.setSystemTime(localDateTime(2026, 8, 22, 19, 30)); // 30 min after end
    const s = { scheduled_date: "2026-08-22T06:00:00.000Z", start_time: "18:00:00", end_time: "19:00:00" };
    expect(isSessionPast(s)).toBe(false);
  });

  it("is not yet past right at the edge of the grace window", () => {
    vi.setSystemTime(localDateTime(2026, 8, 22, 22, 59)); // 3h59m after end
    const s = { scheduled_date: "2026-08-22T06:00:00.000Z", start_time: "18:00:00", end_time: "19:00:00" };
    expect(isSessionPast(s)).toBe(false);
  });

  it("is past once 4 hours have elapsed since end_time", () => {
    vi.setSystemTime(localDateTime(2026, 8, 22, 23, 1)); // 4h1m after end
    const s = { scheduled_date: "2026-08-22T06:00:00.000Z", start_time: "18:00:00", end_time: "19:00:00" };
    expect(isSessionPast(s)).toBe(true);
  });

  it("falls back to start_time when end_time is missing", () => {
    vi.setSystemTime(localDateTime(2026, 8, 22, 22, 30)); // 4h30m after start
    const s = { scheduled_date: "2026-08-22T06:00:00.000Z", start_time: "18:00:00" };
    expect(isSessionPast(s)).toBe(true);
  });

  it("treats a future session as not past", () => {
    vi.setSystemTime(localDateTime(2026, 8, 20, 12, 0));
    const s = { scheduled_date: "2026-08-22T06:00:00.000Z", start_time: "18:00:00", end_time: "19:00:00" };
    expect(isSessionPast(s)).toBe(false);
  });

  it("treats a session with no usable date as not past (fail open, never hide by mistake)", () => {
    expect(isSessionPast({})).toBe(false);
  });
});
