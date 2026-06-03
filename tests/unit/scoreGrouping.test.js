import { describe, it, expect } from "vitest";
import { groupDetailedScores } from "@/lib/scoreGrouping";

const row = (over = {}) => ({
  athlete_id: 1,
  first_name: "Sam",
  last_name: "Jones",
  jersey_number: 7,
  session_number: 1,
  evaluator_id: 10,
  evaluator_name: "Coach A",
  scoring_category_id: 100,
  category_name: "Skating",
  score: "8.5",
  ...over,
});

describe("groupDetailedScores", () => {
  it("returns an empty array for no rows", () => {
    expect(groupDetailedScores([])).toEqual([]);
    expect(groupDetailedScores(undefined)).toEqual([]);
    expect(groupDetailedScores(null)).toEqual([]);
  });

  it("nests athlete → session → evaluator → score", () => {
    const [athlete] = groupDetailedScores([row()]);
    expect(athlete.id).toBe(1);
    expect(athlete.name).toBe("Sam Jones");
    expect(athlete.jersey).toBe(7);
    expect(athlete.sessions[1][10].evaluator_name).toBe("Coach A");
    expect(athlete.sessions[1][10].scores[100]).toEqual({ score: 8.5, category_name: "Skating" });
  });

  it("parses the score string into a number", () => {
    const [athlete] = groupDetailedScores([row({ score: "6" })]);
    expect(athlete.sessions[1][10].scores[100].score).toBe(6);
  });

  it("groups multiple categories under the same evaluator", () => {
    const [athlete] = groupDetailedScores([
      row({ scoring_category_id: 100, category_name: "Skating", score: "8" }),
      row({ scoring_category_id: 200, category_name: "Shooting", score: "5" }),
    ]);
    const ev = athlete.sessions[1][10];
    expect(Object.keys(ev.scores)).toHaveLength(2);
    expect(ev.scores[100].score).toBe(8);
    expect(ev.scores[200].score).toBe(5);
  });

  it("keeps two evaluators in the same session separate", () => {
    const [athlete] = groupDetailedScores([
      row({ evaluator_id: 10, evaluator_name: "Coach A", score: "9" }),
      row({ evaluator_id: 11, evaluator_name: "Coach B", score: "4" }),
    ]);
    expect(Object.keys(athlete.sessions[1])).toEqual(["10", "11"]);
    expect(athlete.sessions[1][11].scores[100].score).toBe(4);
  });

  it("keeps separate sessions for one athlete", () => {
    const [athlete] = groupDetailedScores([
      row({ session_number: 1, score: "8" }),
      row({ session_number: 2, score: "6" }),
    ]);
    expect(Object.keys(athlete.sessions)).toEqual(["1", "2"]);
  });

  it("separates distinct athletes", () => {
    const grouped = groupDetailedScores([
      row({ athlete_id: 1, first_name: "Sam" }),
      row({ athlete_id: 2, first_name: "Alex" }),
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped.map(a => a.id).sort()).toEqual([1, 2]);
  });
});
