import { describe, it, expect, vi, beforeEach } from "vitest";

// resolveMatchupTeams matches each side against a team's exact name. A schedule
// routinely labels a game with a descriptive prefix -- "Post-cut: White vs Blue"
// -- and the lazy split hands "Post-cut: White" to that exact match, which finds
// nothing. The game then silently keeps no roster: no error, no warning, and
// "Apply to schedule" appears to work while doing nothing at all.

const rows = vi.fn();
vi.mock("@/lib/db", () => ({ default: (...args) => rows(...args) }));

const { resolveMatchupTeams } = await import("@/lib/scrimmageTeams");

// Fake the one query findTeamByLabel makes: exact, case-insensitive name match.
const withTeams = (teams) => {
  rows.mockImplementation((strings, ...vals) => {
    const q = strings.join("?");
    if (q.includes("lower(name) = lower(")) {
      const label = String(vals[1] ?? "").trim().toLowerCase();
      const hit = teams.find(t => t.name.toLowerCase() === label);
      return Promise.resolve(hit ? [{ id: hit.id }] : []);
    }
    return Promise.resolve([]);
  });
};

beforeEach(() => { rows.mockReset(); });

describe("resolveMatchupTeams", () => {
  const TEAMS = [{ id: 33, name: "White" }, { id: 34, name: "Blue" }];

  it("resolves a plain matchup", async () => {
    withTeams(TEAMS);
    expect(await resolveMatchupTeams(113, "White vs Blue")).toEqual([33, 34]);
  });

  it("keeps side order", async () => {
    withTeams(TEAMS);
    expect(await resolveMatchupTeams(113, "Blue vs White")).toEqual([34, 33]);
  });

  it("resolves through a descriptive prefix — the EFHA post-cut case", async () => {
    withTeams(TEAMS);
    expect(await resolveMatchupTeams(113, "Post-cut: White vs Blue")).toEqual([33, 34]);
    expect(await resolveMatchupTeams(113, "Post-cut: Blue vs White")).toEqual([34, 33]);
  });

  it("handles other prefixes and slash separators", async () => {
    withTeams(TEAMS);
    expect(await resolveMatchupTeams(113, "Final: White / Blue")).toEqual([33, 34]);
    expect(await resolveMatchupTeams(113, "Game 7: White vs. Blue")).toEqual([33, 34]);
  });

  it("prefers an exact match over stripping the prefix", async () => {
    // A team genuinely named with a colon must still win.
    withTeams([{ id: 1, name: "Post-cut: White" }, { id: 2, name: "Blue" }]);
    expect(await resolveMatchupTeams(113, "Post-cut: White vs Blue")).toEqual([1, 2]);
  });

  it("returns [] when a side names no real team, so the roster is left alone", async () => {
    withTeams(TEAMS);
    expect(await resolveMatchupTeams(113, "Post-cut: vs. exhibition opponent")).toEqual([]);
    expect(await resolveMatchupTeams(113, "Red vs Green")).toEqual([]);
  });

  it("returns [] for empty or unparseable labels", async () => {
    withTeams(TEAMS);
    expect(await resolveMatchupTeams(113, "")).toEqual([]);
    expect(await resolveMatchupTeams(113, null)).toEqual([]);
    expect(await resolveMatchupTeams(113, "White")).toEqual([]);
  });

  it("does not strip a trailing colon into an empty label", async () => {
    withTeams(TEAMS);
    expect(await resolveMatchupTeams(113, "White vs Blue:")).toEqual([]);
  });
});
