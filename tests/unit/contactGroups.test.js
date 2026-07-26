import { describe, it, expect } from "vitest";
import { partitionByContact, splitIsActive } from "@/lib/contactGroups.js";

const groups5 = [1, 2, 3, 4, 5].map(n => ({ group_number: n }));

// 10 ranked skaters, rank 1 (best) → rank 10. Mark a few non-contact.
const ranked = [
  { id: "a1", non_contact: false }, // rank 1  (best overall)
  { id: "a2", non_contact: true },  // rank 2  — non-contact despite high rank
  { id: "a3", non_contact: false },
  { id: "a4", non_contact: false },
  { id: "a5", non_contact: true },
  { id: "a6", non_contact: false },
  { id: "a7", non_contact: true },
  { id: "a8", non_contact: false },
  { id: "a9", non_contact: true },
  { id: "a10", non_contact: false },
];

describe("splitIsActive", () => {
  it("off when boundary is 0/null", () => {
    expect(splitIsActive(groups5, 0)).toBe(false);
    expect(splitIsActive(groups5, null)).toBe(false);
  });
  it("off when the boundary leaves no non-contact groups", () => {
    expect(splitIsActive(groups5, 5)).toBe(false); // all groups contact
  });
  it("on when both sides have groups", () => {
    expect(splitIsActive(groups5, 2)).toBe(true);
  });
});

describe("partitionByContact — groups 1-2 contact, 3-5 non-contact", () => {
  const res = partitionByContact(ranked, groups5, 2);
  const groupOf = (id) => res.find(r => r.athlete_id === id).group_index; // 0-based idx

  it("returns null when split inactive", () => {
    expect(partitionByContact(ranked, groups5, 0)).toBe(null);
  });

  it("places every skater exactly once", () => {
    expect(res).toHaveLength(ranked.length);
    expect(new Set(res.map(r => r.athlete_id)).size).toBe(ranked.length);
  });

  it("keeps contact players in groups 1-2 (index 0-1)", () => {
    for (const a of ranked.filter(x => !x.non_contact)) {
      expect(groupOf(a.id)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps non-contact players in groups 3-5 (index 2-4), never contact groups", () => {
    for (const a of ranked.filter(x => x.non_contact)) {
      expect(groupOf(a.id)).toBeGreaterThanOrEqual(2);
    }
  });

  it("puts the top non-contact player at the top of group 3 (index 2)", () => {
    // a2 is the highest-ranked non-contact player → first non-contact group.
    expect(groupOf("a2")).toBe(2);
  });

  it("a high-ranked non-contact player outranks a lower contact player but still sits below in group number", () => {
    // a2 (rank 2, non-contact) is in group 3; a3 (rank 3, contact) is in group 1-2.
    expect(groupOf("a2")).toBeGreaterThan(groupOf("a3"));
  });
});
