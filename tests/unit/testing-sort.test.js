import { describe, it, expect } from "vitest";
import { sortTestingAthletes, nextSort, indexTestingByAthlete } from "@/lib/testingSort";

// Sorting a testing table is not cosmetic: whoever sits at the top reads as the
// fastest. The trap is the athlete with no value for the column -- treat a
// missing drill as 0 and every kid who never skated it leads the "fastest"
// list, which is exactly how a page of dashes ended up above real results.

const A = (id, first, last, rank, tests) => ({
  athlete_id: id, first_name: first, last_name: last, overall_rank: rank, tests,
});
const t = (name, value, rank) => ({ test_name: name, value, rank });

const ROSTER = [
  A(1, "Ada", "Young", 3, [t("30M Forward", 6.5, 30), t("Weave", 20.1, 12)]),
  A(2, "Bea", "Novak", 1, [t("30M Forward", 5.9, 4), t("Weave", 22.4, 40)]),
  A(3, "Cal", "Adler", 2, [t("Weave", 19.0, 2)]),            // no 30M Forward
];

describe("sortTestingAthletes", () => {
  it("defaults to overall rank, best first", () => {
    const out = sortTestingAthletes(ROSTER, { key: "rank", dir: "asc" });
    expect(out.map(a => a.overall_rank)).toEqual([1, 2, 3]);
  });

  it("sorts by a drill's value, fastest first", () => {
    const out = sortTestingAthletes(ROSTER, { key: "30M Forward", dir: "asc" });
    expect(out.map(a => a.athlete_id)).toEqual([2, 1, 3]);
  });

  it("keeps athletes with no value for that drill at the bottom when descending", () => {
    // The whole point: Cal has no 30M Forward and must not lead either order.
    const out = sortTestingAthletes(ROSTER, { key: "30M Forward", dir: "desc" });
    expect(out.map(a => a.athlete_id)).toEqual([1, 2, 3]);
    expect(out[out.length - 1].athlete_id).toBe(3);
  });

  it("sorts by a drill's rank when asked for the rank field", () => {
    const out = sortTestingAthletes(ROSTER, { key: "Weave", dir: "asc", field: "rank" });
    expect(out.map(a => a.athlete_id)).toEqual([3, 1, 2]);
  });

  it("sorts by name, last name first", () => {
    const out = sortTestingAthletes(ROSTER, { key: "name", dir: "asc" });
    expect(out.map(a => a.last_name)).toEqual(["Adler", "Novak", "Young"]);
    const desc = sortTestingAthletes(ROSTER, { key: "name", dir: "desc" });
    expect(desc.map(a => a.last_name)).toEqual(["Young", "Novak", "Adler"]);
  });

  it("breaks a tie on overall rank so the order never wobbles", () => {
    const tied = [
      A(1, "One", "X", 9, [t("Sprint", 5.0, 1)]),
      A(2, "Two", "Y", 4, [t("Sprint", 5.0, 1)]),
    ];
    expect(sortTestingAthletes(tied, { key: "Sprint", dir: "asc" }).map(a => a.athlete_id)).toEqual([2, 1]);
  });

  it("does not mutate the array it was given", () => {
    const copy = [...ROSTER];
    sortTestingAthletes(ROSTER, { key: "name", dir: "desc" });
    expect(ROSTER).toEqual(copy);
  });

  it("survives an athlete with no tests at all", () => {
    const out = sortTestingAthletes([...ROSTER, A(4, "Dee", "Bell", 4, [])], { key: "30M Forward", dir: "asc" });
    expect(out.map(a => a.athlete_id)).toEqual([2, 1, 3, 4]);
  });
});

describe("nextSort", () => {
  it("flips direction when the same column is clicked again", () => {
    expect(nextSort({ key: "rank", dir: "asc", field: "value" }, "rank")).toMatchObject({ dir: "desc" });
    expect(nextSort({ key: "rank", dir: "desc", field: "value" }, "rank")).toMatchObject({ dir: "asc" });
  });

  it("starts a new column ascending -- lower time and lower rank are better", () => {
    expect(nextSort({ key: "rank", dir: "desc", field: "value" }, "Weave")).toEqual({ key: "Weave", field: "value", dir: "asc" });
  });

  it("treats value and rank on the same drill as different columns", () => {
    const cur = { key: "Weave", dir: "asc", field: "value" };
    expect(nextSort(cur, "Weave", "rank")).toEqual({ key: "Weave", field: "rank", dir: "asc" });
  });
});

describe("indexTestingByAthlete", () => {
  const payload = [{
    session_number: 1,
    test_names: ["30M Forward", "Weave"],
    athletes: ROSTER,
  }];

  it("gives each athlete their own rank and drills", () => {
    const idx = indexTestingByAthlete(payload);
    expect(idx.get(2).sessions[0]).toMatchObject({ session_number: 1, overall_rank: 1, tested: 3 });
    expect(idx.get(2).sessions[0].tests.map(t => t.test_name)).toEqual(["30M Forward", "Weave"]);
  });

  it("reports how many were tested, so a rank reads '1 of 3'", () => {
    expect(indexTestingByAthlete(payload).get(1).sessions[0].tested).toBe(3);
  });

  it("keeps drills in the order they were run, not alphabetically", () => {
    const idx = indexTestingByAthlete([{
      session_number: 1,
      test_names: ["Weave", "30M Forward"],
      athletes: [ROSTER[0]],
    }]);
    expect(idx.get(1).sessions[0].tests.map(t => t.test_name)).toEqual(["Weave", "30M Forward"]);
  });

  it("omits a drill the athlete did not skate rather than showing a blank", () => {
    const idx = indexTestingByAthlete(payload);
    expect(idx.get(3).sessions[0].tests.map(t => t.test_name)).toEqual(["Weave"]);
  });

  it("orders multiple sessions and keeps them separate", () => {
    const idx = indexTestingByAthlete([
      { session_number: 2, test_names: ["Weave"], athletes: [A(1, "Ada", "Young", 5, [t("Weave", 18, 3)])] },
      { session_number: 1, test_names: ["Weave"], athletes: [A(1, "Ada", "Young", 9, [t("Weave", 20, 8)])] },
    ]);
    expect(idx.get(1).sessions.map(s => s.session_number)).toEqual([1, 2]);
    expect(idx.get(1).sessions.map(s => s.overall_rank)).toEqual([9, 5]);
  });

  it("returns an empty index for a category with no testing at all", () => {
    expect(indexTestingByAthlete([]).size).toBe(0);
    expect(indexTestingByAthlete(undefined).size).toBe(0);
  });
});
