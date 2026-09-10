import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Confederation uses Sideline Star for scheduling only -- CT staffs the skates,
// no scores are ever entered. Their evaluators could not close a session at all:
// "Save & Close" requires every checked-in athlete to be scored or excused, and
// with no data there is nothing that satisfies it, so sessions sat open forever.
//
// The dangerous version of this feature closes sessions everywhere. An
// association that actually scores must never have a session closed out from
// under an evaluator who is still working, so it is opt-in per organization and
// keyed to the session's own end time in Mountain local.

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CRON = strip(read("src/app/api/cron/route.js"));
const JOB = CRON.slice(CRON.indexOf('job === "auto_close"'), CRON.indexOf('job === "auto_close"') + 1800);
const VERCEL = JSON.parse(read("vercel.json"));

describe("auto-close is opt-in per organization", () => {
  it("only touches orgs with the flag set", () => {
    expect(JOB).toMatch(/COALESCE\(o\.auto_close_sessions, false\) = true/);
  });

  it("defaults to false, so enabling it is always a deliberate act", () => {
    const script = read("scripts/enable-auto-close.mjs");
    expect(script).toMatch(/ADD COLUMN IF NOT EXISTS auto_close_sessions BOOLEAN NOT NULL DEFAULT false/);
  });

  it("can be turned back off without a deploy", () => {
    expect(read("scripts/enable-auto-close.mjs")).toMatch(/--off/);
  });
});

describe("it only closes sessions that have actually ended", () => {
  it("compares the session's end time to now", () => {
    expect(JOB).toMatch(/COALESCE\(es\.end_time, es\.start_time\)/);
    expect(JOB).toMatch(/<= NOW\(\)/);
  });

  it("reads the wall-clock time as Mountain local, not as UTC", () => {
    // scheduled_date + end_time is a naive timestamp. Comparing it to NOW()
    // directly would be an hour out for half the season and six or seven hours
    // out year-round -- closing sessions before they start.
    expect(JOB).toMatch(/AT TIME ZONE 'America\/Edmonton'/);
  });

  it("falls back to start_time when a session has no end time", () => {
    expect(JOB).toMatch(/COALESCE\(es\.end_time, es\.start_time\)/);
  });

  it("skips cancelled sessions and already-closed sign-ups", () => {
    expect(JOB).toMatch(/ess\.closed_at IS NULL/);
    expect(JOB).toMatch(/es\.status = 'scheduled'/);
    expect(JOB).toMatch(/ess\.status = 'signed_up'/);
  });
});

describe("the close is attributed honestly", () => {
  it("leaves closed_by NULL -- the clock closed it, not a person", () => {
    expect(JOB).toMatch(/SET closed_at = NOW\(\)/);
    expect(JOB).not.toMatch(/closed_by =/);
  });

  it("reports how many it closed", () => {
    expect(JOB).toMatch(/closed: closed\.length/);
  });
});

describe("it is scheduled often enough to be useful", () => {
  it("is registered as a cron job", () => {
    const c = VERCEL.crons.find(x => x.path.includes("auto_close"));
    expect(c).toBeTruthy();
  });

  it("runs well inside the hour, so a skate ending at :45 does not wait", () => {
    const c = VERCEL.crons.find(x => x.path.includes("auto_close"));
    expect(c.schedule).toBe("*/15 * * * *");
  });

  it("did not disturb the existing jobs", () => {
    const paths = VERCEL.crons.map(c => c.path);
    for (const j of ["weekly_report", "daily_alert", "session_reminder"]) {
      expect(paths.some(p => p.includes(j)), j).toBe(true);
    }
  });
});
