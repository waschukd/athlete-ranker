import { describe, it, expect } from "vitest";
import { signCalendarToken, verifyCalendarToken, canonicalCalendarBase } from "@/lib/calendar-token";

describe("calendar token sign/verify", () => {
  it("round-trips a (numeric) user id", () => {
    const token = signCalendarToken(123);
    expect(verifyCalendarToken(token)).toBe(123);
  });
  it("rejects a tampered token", () => {
    const token = signCalendarToken(123);
    expect(verifyCalendarToken(token + "x")).toBe(null);
  });
});

describe("canonicalCalendarBase", () => {
  it("rewrites the bare apex to www (avoids Vercel's 307 that breaks calendar importers)", () => {
    expect(canonicalCalendarBase("https://sidelinestar.com")).toBe("https://www.sidelinestar.com");
  });
  it("leaves the www host unchanged", () => {
    expect(canonicalCalendarBase("https://www.sidelinestar.com")).toBe("https://www.sidelinestar.com");
  });
  it("leaves localhost and preview hosts unchanged", () => {
    expect(canonicalCalendarBase("http://localhost:3000")).toBe("http://localhost:3000");
    expect(canonicalCalendarBase("https://athlete-ranker-abc.vercel.app")).toBe("https://athlete-ranker-abc.vercel.app");
  });
});
