import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Arena names are shown, never stored. arenaLabel() is a read-only formatter
// applied where a location reaches a person -- emails, the evaluator
// dashboard, the door screen, calendar files. The schedule keeps the codes
// associations type; the grid, imports and any comparison of locations still
// see exactly what was entered.

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");

const HUMAN_FACING = [
  "src/lib/scheduleNotify.js",                                  // change notices, spot-fill, connecting sessions
  "src/app/api/cron/route.js",                                  // session reminder
  "src/app/api/evaluator/signup/route.js",                      // confirmation
  "src/app/api/schedule/[scheduleId]/roster/route.js",          // assigned / removed
  "src/app/api/categories/[catId]/group-emails/route.js",       // parents
  "src/app/api/service-provider/notify/route.js",               // manual blasts
  "src/lib/calendar.js",                                        // ICS feed
  "src/app/evaluator/dashboard/page.jsx",                       // evaluator sessions
  "src/app/checkin/[scheduleId]/page.jsx",                      // door screen
];

describe("every place a location reaches a person uses arenaLabel", () => {
  for (const f of HUMAN_FACING) {
    it(f, () => {
      const src = read(f);
      expect(src).toMatch(/import \{ arenaLabel \} from "@\/lib\/arenas"/);
      expect(src).toMatch(/arenaLabel\(/);
    });
  }
});

describe("no location is ever written back through arenaLabel", () => {
  it("no INSERT or UPDATE anywhere carries an arenaLabel value", () => {
    const all = HUMAN_FACING.map(read).join("\n");
    // Any SQL statement text that mentions arenaLabel would be a write.
    const sqlBlocks = all.match(/sql`[\s\S]*?`/g) || [];
    for (const b of sqlBlocks) expect(b).not.toMatch(/arenaLabel/);
  });

  it("the schedule import and schedule grid do not format locations", () => {
    for (const f of [
      "src/app/api/categories/[catId]/schedule/route.js",
      "src/lib/smartSchedule.js",
      "src/components/SmartScheduleImport.jsx",
      "src/components/ScheduleBoard.jsx",
    ]) {
      try { expect(read(f)).not.toMatch(/arenaLabel/); } catch (e) { if (e.code !== "ENOENT") throw e; }
    }
  });

  it("the connecting-session match still compares raw locations", () => {
    const src = read("src/lib/scheduleNotify.js");
    // The SELECT that finds a session at the same rink reads the column itself.
    expect(src).toMatch(/sb\.location AS other_location/);
  });
});
