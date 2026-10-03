import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Carrying a jersey number forward between sessions was gated on
// eval_format = 'round_robin'. Nothing about the behaviour needs a tournament:
// a house player wears the same number all weekend too. VMHA U11 M is the
// evidence -- 26 numbers entered in session 1, 25 in session 2, 16 in session
// 3, the door re-typing them each skate and losing ground every time.
const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const API = strip(read("src/app/api/checkin/[scheduleId]/route.js"));
const DASH = strip(read("src/components/CategoryDashboard.jsx"));

describe("sticky jersey numbers work in any format", () => {
  it("the prefill is gated on the setting alone, not the format", () => {
    expect(API).toMatch(/if \(sched\.sticky_jersey_numbers && athletes\.length\) \{/);
    expect(API).not.toMatch(/eval_format === "round_robin" && sched\.sticky_jersey_numbers/);
  });

  it("the toggle is offered to every category", () => {
    const at = DASH.indexOf("Carry jersey numbers between sessions");
    expect(at).toBeGreaterThan(-1);
    // Nothing between the preceding block's close and the card may re-introduce
    // a tournament-only condition.
    const before = DASH.slice(Math.max(0, at - 400), at);
    expect(before).not.toMatch(/isTournament && \($/m);
  });

  it("still only pre-fills -- never overwrites a number or a checked-in player", () => {
    const block = API.slice(API.indexOf("sticky_jersey_numbers && athletes.length"), API.indexOf("sticky_jersey_numbers && athletes.length") + 1800);
    expect(block).toMatch(/!a\.jersey_number && !a\.checked_in/);
    expect(block).toMatch(/jersey_number IS NULL AND checked_in IS NOT TRUE/);
  });

  it("only looks at EARLIER sessions, most recent first", () => {
    const block = API.slice(API.indexOf("sticky_jersey_numbers && athletes.length"), API.indexOf("sticky_jersey_numbers && athletes.length") + 1800);
    expect(block).toMatch(/es\.session_number < \$\{sched\.session_number\}/);
    expect(block).toMatch(/ORDER BY pc\.athlete_id, es\.session_number DESC/);
  });
});
