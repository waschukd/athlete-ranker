import { describe, it, expect } from "vitest";
import { groupIntoRinkBlocks } from "@/lib/sessionBlocks";

// Real feature request: the Master Schedule's "Needs Evaluators" filter
// should group open sessions by rink into one contact-ready window --
// "are you free from 5 to 8 at Rink X?" -- instead of listing openings one
// session at a time. Deliberately NOT scoped to one association, unlike
// contiguousBlock (used for the Blast button) -- an evaluator being
// recruited doesn't care whose session it is, only the rink and the time.

const e = (start, end, location) => ({ start_time: start, end_time: end, location });

describe("groupIntoRinkBlocks", () => {
  it("merges back-to-back sessions at the same rink into one block", () => {
    const blocks = groupIntoRinkBlocks([
      e("17:00", "18:00", "Rink A"),
      e("18:00", "19:00", "Rink A"),
      e("19:15", "20:15", "Rink A"),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].entries).toHaveLength(3);
  });

  it("splits a block when the gap exceeds the threshold", () => {
    const blocks = groupIntoRinkBlocks([
      e("17:00", "18:00", "Rink A"),
      e("20:00", "21:00", "Rink A"), // 2 hour gap
    ]);
    expect(blocks).toHaveLength(2);
  });

  it("never merges across different rinks, even at the same time", () => {
    const blocks = groupIntoRinkBlocks([
      e("17:00", "18:00", "Rink A"),
      e("17:00", "18:00", "Rink B"),
    ]);
    expect(blocks).toHaveLength(2);
    expect(new Set(blocks.map(b => b.location))).toEqual(new Set(["Rink A", "Rink B"]));
  });

  it("merges across different associations at the same rink -- unlike contiguousBlock", () => {
    // Deliberately no org_id/org_name on these -- the function must not care.
    const blocks = groupIntoRinkBlocks([
      { start_time: "17:00", end_time: "18:00", location: "Rink A", org_id: 1 },
      { start_time: "18:00", end_time: "19:00", location: "Rink A", org_id: 2 },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].entries).toHaveLength(2);
  });

  it("treats location case/whitespace variants as the same rink", () => {
    const blocks = groupIntoRinkBlocks([
      e("17:00", "18:00", "Rink A"),
      e("18:00", "19:00", " rink a "),
    ]);
    expect(blocks).toHaveLength(1);
  });

  it("sorts blocks by start time", () => {
    const blocks = groupIntoRinkBlocks([
      e("19:00", "20:00", "Rink B"),
      e("17:00", "18:00", "Rink A"),
    ]);
    expect(blocks[0].location).toBe("Rink A");
    expect(blocks[1].location).toBe("Rink B");
  });
});
