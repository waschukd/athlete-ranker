import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Grid view + "hide done": typing "6" then ".5" into the last category
// completed the row on the "6" and the row vanished before the ".5" went in.
// Grid cells never set `selected`, so the existing "never hide the player
// being scored" exemption did nothing there. The row being typed in now stays
// until a cell in a different row takes focus -- which also leaves the note
// icon reachable after the last score.
const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const PAGE = read("src/app/evaluator/score/[scheduleId]/page.jsx");
const GRID = read("src/components/evaluator-scoring/GridView.jsx");

describe("hide-completed leaves the grid row being typed in alone", () => {
  it("grid reports the focused row's athlete to the page", () => {
    expect(GRID).toMatch(/onRowFocus\?\.\(athlete\.id\)/);
    expect(PAGE).toMatch(/onRowFocus=\{setGridActiveId\}/);
  });
  it("the filter exempts that row, alongside the selected player", () => {
    const line = PAGE.split("\n").find(l => l.includes("!hideCompleted ||"));
    expect(line).toMatch(/a\.id === selected\?\.id/);
    expect(line).toMatch(/a\.id === gridActiveId/);
  });
  it("only a focus on another row moves it -- blur alone does not clear it", () => {
    expect(PAGE).not.toMatch(/setGridActiveId\(null\)/);
  });
});
