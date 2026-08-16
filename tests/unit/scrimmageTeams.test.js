import { describe, it, expect, vi, beforeEach } from "vitest";
import { isGameFrozen } from "@/lib/scrimmageTeams.js";

describe("isGameFrozen", () => {
  it("freezes a game in the past", () => expect(isGameFrozen({ past: true, hasCheckins: false })).toBe(true));
  it("freezes a game that has check-ins", () => expect(isGameFrozen({ past: false, hasCheckins: true })).toBe(true));
  it("leaves an upcoming, un-checked-in game open", () => expect(isGameFrozen({ past: false, hasCheckins: false })).toBe(false));
});

// resolveMatchupTeams: teams can now be renamed to anything ("White", "Gold
// Rush"), so resolution must match by current name, not just the legacy
// single-letter "Team A" convention. These mock the DB directly since the
// function is a straight two-query lookup with no other dependencies.
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
import sql from "@/lib/db";
import { resolveMatchupTeams } from "@/lib/scrimmageTeams.js";

describe("resolveMatchupTeams", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("resolves custom team names, case-insensitively", async () => {
    sql.mockResolvedValueOnce([{ id: 11 }]); // "White" lookup
    sql.mockResolvedValueOnce([{ id: 22 }]); // "gold" lookup
    const teams = await resolveMatchupTeams(5, "White vs gold");
    expect(teams).toEqual([11, 22]);
  });

  it("falls back to the legacy single-letter convention when no named team matches", async () => {
    sql.mockResolvedValueOnce([]);               // "A" as a name — no match
    sql.mockResolvedValueOnce([{ id: 1 }]);       // "Team A" letter fallback
    sql.mockResolvedValueOnce([]);                // "B" as a name — no match
    sql.mockResolvedValueOnce([{ id: 2 }]);       // "Team B" letter fallback
    const teams = await resolveMatchupTeams(5, "A vs B");
    expect(teams).toEqual([1, 2]);
  });

  it("returns [] when the label doesn't parse as two sides", async () => {
    expect(await resolveMatchupTeams(5, "Group 1")).toEqual([]);
    expect(await resolveMatchupTeams(5, "")).toEqual([]);
    expect(await resolveMatchupTeams(5, null)).toEqual([]);
  });

  it("returns [] when one side can't be resolved at all", async () => {
    sql.mockResolvedValueOnce([{ id: 11 }]); // "White" resolves
    sql.mockResolvedValueOnce([]);           // "Purple" doesn't exist as a name...
    // ...and isn't a legacy single letter either, so no fallback query happens.
    const teams = await resolveMatchupTeams(5, "White vs Purple");
    expect(teams).toEqual([]);
  });
});
