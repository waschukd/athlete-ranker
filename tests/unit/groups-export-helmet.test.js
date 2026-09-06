import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// BAHA identifies skaters by the helmet sticker, not the jersey: the sticker
// stays with the kid across every session, the jersey number does not. Their
// group lists are printed and handed to volunteers at the door, so a list
// without the helmet number cannot be used to find a player.
//
// The number has to survive the whole path -- the API has to select it, the CSV
// has to carry it, and the printed sheet has to show it. A break anywhere leaves
// a blank column, which reads as "this kid has no sticker" rather than as a bug.

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const API = read("src/app/api/categories/[catId]/groups/route.js");
const PAGE = read("src/app/association/dashboard/category/[catId]/groups/page.jsx");

describe("group export carries the helmet number", () => {
  it("the API selects it for every assigned player", () => {
    // Two queries: one scoped to a session, one for all sessions. Both matter --
    // the page uses the session-scoped one, and missing it in the other would
    // show up only later.
    const assignmentQueries = API.split("pga.id as assignment_id").slice(1);
    expect(assignmentQueries.length).toBe(2);
    for (const q of assignmentQueries) {
      // Check within the query itself, not the whole file -- the unassigned
      // buckets select a similar column list further down.
      expect(q.slice(0, q.indexOf("FROM player_group_assignments"))).toMatch(/a\.helmet_number/);
    }
  });

  it("the API selects it for unassigned goalies and skaters too", () => {
    // A player dragged in from either bucket must carry the same identifier the
    // rest of the list shows.
    expect(API).toMatch(/SELECT a\.id, a\.first_name, a\.last_name, a\.external_id, a\.helmet_number/);
    expect(API).toMatch(/SELECT a\.id, a\.first_name, a\.last_name, a\.external_id, a\.position, a\.helmet_number/);
  });

  it("the CSV has a Helmet heading", () => {
    expect(PAGE).toMatch(/'Last Name','First Name','Helmet','ID','Position'/);
  });

  it("the CSV writes the value in the matching position", () => {
    // Heading and value must line up: a shifted column silently puts helmet
    // numbers under "ID".
    const header = PAGE.match(/const rows = \[\[(.*?)\]\];/s)[1].split(",").map(s => s.trim().replace(/'/g, ""));
    const rowCall = PAGE.match(/rows\.push\(\[(.*?)\]\);/s)[1];
    const cells = rowCall.split(/,(?![^(]*\))/).map(s => s.trim());
    expect(header.length).toBe(cells.length);
    expect(cells[header.indexOf("Helmet")]).toMatch(/helmet_number/);
  });

  it("the printed sheet shows it as well -- that is the copy posted at the rink", () => {
    expect(PAGE).toMatch(/<th>First Name<\/th><th>Helmet<\/th>/);
    expect(PAGE).toMatch(/\(pl\.helmet_number\|\|'-'\)/);
  });

  it("a missing helmet number renders blank, never 'undefined'", () => {
    expect(PAGE).toMatch(/player\.helmet_number \|\| ''/);
  });
});
