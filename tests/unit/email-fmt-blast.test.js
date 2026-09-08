import { describe, it, expect } from "vitest";
import { fmtBlastDate, fmtBlastTime } from "@/lib/email";

describe("fmtBlastDate", () => {
  it("renders full weekday + month, not a bare ISO date", () => {
    // 2026-09-10 is a Thursday.
    expect(fmtBlastDate("2026-09-10")).toBe("Thursday, September 10");
  });

  it("handles a full timestamp string the same as a date-only one", () => {
    expect(fmtBlastDate("2026-09-10T06:00:00.000Z")).toBe("Thursday, September 10");
  });

  it("returns TBD for a missing date", () => {
    expect(fmtBlastDate(null)).toBe("TBD");
    expect(fmtBlastDate(undefined)).toBe("TBD");
  });
});

describe("fmtBlastTime", () => {
  it("converts 24-hour time to 12-hour with AM/PM", () => {
    expect(fmtBlastTime("19:00")).toBe("7:00 PM");
    expect(fmtBlastTime("07:15")).toBe("7:15 AM");
  });

  it("handles a seconds-suffixed time string", () => {
    expect(fmtBlastTime("17:45:00")).toBe("5:45 PM");
  });

  it("renders noon and midnight correctly (the classic %12 bug)", () => {
    expect(fmtBlastTime("12:00")).toBe("12:00 PM");
    expect(fmtBlastTime("00:00")).toBe("12:00 AM");
  });

  it("returns an empty string for a missing time", () => {
    expect(fmtBlastTime(null)).toBe("");
    expect(fmtBlastTime("")).toBe("");
  });
});
