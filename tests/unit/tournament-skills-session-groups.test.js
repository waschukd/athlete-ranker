import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A round-robin (tournament) category can still run a session that is not
// team-vs-team. VMHA U13 opens with a skills skate split into two groups, then
// plays three games between three teams. The groups page keyed its whole UI off
// the CATEGORY format, so the skills session rendered as a matchup picker and
// the only way to say "who skates in group 2" was "which two teams play" --
// which it isn't. The game grid is now scoped to game sessions; a skills or
// testing session keeps the ordinary group editor.
const PAGE = readFileSync(resolve(process.cwd(), "src/app/association/dashboard/category/[catId]/groups/page.jsx"), "utf8");

describe("tournament categories keep normal groups for non-game sessions", () => {
  it("separates the category format from the selected session's shape", () => {
    expect(PAGE).toMatch(/const isTournamentCategory = setupData\?\.category\?\.eval_format === "round_robin"/);
    expect(PAGE).toMatch(/const isTournament = isTournamentCategory && gameSession\(selectedSession\)/);
  });

  it("treats only scrimmage (or untyped legacy) sessions as games", () => {
    const fn = PAGE.slice(PAGE.indexOf("const gameSession ="), PAGE.indexOf("const isTournament ="));
    expect(fn).toMatch(/t === "scrimmage"/);
    expect(fn).toMatch(/!t \|\|/); // legacy rows with no type stay games
  });

  it("still loads teams and schedule for the whole category, not just game sessions", () => {
    // The Teams data backs the skills view's team labels too -- gating these
    // queries on the per-session flag would blank them on the skills session.
    const queries = PAGE.slice(PAGE.indexOf("const isTournamentCategory"), PAGE.indexOf("const scheduleRows"));
    expect(queries).not.toMatch(/enabled: !!catId && isTournament,/);
    expect((queries.match(/enabled: !!catId && isTournamentCategory,/g) || []).length).toBe(2);
  });

  it("defines the per-session flag before anything renders with it", () => {
    expect(PAGE.indexOf("const isTournament = isTournamentCategory")).toBeLessThan(PAGE.indexOf("{isTournament ? ("));
  });
});
