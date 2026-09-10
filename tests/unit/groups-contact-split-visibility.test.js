import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Real complaint: SEERA U15 (and every U15+ category that splits into contact
// / non-contact groups) had no way to see which players were BC vs Non-BC
// while building groups by hand -- the split had to be done blind or by
// cross-checking a separate spreadsheet, even though athletes.non_contact
// already exists and already drives auto-assign (lib/contactGroups.js).
//
// This just surfaces that existing flag on the Manage Groups screen: the API
// has to select it for every bucket a player can appear in, and the page has
// to render it, gated on the category actually being configured for the
// split (contact_groups / non_contact_groups set) so it doesn't clutter
// every other category's groups screen.

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const API = read("src/app/api/categories/[catId]/groups/route.js");
const PAGE = read("src/app/association/dashboard/category/[catId]/groups/page.jsx");

describe("Manage Groups surfaces contact vs non-contact status", () => {
  it("the API selects non_contact for every assigned player (both queries)", () => {
    const assignmentQueries = API.split("pga.id as assignment_id").slice(1);
    expect(assignmentQueries.length).toBe(2);
    for (const q of assignmentQueries) {
      expect(q.slice(0, q.indexOf("FROM player_group_assignments"))).toMatch(/a\.non_contact/);
    }
  });

  it("the API selects non_contact for unassigned skaters too", () => {
    expect(API).toMatch(/SELECT a\.id, a\.first_name, a\.last_name, a\.external_id, a\.position, a\.helmet_number, a\.non_contact/);
  });

  it("gates the badge on real athlete data, not age_categories.contact_groups/non_contact_groups", () => {
    // Those two config fields only set auto-assign's group COUNTS and are
    // frequently null even when a category genuinely tracks the split
    // (SEERA U15: 45 non-contact athletes, both fields null) -- gating on
    // them would have hidden the badge for the exact association that asked
    // for it.
    expect(PAGE).toMatch(/hasContactSplit\s*=\s*assignments\.some\(a => a\.non_contact\)/);
  });

  it("the page renders a BC/NC badge keyed off player.non_contact", () => {
    expect(PAGE).toMatch(/hasContactSplit && \(/);
    expect(PAGE).toMatch(/player\.non_contact \? "NC" : "BC"/);
  });
});
