import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The upload wrote one INSERT per test value through a single Promise.all --
// 1,250 statements for a 125-athlete file -- inside a catch that only
// console.log'd. When the batch died partway the route STILL returned success:
// every overall rank landed, most values landed, and the tail of the alphabet
// had none. EFHA U11 and U13 both stopped at exactly 1,001 values, and it only
// surfaced when a parent report came back as a page of dashes.
//
// Two properties matter and neither is about how many rows fit: the write is a
// single statement that cannot half-succeed, and a failure is never silent.

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const ROUTE = read("src/app/api/categories/[catId]/testing-upload/route.js");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SRC = strip(ROUTE);

describe("testing upload writes in bulk, not row by row", () => {
  it("does not fan out one statement per row", () => {
    // The exact shape that truncated: a Promise.all over a mapped array of sql``.
    expect(SRC).not.toMatch(/Promise\.all\(\s*matched\.map/);
    expect(SRC).not.toMatch(/Promise\.all\(testUpserts\)/);
  });

  it("expands arrays with unnest so each table is one round trip", () => {
    const unnests = SRC.match(/unnest\(/g) || [];
    expect(unnests.length).toBe(2); // testing_drill_results + testing_results
  });

  it("de-duplicates on the conflict key before inserting", () => {
    // Postgres refuses an ON CONFLICT statement that hits the same row twice.
    // A repeated athlete or two identically-named columns would otherwise take
    // the entire upload down -- worse than the bug being fixed.
    expect(SRC).toMatch(/rankByAthlete/);
    expect(SRC).toMatch(/byKey\.set\(/);
  });

  it("uses EXCLUDED rather than re-binding each value in the update", () => {
    expect(SRC).toMatch(/DO UPDATE SET overall_rank = EXCLUDED\.overall_rank/);
    expect(SRC).toMatch(/DO UPDATE SET value = EXCLUDED\.value/);
  });

  it("casts ids to numbers, since one bad element fails the whole array", () => {
    expect(SRC).toMatch(/const CAT = Number\(catId\)/);
    expect(SRC).toMatch(/const SESS = Number\(session_number\)/);
  });
});

describe("a failed write is never reported as success", () => {
  it("surfaces the error to the caller instead of only logging it", () => {
    expect(SRC).toMatch(/tests_error: testError/);
    expect(SRC).toMatch(/testError = e\?\.message/);
  });

  it("reports how many values were expected alongside how many stored", () => {
    // Equal counts are the caller's proof the write was complete.
    expect(SRC).toMatch(/tests_stored: testsStored/);
    expect(SRC).toMatch(/tests_expected: vals\.length/);
  });
});

describe("repeated Rank columns are not mistaken for drills", () => {
  const DASH = strip(read("src/components/CategoryDashboard.jsx"));

  it("recognises the Rank.N form Excel produces for a repeated header", () => {
    // Sheets renames duplicate "Rank" headers to Rank.1, Rank.2 ... so an exact
    // === 'rank' check stops matching partway along the row, and the rest were
    // uploaded as drills named "Rank.4", "Rank.5", "Rank.6".
    expect(DASH).toMatch(/isRankCol/);
    const m = DASH.match(/const isRankCol = \(h\) => (\/[^;]+\/)\.test/);
    expect(m).toBeTruthy();
    const re = new RegExp(m[1].slice(1, -1));
    for (const h of ["rank", "rank.1", "rank.4", "rank.12"]) expect(re.test(h)).toBe(true);
    for (const h of ["30m forward", "overall rank", "ranking", "stop and start"]) expect(re.test(h)).toBe(false);
  });

  it("uses it for both the skip and the paired-rank lookup", () => {
    expect(DASH).toMatch(/\|\| isRankCol\(h\) \|\|/);
    expect(DASH).toMatch(/rankIdx: isRankCol\(lower\[i \+ 1\]\)/);
  });
});
