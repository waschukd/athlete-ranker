import { describe, it, expect } from "vitest";
import { contiguousBlock } from "@/lib/sessionBlocks";

// available sessions all at Beaumont (org 37), one Saturday, "Castledowns"
const s = (id, start, end, extra = {}) => ({ schedule_id: id, org_id: 37, scheduled_date: "2026-09-12", location: "Castledowns", start_time: start, end_time: end, ...extra });

describe("contiguousBlock", () => {
  it("groups a run of ≤30-min-gap sessions at the same rink/day/assoc", () => {
    const avail = [s(1, "08:00", "08:45"), s(2, "08:45", "09:30"), s(3, "09:45", "10:30")];
    const block = contiguousBlock(s(1, "08:00", "08:45"), avail);
    expect(block.map(b => b.schedule_id)).toEqual([1, 2, 3]); // 0 and 15 min gaps
  });

  it("stops at a gap larger than 30 minutes", () => {
    const avail = [s(1, "08:00", "09:00"), s(2, "09:15", "10:15"), s(3, "14:00", "15:00")];
    // 15-min gap keeps 1&2 together; the 2pm session is hours later.
    expect(contiguousBlock(s(1, "08:00", "09:00"), avail).map(b => b.schedule_id)).toEqual([1, 2]);
    // clicking the lone afternoon one yields just itself.
    expect(contiguousBlock(s(3, "14:00", "15:00"), avail).map(b => b.schedule_id)).toEqual([3]);
  });

  it("expands both directions from the clicked session", () => {
    const avail = [s(1, "08:00", "09:00"), s(2, "09:15", "10:15"), s(3, "10:30", "11:30")];
    expect(contiguousBlock(s(2, "09:15", "10:15"), avail).map(b => b.schedule_id)).toEqual([1, 2, 3]);
  });

  it("does not group across different rinks or days or associations", () => {
    const avail = [
      s(1, "08:00", "09:00"),
      s(2, "09:15", "10:15", { location: "Glengarry" }),   // different rink
      s(3, "09:15", "10:15", { scheduled_date: "2026-09-13" }), // different day
      s(4, "09:15", "10:15", { org_id: 38 }),                // different assoc
    ];
    expect(contiguousBlock(s(1, "08:00", "09:00"), avail).map(b => b.schedule_id)).toEqual([1]);
  });

  it("returns just the clicked session when nothing is adjacent", () => {
    expect(contiguousBlock(s(9, "08:00", "09:00"), []).map(b => b.schedule_id)).toEqual([9]);
  });

  it("treats overlapping sessions (negative gap) as contiguous", () => {
    // Two groups running the same slot at one rink still count as a block.
    const avail = [s(1, "08:00", "09:00"), s(2, "08:00", "09:00")];
    expect(contiguousBlock(s(1, "08:00", "09:00"), avail).map(b => b.schedule_id).sort()).toEqual([1, 2]);
  });
});
