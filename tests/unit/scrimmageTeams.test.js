import { describe, it, expect } from "vitest";
import { isGameFrozen } from "@/lib/scrimmageTeams.js";

describe("isGameFrozen", () => {
  it("freezes a game in the past", () => expect(isGameFrozen({ past: true, hasCheckins: false })).toBe(true));
  it("freezes a game that has check-ins", () => expect(isGameFrozen({ past: false, hasCheckins: true })).toBe(true));
  it("leaves an upcoming, un-checked-in game open", () => expect(isGameFrozen({ past: false, hasCheckins: false })).toBe(false));
});
