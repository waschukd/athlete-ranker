import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A session is not always two sides. VMHA U13 runs three tournament teams but
// only two skills groups, and wanted every player in the jersey they will wear
// for the games -- three colours on an ice sheet with two groups.
//
// checkin_sessions.team_colors has always stored 2-6 and the API has always
// validated that range; both pickers simply mapped over the stored array with
// no way to add or drop a slot, so every session was stuck at the two it was
// created with.
const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const GROUPS = read("src/app/association/dashboard/category/[catId]/groups/page.jsx");
const DOOR = read("src/app/checkin/[scheduleId]/page.jsx");
const API = read("src/app/api/checkin/[scheduleId]/route.js");

describe("the session palette can grow past two colours", () => {
  it("the API bounds are 2 to 6", () => {
    expect(API).toMatch(/incoming\.length < 2/);
    expect(API).toMatch(/incoming\.length > 6/);
  });

  for (const [name, src, state] of [["Manage Groups", GROUPS, "groupPalette"], ["check-in door", DOOR, "teamColors"]]) {
    it(`${name}: offers an add control, capped at the API's six`, () => {
      expect(src).toMatch(new RegExp(`${state}\.length < 6`));
      expect(src).toMatch(/\+ Add colour/);
    });

    it(`${name}: offers a remove control, floored at the API's two`, () => {
      expect(src).toMatch(new RegExp(`${state}\.length > 2`));
    });

    it(`${name}: a new slot takes a colour not already in use`, () => {
      // Picking an already-used preset would render two teams identically.
      expect(src).toMatch(/PRESET_TEAM_COLORS\.find\(p => !\w+\.some\(c => c\.name\.toLowerCase\(\) === p\.name\.toLowerCase\(\)\)\)/);
    });
  }
});
