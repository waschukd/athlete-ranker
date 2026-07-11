import { describe, it, expect } from "vitest";
import { scheduleFromColumns } from "@/lib/bulkSchedule.js";

const grid = [
  ["# explainer row"],
  ["Division", "Format", "Session #", "Group/Matchup", "Type", "Date", "Start Time", "End Time", "Location", "Player Evaluators", "Goalie Evaluators"],
  ["U11 AA", "Tournament", "1", "A vs B", "", "2026-09-19", "17:30", "18:30", "Rink A", "4", "1"],
  ["U13 House", "Standard", "1", "2", "Scrimmage", "2026-09-09", "18:00", "19:15", "Rink B", "4", "0"],
];

describe("scheduleFromColumns — format-aware", () => {
  const rows = scheduleFromColumns(grid);
  it("parses a Tournament row's matchup + format", () => {
    const t = rows.find(r => r.division === "U11 AA");
    expect(t.eval_format).toBe("round_robin");
    expect(t.matchup).toBe("A vs B");
    expect(t.session_number).toBe(1);
    expect(t.group_number).toBe(null);
    expect(t.date).toBe("2026-09-19");
  });
  it("parses a Standard row's group number", () => {
    const s = rows.find(r => r.division === "U13 House");
    expect(s.eval_format).toBe("standard");
    expect(s.matchup).toBe(null);
    expect(s.group_number).toBe(2);
    expect(s.session_number).toBe(1);
  });
  it("returns null with no Division column", () => {
    expect(scheduleFromColumns([["Date", "Time"], ["2026-01-01", "09:00"]])).toBe(null);
  });
});
