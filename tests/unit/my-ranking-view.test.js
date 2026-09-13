import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// "My ranking" on the scoring screen: sort the roster by this evaluator's own
// average so they can see where they have placed everyone as they go.
//
// It is a view. Nothing about how a score is saved, queued or synced changes,
// and it is off by default -- so it is safe to ship while evaluators are on the
// ice. The one hazard is rows jumping while someone types: the grid's
// Enter/arrow navigation is by row index, so a re-sort mid-entry would land
// them on a different player. The order therefore comes from a snapshot that
// refreshes on cell blur, not on every keystroke.

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const PAGE = strip(read("src/app/evaluator/score/[scheduleId]/page.jsx"));
const GRID = strip(read("src/components/evaluator-scoring/GridView.jsx"));
const TOP = strip(read("src/components/evaluator-scoring/TopBar.jsx"));

describe("the sort order comes from a snapshot, not live keystrokes", () => {
  it("sorts by rankSnap, not by the live scores object", () => {
    const sort = PAGE.slice(PAGE.indexOf(".sort((a,b) => {"), PAGE.indexOf("const rankOf ="));
    expect(sort).toMatch(/rankSnap\.get\(a\.id\)/);
    expect(sort).not.toMatch(/scores\[a\.id\]/);
  });

  it("the grid refreshes the snapshot on blur, and only in rank mode", () => {
    expect(GRID).toMatch(/onBlur=\{onCellBlur\}/);
    expect(PAGE).toMatch(/onCellBlur=\{rankMode \? refreshRank : undefined\}/);
  });

  it("refreshes when the mode is switched on or the selected player changes", () => {
    expect(PAGE).toMatch(/useEffect\(\(\) => \{ if \(rankMode\) refreshRank\(\); \}, \[rankMode, selected\?\.id, refreshRank\]\);/);
  });
});

describe("ordering rules", () => {
  it("highest average first", () => {
    const sort = PAGE.slice(PAGE.indexOf(".sort((a,b) => {"), PAGE.indexOf("const rankOf ="));
    expect(sort).toMatch(/return bv - av;/);
  });

  it("players not yet scored sink to the bottom in both directions", () => {
    const sort = PAGE.slice(PAGE.indexOf(".sort((a,b) => {"), PAGE.indexOf("const rankOf ="));
    expect(sort).toMatch(/if \(av != null && bv == null\) return -1;/);
    expect(sort).toMatch(/if \(av == null && bv != null\) return 1;/);
  });

  it("falls back to the normal jersey/helmet order on a tie or when off", () => {
    const sort = PAGE.slice(PAGE.indexOf(".sort((a,b) => {"), PAGE.indexOf("const rankOf ="));
    expect(sort).toMatch(/return sortKey\(a\) - sortKey\(b\);/);
  });

  it("rank numbers count only players who have an average", () => {
    expect(PAGE).toMatch(/const ranked = filtered\.filter\(a => rankSnap\.get\(a\.id\) != null\);/);
  });
});

describe("it is a view, off by default", () => {
  it("defaults off", () => {
    expect(PAGE).toMatch(/const \[rankMode, setRankMode\] = useState\(false\);/);
  });

  it("has a toggle in the top bar that says what it does", () => {
    expect(TOP).toMatch(/My ranking/);
    expect(TOP).toMatch(/updates when you leave a cell/i);
  });

  it("does not touch save, pending, or sync paths", () => {
    const syncFn = PAGE.slice(PAGE.indexOf("const syncToServer = useCallback"), PAGE.indexOf("const syncToServer = useCallback") + 2500);
    expect(syncFn).not.toMatch(/rankMode|rankSnap/);
    const update = PAGE.slice(PAGE.indexOf("const updateScore = useCallback"), PAGE.indexOf("const updateNotes = useCallback"));
    expect(update).not.toMatch(/rankMode|rankSnap/);
  });
});
